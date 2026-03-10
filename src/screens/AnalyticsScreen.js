import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { LineChart } from "react-native-chart-kit";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../context/ThemeContext";
import { getEntries } from "../services/storageService";
import {
  deleteActivityCalendarEntry,
  getActivityCalendarEntries,
  upsertActivityCalendarEntry,
} from "../services/activityCalendarService";
import {
  calculateDailyAverage,
  calculateSlotAverage,
  calculateStabilityFromSeries,
} from "../utils/analyticsCalculations";
import {
  filterEntriesByRange,
  formatRangeLabel,
  getDateRange,
  getHalfYearRange,
  shiftReferenceDate,
} from "../utils/analyticsRange";
import { formatLongDate, toDateKey } from "../utils/date";

const VIEW_OPTIONS = [
  { key: "analytics", label: "Analytics" },
  { key: "calendar", label: "Streak Calendar" },
];

const BASE_FILTERS = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "halfyear", label: "Half Year" },
  { key: "custom", label: "Custom" },
];

const CALENDAR_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const PRODUCTIVITY_LEVELS = [
  {
    value: 0,
    label: "0 / Grey",
    subtitle: "No productivity log",
    color: "#9CA3AF",
    textColor: "#0F172A",
  },
  {
    value: 1,
    label: "1 / Yellow",
    subtitle: "Some progress",
    color: "#FACC15",
    textColor: "#0F172A",
  },
  {
    value: 2,
    label: "2 / Light Green",
    subtitle: "Good output",
    color: "#86EFAC",
    textColor: "#14532D",
  },
  {
    value: 3,
    label: "3 / Dark Green",
    subtitle: "Locked in",
    color: "#166534",
    textColor: "#FFFFFF",
  },
];

const PRIVATE_LEVELS = [
  {
    value: 0,
    label: "0 / Silver",
    subtitle: "Calm day",
    color: "#C0C0C0",
    textColor: "#111111",
  },
  {
    value: 1,
    label: "1 / Pink",
    subtitle: "Teasing",
    color: "#FF8FB1",
    textColor: "#4A1022",
  },
  {
    value: 2,
    label: "2 / Dark Pink",
    subtitle: "Naughty",
    color: "#C2185B",
    textColor: "#FFFFFF",
  },
  {
    value: 3,
    label: "3 / Dark Red",
    subtitle: "Off the rails",
    color: "#7A0019",
    textColor: "#FFFFFF",
  },
];

const PUBLIC_SCORE_FAQ = [
  {
    key: "stability",
    title: "Stability Score",
    description:
      "How steady your mood has been across the selected period. Higher is steadier.",
  },
  {
    key: "variability",
    title: "Variability",
    description:
      "How much your mood swings up and down. Higher means larger fluctuations.",
  },
  {
    key: "trend",
    title: "Trend Direction",
    description:
      "Change from early period to latest period. Positive means improving, negative means declining.",
  },
  {
    key: "recovery",
    title: "Recovery Score",
    description:
      "How quickly mood returns to neutral/positive after low states. Higher means faster recovery.",
  },
  {
    key: "peak",
    title: "Peak Intensity",
    description:
      "Strongest emotional intensity reached, regardless of positive or negative direction.",
  },
  {
    key: "balance",
    title: "Emotional Balance",
    description: "Share of positive entries in the selected period.",
  },
  {
    key: "momentum",
    title: "Momentum (Last 3)",
    description:
      "Recent direction based on your last three points. Positive means recent uplift.",
  },
  {
    key: "resilience",
    title: "Resilience",
    description: "Combined indicator of recovery speed, trend, and stability.",
  },
];

const PRIVATE_SCORE_FAQ = [
  {
    key: "stability",
    title: "Arousal Stability",
    description:
      "How consistent your horny level has been during the period. Higher = more reliably charged (less random flat days).",
  },
  {
    key: "variability",
    title: "Arousal Swing",
    description:
      "How wildly your horniness fluctuates. Higher = bigger ups & downs (explosive highs + dead lows).",
  },
  {
    key: "trend",
    title: "Desire Trend",
    description:
      "Direction of change from start to end of period. Positive = libido / arousal rising over time, negative = fading.",
  },
  {
    key: "recovery",
    title: "Refractory Recovery",
    description:
      "How fast you bounce back to horny/ready after a low or flat period. Higher = shorter downtime between strong sessions.",
  },
  {
    key: "peak",
    title: "Peak Charge",
    description:
      "Highest arousal intensity reached in the period (max level logged). Shows your strongest sparks.",
  },
  {
    key: "balance",
    title: "Charged Ratio",
    description:
      "Percentage of entries where you felt properly horny (above threshold, e.g. ≥4/5 or ≥7/10). Higher = more consistently turned on.",
  },
  {
    key: "momentum",
    title: "Recent Heat (Last 3)",
    description:
      "Direction based on your last three logs. Positive = heating up lately, negative = cooling off.",
  },
  {
    key: "resilience",
    title: "Libido Resilience",
    description:
      "Combined signal of how well you maintain / recover arousal momentum despite flat days or stressors.",
  },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

function stdDev(values) {
  if (!values.length) return 0;
  const mean = average(values);
  const variance =
    values.reduce((sum, n) => sum + (n - mean) * (n - mean), 0) / values.length;
  return Math.sqrt(variance);
}

function round2(value) {
  return Number((value || 0).toFixed(2));
}

function scoreToPercent(score) {
  return Math.round(clamp(((score || 0) + 1) * 50, 0, 100));
}

function slotColor(score, isPrivateMode = false) {
  if (isPrivateMode) {
    if (score > 0.2) return "#C2185B";
    if (score < -0.2) return "#C0C0C0";
    return "#FF8FB1";
  }
  if (score > 0.2) return "#22C55E";
  if (score < -0.2) return "#EF4444";
  return "#F59E0B";
}

function scoreLabel(score, isPrivateMode = false) {
  if (isPrivateMode) {
    if (score > 0.2) return "Charged";
    if (score < -0.2) return "Flat";
    return "Teasing";
  }
  if (score > 0.2) return "Positive";
  if (score < -0.2) return "Low";
  return "Neutral";
}

function toEntryScore(entry) {
  if (typeof entry?.score === "number") return entry.score;
  const mood = Number(entry?.mood || 3);
  return (mood - 3) / 2;
}

function toEntryTime(entry) {
  const value =
    entry?.dateISO || entry?.actualLoggedAt || entry?.updatedAt || entry?.date;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

function toSlotLabel(slot) {
  if (slot === "morning") return "M";
  if (slot === "afternoon") return "A";
  if (slot === "evening") return "E";
  if (slot === "night") return "N";
  return "*";
}

function toIsoMonth(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function startOfDay(dateInput) {
  const d = new Date(dateInput);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeekMonday(date) {
  const d = startOfDay(date);
  const day = d.getDay();
  const shift = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - shift);
  return d;
}

function startOfMonth(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getAggregationUnit(filter, range) {
  if (filter === "week") return "day";
  if (filter === "month") return "week";
  if (filter === "halfyear") return "month";
  if (filter !== "custom") return "day";
  const days = Math.max(
    1,
    Math.round((range.end.getTime() - range.start.getTime()) / 86400000) + 1,
  );
  if (days <= 14) return "day";
  if (days <= 120) return "week";
  return "month";
}

function getBucketStart(dateInput, unit) {
  if (unit === "month") return startOfMonth(dateInput);
  if (unit === "week") return startOfWeekMonday(dateInput);
  return startOfDay(dateInput);
}

function advanceBucket(dateInput, unit) {
  const d = new Date(dateInput);
  if (unit === "month") d.setMonth(d.getMonth() + 1);
  else if (unit === "week") d.setDate(d.getDate() + 7);
  else d.setDate(d.getDate() + 1);
  return d;
}

function getBucketKey(dateInput, unit) {
  if (unit === "month") return toIsoMonth(dateInput);
  return toDateKey(dateInput);
}

function getBucketLabel(dateInput, unit) {
  if (unit === "month") {
    return dateInput.toLocaleDateString("en-US", { month: "short" });
  }
  return dateInput.toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
  });
}

function findFallbackValueBeforeDate(
  allEntries,
  dateStartTs,
  isPrivateMode = false,
) {
  const before = (allEntries || [])
    .filter((entry) => {
      const ts = new Date(
        entry.dateISO || entry.actualLoggedAt || entry.updatedAt || entry.date,
      ).getTime();
      return !Number.isNaN(ts) && ts < dateStartTs;
    })
    .sort((a, b) => toEntryTime(b) - toEntryTime(a));
  if (!before.length) return isPrivateMode ? -1 : 0;
  return toEntryScore(before[0]);
}

function hexToRgba(hexColor, opacity = 1) {
  const hex = String(hexColor || "#000000").replace("#", "");
  const safe =
    hex.length === 3
      ? `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
      : hex.padEnd(6, "0");
  const r = Number.parseInt(safe.slice(0, 2), 16);
  const g = Number.parseInt(safe.slice(2, 4), 16);
  const b = Number.parseInt(safe.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function getMoodPalette(averageMoodPercent, isPrivateMode = false) {
  if (isPrivateMode) {
    if (averageMoodPercent >= 80) return ["#8A0F4D", "#C2185B", "#F8BBD0"];
    if (averageMoodPercent >= 50) return ["#FFB6C1", "#FFC1D6", "#FFF0F5"];
    return ["#676565", "#3c2d2d", "#454141"];
  }
  if (averageMoodPercent >= 80) return ["#29e518", "#6ccb7e", "#e3ffea"];
  if (averageMoodPercent >= 50) return ["#f8e61d", "#ffee6e", "#E3E8FF"];
  return ["#fa6d58", "#ff7c6e", "#E3E8FF"];
}

function shiftMonth(date, amount) {
  const next = new Date(date);
  next.setDate(1);
  next.setMonth(next.getMonth() + amount);
  return next;
}

function getCalendarCells(monthDate) {
  const start = startOfMonth(monthDate);
  const daysInMonth = new Date(
    start.getFullYear(),
    start.getMonth() + 1,
    0,
  ).getDate();
  const cells = [];
  for (let i = 0; i < start.getDay(); i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(start.getFullYear(), start.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function getCurrentStreak(logMap) {
  let streak = 0;
  const cursor = startOfDay(new Date());
  while (true) {
    const score = Number(logMap[toDateKey(cursor)]?.score || 0);
    if (score <= 0) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function createMetrics(filteredEntries, slotAverage, isPrivateMode = false) {
  const ordered = [...filteredEntries].sort(
    (a, b) => toEntryTime(a) - toEntryTime(b),
  );
  const scores = ordered.map((entry) => toEntryScore(entry));
  const levels = ordered.map((entry) => Number(entry?.mood || 3));
  const total = scores.length;
  const meanPercent = scoreToPercent(average(scores));
  const averageLevel = round2(average(levels));
  const variability = Math.round(clamp(stdDev(scores) * 100, 0, 100));
  const trend = total >= 2 ? round2(scores[total - 1] - scores[0]) : 0;
  const peakIntensity = round2(
    isPrivateMode
      ? levels.length
        ? Math.max(...levels)
        : 0
      : scores.length
        ? Math.max(...scores.map((s) => Math.abs(s)))
        : 0,
  );
  const balance = Math.round(
    ((isPrivateMode
      ? levels.filter((level) => level >= 4).length
      : scores.filter((s) => s > 0).length) /
      (total || 1)) *
      100,
  );
  const last3 = scores.slice(-3);
  const momentum =
    last3.length >= 2 ? round2(last3[last3.length - 1] - last3[0]) : 0;
  const bestSlot = slotAverage.reduce(
    (best, slot) => (slot.average > best.average ? slot : best),
    slotAverage[0] || { slot: "morning", average: 0 },
  );
  const worstSlot = slotAverage.reduce(
    (worst, slot) => (slot.average < worst.average ? slot : worst),
    slotAverage[0] || { slot: "morning", average: 0 },
  );
  return {
    averageMoodPercent: meanPercent,
    averageLevel,
    variability,
    trend,
    peakIntensity,
    balance,
    momentum,
    bestSlot,
    worstSlot,
  };
}

export default function AnalyticsScreen() {
  const { colors, isPrivateMode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [viewMode, setViewMode] = useState("analytics");
  const [entries, setEntries] = useState([]);
  const [activityEntries, setActivityEntries] = useState([]);
  const [filter, setFilter] = useState("week");
  const [referenceDate, setReferenceDate] = useState(new Date());
  const [trackerMonthDate, setTrackerMonthDate] = useState(
    startOfMonth(new Date()),
  );
  const [trackerDate, setTrackerDate] = useState(new Date());
  const [trackerScore, setTrackerScore] = useState(0);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showTrackerDatePicker, setShowTrackerDatePicker] = useState(false);
  const [scoreMenuVisible, setScoreMenuVisible] = useState(false);
  const [faqModalVisible, setFaqModalVisible] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const initialCustomRange = useMemo(
    () => getDateRange("month", new Date()),
    [],
  );
  const [customStartDate, setCustomStartDate] = useState(
    initialCustomRange.start,
  );
  const [customEndDate, setCustomEndDate] = useState(initialCustomRange.end);

  const load = useCallback(async () => {
    const [allEntries, allActivityEntries] = await Promise.all([
      getEntries(),
      getActivityCalendarEntries(),
    ]);
    setEntries(allEntries);
    setActivityEntries(allActivityEntries);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, filter, trackerMonthDate, viewMode]);

  const activityLevels = useMemo(
    () => (isPrivateMode ? PRIVATE_LEVELS : PRODUCTIVITY_LEVELS),
    [isPrivateMode],
  );
  const scoreFaq = useMemo(
    () => (isPrivateMode ? PRIVATE_SCORE_FAQ : PUBLIC_SCORE_FAQ),
    [isPrivateMode],
  );
  const activityLabel = isPrivateMode ? "Naughty" : "Productive";
  const activityTitle = isPrivateMode
    ? "Naughty Calendar"
    : "Productivity Calendar";
  const activityDescription = isPrivateMode
    ? "One private score per day for how naughty the character felt."
    : "One public score per day for how productive the character felt.";

  const filters = useMemo(() => {
    const halfYearLabel = getHalfYearRange(referenceDate).label.split(" ")[0];
    return BASE_FILTERS.map((item) =>
      item.key === "halfyear" ? { ...item, label: halfYearLabel } : item,
    );
  }, [referenceDate]);

  const dateRange = useMemo(
    () =>
      getDateRange(filter, referenceDate, {
        startDate: customStartDate,
        endDate: customEndDate,
      }),
    [customEndDate, customStartDate, filter, referenceDate],
  );
  const rangeLabel = useMemo(
    () => formatRangeLabel(filter, dateRange, referenceDate),
    [dateRange, filter, referenceDate],
  );
  const filteredEntries = useMemo(
    () => filterEntriesByRange(entries, dateRange),
    [dateRange, entries],
  );
  const aggregationUnit = useMemo(
    () => getAggregationUnit(filter, dateRange),
    [dateRange, filter],
  );

  const trendSeries = useMemo(() => {
    if (filter === "day") {
      return [...filteredEntries]
        .sort((a, b) => toEntryTime(a) - toEntryTime(b))
        .map((entry, index) => ({
          label: toSlotLabel(entry.slot),
          value: round2(toEntryScore(entry)),
          key: `${entry?.id || "entry"}-${index}`,
        }));
    }
    const daily = calculateDailyAverage(filteredEntries);
    const buckets = {};
    daily.forEach((item) => {
      const date = new Date(item.date);
      const bucketDate = getBucketStart(date, aggregationUnit);
      const key = getBucketKey(bucketDate, aggregationUnit);
      buckets[key] = buckets[key] || [];
      buckets[key].push(item.average);
    });
    const rangeStart = dateRange.start.getTime();
    const rangeEnd = dateRange.end.getTime();
    let carry = findFallbackValueBeforeDate(entries, rangeStart, isPrivateMode);
    const filled = [];
    let cursor = getBucketStart(dateRange.start, aggregationUnit);
    while (cursor.getTime() <= rangeEnd) {
      const key = getBucketKey(cursor, aggregationUnit);
      const values = buckets[key];
      if (values?.length)
        carry = round2(values.reduce((sum, n) => sum + n, 0) / values.length);
      filled.push({
        label: getBucketLabel(cursor, aggregationUnit),
        value: carry,
        key,
      });
      cursor = advanceBucket(cursor, aggregationUnit);
    }
    return filled;
  }, [
    aggregationUnit,
    dateRange.end,
    dateRange.start,
    entries,
    filteredEntries,
    filter,
    isPrivateMode,
  ]);

  const slotAverage = useMemo(
    () => calculateSlotAverage(filteredEntries),
    [filteredEntries],
  );
  const stability = useMemo(
    () => calculateStabilityFromSeries(trendSeries.map((item) => item.value)),
    [trendSeries],
  );
  const metrics = useMemo(
    () => createMetrics(filteredEntries, slotAverage, isPrivateMode),
    [filteredEntries, isPrivateMode, slotAverage],
  );
  const moodColors = useMemo(
    () => getMoodPalette(metrics.averageMoodPercent, isPrivateMode),
    [isPrivateMode, metrics.averageMoodPercent],
  );
  const chartData = useMemo(() => {
    if (!trendSeries.length) return null;
    const values = trendSeries.map((item) =>
      isPrivateMode ? round2(item.value * 2 + 3) : item.value,
    );
    const labels = trendSeries.map((item) => item.label);
    const upperAnchor = values.map(() => (isPrivateMode ? 5 : 1));
    const lowerAnchor = values.map(() => (isPrivateMode ? 1 : -1));

    return {
      labels,
      values,
      datasets: [
        {
          data: values,
          color: (opacity = 1) => hexToRgba(colors.primary, opacity),
          strokeWidth: 2,
          withDots: true,
        },
        {
          data: upperAnchor,
          color: () => "transparent",
          strokeWidth: 0,
          withDots: false,
        },
        {
          data: lowerAnchor,
          color: () => "transparent",
          strokeWidth: 0,
          withDots: false,
        },
      ],
    };
  }, [colors.primary, isPrivateMode, trendSeries]);

  const activityMap = useMemo(
    () =>
      activityEntries.reduce((acc, entry) => {
        acc[entry.date] = entry;
        return acc;
      }, {}),
    [activityEntries],
  );
  const selectedTrackerDateKey = useMemo(
    () => toDateKey(trackerDate),
    [trackerDate],
  );
  const selectedTrackerEntry = activityMap[selectedTrackerDateKey] || null;

  useEffect(() => {
    setTrackerScore(Number(selectedTrackerEntry?.score || 0));
  }, [selectedTrackerEntry]);

  const monthEntries = useMemo(() => {
    const monthKey = toIsoMonth(trackerMonthDate);
    return activityEntries.filter((entry) => entry.date.startsWith(monthKey));
  }, [activityEntries, trackerMonthDate]);
  const trackerStreak = useMemo(
    () => getCurrentStreak(activityMap),
    [activityMap],
  );
  const trackerAverage = useMemo(
    () => average(monthEntries.map((entry) => Number(entry.score || 0))),
    [monthEntries],
  );
  const trackerLevel = useMemo(
    () =>
      activityLevels.find((item) => item.value === Number(trackerScore || 0)) ||
      activityLevels[0],
    [activityLevels, trackerScore],
  );

  const onShiftRange = useCallback(
    (direction) => {
      if (filter === "custom") {
        const spanDays = Math.max(
          1,
          Math.round(
            (customEndDate.getTime() - customStartDate.getTime()) / 86400000,
          ) + 1,
        );
        const shiftMs = direction * spanDays * 86400000;
        setCustomStartDate((prev) => new Date(prev.getTime() + shiftMs));
        setCustomEndDate((prev) => new Date(prev.getTime() + shiftMs));
        return;
      }
      setReferenceDate((prev) => shiftReferenceDate(prev, filter, direction));
    },
    [customEndDate, customStartDate, filter],
  );

  const onJumpToCurrent = useCallback(() => {
    const now = new Date();
    setReferenceDate(now);
    if (filter === "custom") {
      const todayRange = getDateRange("day", now);
      setCustomStartDate(todayRange.start);
      setCustomEndDate(todayRange.end);
    }
  }, [filter]);

  const onChangeCustomStart = useCallback((_, value) => {
    if (Platform.OS !== "ios") setShowStartPicker(false);
    if (value) setCustomStartDate(value);
  }, []);

  const onChangeCustomEnd = useCallback((_, value) => {
    if (Platform.OS !== "ios") setShowEndPicker(false);
    if (value) setCustomEndDate(value);
  }, []);

  const onChangeTrackerDate = useCallback((_, value) => {
    if (Platform.OS !== "ios") setShowTrackerDatePicker(false);
    if (!value) return;
    setTrackerDate(value);
    setTrackerMonthDate(startOfMonth(value));
  }, []);

  const onSaveTrackerScore = useCallback(async () => {
    const updated = await upsertActivityCalendarEntry({
      date: selectedTrackerDateKey,
      score: trackerScore,
    });
    setActivityEntries(updated);
  }, [selectedTrackerDateKey, trackerScore]);

  const onClearTrackerScore = useCallback(async () => {
    const updated = await deleteActivityCalendarEntry(selectedTrackerDateKey);
    setActivityEntries(updated);
    setTrackerScore(0);
  }, [selectedTrackerDateKey]);

  const chartWidth = Math.max(Dimensions.get("window").width - 56, 300);
  const chartHint = isPrivateMode
    ? filter === "day"
      ? "X-axis: Entry slots (M/A/E/N) | Y-axis: Naughty level trend"
      : aggregationUnit === "day"
        ? "X-axis: Day | Y-axis: Naughty level trend"
        : aggregationUnit === "week"
          ? "X-axis: Week | Y-axis: Naughty level trend"
          : "X-axis: Month | Y-axis: Naughty level trend"
    : filter === "day"
      ? "X-axis: Mood entries (M/A/E/N) | Y-axis: Mood score"
      : aggregationUnit === "day"
        ? "X-axis: Day | Y-axis: Mood score"
        : aggregationUnit === "week"
          ? "X-axis: Week | Y-axis: Mood score"
          : "X-axis: Month | Y-axis: Mood score";

  const calendarCells = useMemo(
    () => getCalendarCells(trackerMonthDate),
    [trackerMonthDate],
  );
  const trackerMonthLabel = trackerMonthDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {VIEW_OPTIONS.map((item) => {
          const active = item.key === viewMode;
          return (
            <Pressable
              key={item.key}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setViewMode(item.key)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {viewMode === "analytics" ? (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {filters.map((item) => {
              const active = item.key === filter;
              return (
                <Pressable
                  key={item.key}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setFilter(item.key)}
                >
                  <Text
                    style={[styles.chipText, active && styles.chipTextActive]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.navRow}>
            <Pressable style={styles.navBtn} onPress={() => onShiftRange(-1)}>
              <Text style={styles.navBtnText}>Prev</Text>
            </Pressable>
            <Text style={styles.navLabel}>{rangeLabel}</Text>
            <Pressable style={styles.navBtn} onPress={() => onShiftRange(1)}>
              <Text style={styles.navBtnText}>Next</Text>
            </Pressable>
            <Pressable style={styles.todayBtn} onPress={onJumpToCurrent}>
              <Text style={styles.todayBtnText}>Today</Text>
            </Pressable>
          </View>

          {filter === "custom" ? (
            <View style={styles.dateRow}>
              <Pressable
                style={styles.dateBtn}
                onPress={() => setShowStartPicker(true)}
              >
                <Text style={styles.dateBtnText}>
                  Start: {customStartDate.toLocaleDateString()}
                </Text>
              </Pressable>
              <Pressable
                style={styles.dateBtn}
                onPress={() => setShowEndPicker(true)}
              >
                <Text style={styles.dateBtnText}>
                  End: {customEndDate.toLocaleDateString()}
                </Text>
              </Pressable>
            </View>
          ) : null}
          {showStartPicker ? (
            <DateTimePicker
              value={customStartDate}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={onChangeCustomStart}
            />
          ) : null}
          {showEndPicker ? (
            <DateTimePicker
              value={customEndDate}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={onChangeCustomEnd}
            />
          ) : null}

          <Animated.View style={{ opacity: fadeAnim }}>
            <LinearGradient
              colors={colors.cardGradientAlt}
              locations={[0, 0.5, 1]}
              start={{ x: 1, y: 1 }}
              end={{ x: 0, y: 0 }}
              style={styles.card}
            >
              <Text style={styles.cardTitle}>
                {isPrivateMode
                  ? "Naughty Trend Graph"
                  : "Emotional Trend Graph"}
              </Text>
              <Text style={styles.hint}>{chartHint}</Text>
              {chartData ? (
                <LineChart
                  data={{
                    labels: chartData.labels,
                    datasets: chartData.datasets,
                  }}
                  width={chartWidth}
                  height={220}
                  withDots
                  withShadow={false}
                  withInnerLines
                  segments={4}
                  chartConfig={{
                    backgroundGradientFrom: colors.surface,
                    backgroundGradientTo: colors.surface,
                    color: (opacity = 1) => hexToRgba(colors.primary, opacity),
                    labelColor: (opacity = 1) =>
                      hexToRgba(colors.textMuted, opacity),
                    decimalPlaces: 2,
                    propsForDots: {
                      r: "3",
                      strokeWidth: "1",
                      stroke: colors.primary,
                    },
                  }}
                  style={styles.chart}
                />
              ) : (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>
                    No emotional data for this filter yet.
                  </Text>
                </View>
              )}
            </LinearGradient>
            <View style={styles.metricRow}>
              <LinearGradient
                colors={moodColors}
                locations={[0, 0.5, 1]}
                start={{ x: 1, y: 1 }}
                end={{ x: 0, y: 0 }}
                style={styles.metricCard}
              >
                <Text style={styles.metricLabel}>
                  {isPrivateMode ? "Avg Level" : "Mood Score"}
                </Text>
                <Text style={styles.metricValue}>
                  {isPrivateMode
                    ? `${metrics.averageLevel.toFixed(1)}/5`
                    : `${metrics.averageMoodPercent}%`}
                </Text>
              </LinearGradient>
              <LinearGradient
                colors={colors.sessionGradientIdle}
                start={{ x: 1, y: 1 }}
                end={{ x: 0, y: 0 }}
                style={styles.metricCard}
              >
                <Text style={styles.metricLabel}>Entries</Text>
                <Text style={styles.metricValue}>{filteredEntries.length}</Text>
              </LinearGradient>
            </View>
            <LinearGradient
              colors={colors.cardGradientAlt}
              locations={[0, 0.5, 1]}
              start={{ x: 1, y: 1 }}
              end={{ x: 0, y: 0 }}
              style={styles.card}
            >
              <Text style={styles.cardTitle}>
                {isPrivateMode ? "Hot Time Slots" : "Time Slot Pattern"}
              </Text>
              <Text style={styles.hint}>
                {isPrivateMode ? "Hottest" : "Best"}: {metrics.bestSlot.slot} (
                {scoreToPercent(metrics.bestSlot.average)}%) |{" "}
                {isPrivateMode ? "Coolest" : "Worst"}: {metrics.worstSlot.slot}{" "}
                ({scoreToPercent(metrics.worstSlot.average)}%)
              </Text>
              <View style={styles.slotGrid}>
                {slotAverage.map((slot) => (
                  <View key={slot.slot} style={styles.slotCard}>
                    <View
                      style={[
                        styles.slotDot,
                        {
                          backgroundColor: slotColor(
                            slot.average,
                            isPrivateMode,
                          ),
                        },
                      ]}
                    />
                    <Text style={styles.slotName}>{slot.slot}</Text>
                    <Text style={styles.slotValue}>
                      {scoreLabel(slot.average, isPrivateMode)}
                    </Text>
                  </View>
                ))}
              </View>
            </LinearGradient>
            <LinearGradient
              colors={colors.cardGradientAlt}
              locations={[0, 0.5, 1]}
              start={{ x: 1, y: 1 }}
              end={{ x: 0, y: 0 }}
              style={styles.card}
            >
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle}>
                  {isPrivateMode
                    ? "Advanced Naughty Analytics"
                    : "Advanced Mood Analytics"}
                </Text>
                <Pressable
                  style={styles.infoButton}
                  onPress={() => setFaqModalVisible(true)}
                >
                  <Ionicons
                    name="information-circle-outline"
                    size={18}
                    color={colors.primary}
                  />
                </Pressable>
              </View>
              <View style={styles.analyticsGrid}>
                <View style={styles.analyticsItem}>
                  <Text style={styles.analyticsLabel}>
                    {isPrivateMode ? "Arousal Stability" : "Stability"}
                  </Text>
                  <Text style={styles.analyticsValue}>{stability}%</Text>
                </View>
                <View style={styles.analyticsItem}>
                  <Text style={styles.analyticsLabel}>
                    {isPrivateMode ? "Arousal Swing" : "Variability"}
                  </Text>
                  <Text style={styles.analyticsValue}>
                    {metrics.variability}%
                  </Text>
                </View>
                <View style={styles.analyticsItem}>
                  <Text style={styles.analyticsLabel}>
                    {isPrivateMode ? "Desire Trend" : "Trend"}
                  </Text>
                  <Text style={styles.analyticsValue}>
                    {metrics.trend > 0 ? "+" : ""}
                    {metrics.trend.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.analyticsItem}>
                  <Text style={styles.analyticsLabel}>
                    {isPrivateMode ? "Peak Level" : "Peak"}
                  </Text>
                  <Text style={styles.analyticsValue}>
                    {isPrivateMode
                      ? `${metrics.peakIntensity.toFixed(1)}/5`
                      : metrics.peakIntensity.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.analyticsItem}>
                  <Text style={styles.analyticsLabel}>
                    {isPrivateMode ? "Charged Ratio" : "Balance"}
                  </Text>
                  <Text style={styles.analyticsValue}>{metrics.balance}%</Text>
                </View>
                <View style={styles.analyticsItem}>
                  <Text style={styles.analyticsLabel}>
                    {isPrivateMode ? "Recent Heat" : "Momentum"}
                  </Text>
                  <Text style={styles.analyticsValue}>
                    {metrics.momentum > 0 ? "+" : ""}
                    {metrics.momentum.toFixed(2)}
                  </Text>
                </View>
              </View>
            </LinearGradient>
          </Animated.View>
        </>
      ) : (
        <Animated.View style={{ opacity: fadeAnim }}>
          <LinearGradient
            colors={colors.cardGradientAlt}
            locations={[0, 0.5, 1]}
            start={{ x: 1, y: 1 }}
            end={{ x: 0, y: 0 }}
            style={styles.card}
          >
            <Text style={styles.cardTitle}>{activityTitle}</Text>
            <Text style={styles.hint}>{activityDescription}</Text>
            <View style={styles.metricRow}>
              <View style={styles.summaryCard}>
                <Text style={styles.metricLabel}>Current Streak</Text>
                <Text style={styles.metricValue}>{trackerStreak}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.metricLabel}>Month Logs</Text>
                <Text style={styles.metricValue}>{monthEntries.length}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.metricLabel}>Month Avg</Text>
                <Text style={styles.metricValue}>
                  {trackerAverage.toFixed(1)}
                </Text>
              </View>
            </View>
            <View style={styles.legendRow}>
              {activityLevels.map((level) => (
                <View
                  key={level.value}
                  style={[styles.legendDot, { backgroundColor: level.color }]}
                >
                  <Text style={[styles.legendText, { color: level.textColor }]}>
                    {level.value}
                  </Text>
                </View>
              ))}
            </View>
            <View style={styles.navRow}>
              <Pressable
                style={styles.navBtn}
                onPress={() =>
                  setTrackerMonthDate((prev) => shiftMonth(prev, -1))
                }
              >
                <Text style={styles.navBtnText}>Prev Month</Text>
              </Pressable>
              <Text style={styles.navLabel}>{trackerMonthLabel}</Text>
              <Pressable
                style={styles.navBtn}
                onPress={() =>
                  setTrackerMonthDate((prev) => shiftMonth(prev, 1))
                }
              >
                <Text style={styles.navBtnText}>Next Month</Text>
              </Pressable>
            </View>
            <View style={styles.editorCard}>
              <Text style={styles.cardTitle}>{activityLabel} Log</Text>
              <Text style={styles.hint}>
                {formatLongDate(selectedTrackerDateKey)}
              </Text>
              <View style={styles.dateRow}>
                <Pressable
                  style={styles.dateBtn}
                  onPress={() => setShowTrackerDatePicker(true)}
                >
                  <Text style={styles.dateBtnText}>Choose Date</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.levelBtn,
                    {
                      backgroundColor: trackerLevel.color,
                      borderColor: trackerLevel.color,
                    },
                  ]}
                  onPress={() => setScoreMenuVisible(true)}
                >
                  <Text
                    style={[
                      styles.levelBtnText,
                      { color: trackerLevel.textColor },
                    ]}
                  >
                    {trackerLevel.label}
                  </Text>
                </Pressable>
              </View>
              <Text style={styles.hint}>{trackerLevel.subtitle}</Text>
              <View style={styles.dateRow}>
                <Pressable
                  style={styles.secondaryBtn}
                  onPress={onClearTrackerScore}
                >
                  <Text style={styles.secondaryBtnText}>Clear</Text>
                </Pressable>
                <Pressable
                  style={styles.primaryBtn}
                  onPress={onSaveTrackerScore}
                >
                  <Text style={styles.primaryBtnText}>
                    {selectedTrackerEntry ? "Update Log" : "Save Log"}
                  </Text>
                </Pressable>
              </View>
            </View>
            {showTrackerDatePicker ? (
              <DateTimePicker
                value={trackerDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={onChangeTrackerDate}
              />
            ) : null}
          </LinearGradient>
          <View style={styles.calendarCard}>
            <View style={styles.weekdayRow}>
              {CALENDAR_WEEKDAYS.map((day) => (
                <Text key={day} style={styles.weekdayText}>
                  {day}
                </Text>
              ))}
            </View>
            <View style={styles.calendarGrid}>
              {calendarCells.map((cell, index) => {
                if (!cell)
                  return (
                    <View key={`blank-${index}`} style={styles.calendarBlank} />
                  );
                const dateKey = toDateKey(cell);
                const savedScore = Number(activityMap[dateKey]?.score || 0);
                const level =
                  activityLevels.find((item) => item.value === savedScore) ||
                  activityLevels[0];
                const isSelected = dateKey === selectedTrackerDateKey;
                return (
                  <Pressable
                    key={dateKey}
                    style={[
                      styles.calendarCell,
                      {
                        backgroundColor: level.color,
                        borderColor: isSelected ? colors.text : level.color,
                      },
                    ]}
                    onPress={() => {
                      setTrackerDate(cell);
                      setTrackerMonthDate(startOfMonth(cell));
                      setTrackerScore(savedScore);
                    }}
                  >
                    <Text
                      style={[styles.calendarDay, { color: level.textColor }]}
                    >
                      {cell.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Animated.View>
      )}

      <Modal
        transparent
        visible={scoreMenuVisible}
        animationType="fade"
        onRequestClose={() => setScoreMenuVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.cardTitle}>Select {activityLabel} Level</Text>
            {activityLevels.map((level) => (
              <Pressable
                key={level.value}
                style={[
                  styles.scoreOption,
                  {
                    backgroundColor: level.color,
                    borderColor:
                      trackerScore === level.value ? colors.text : level.color,
                  },
                ]}
                onPress={() => {
                  setTrackerScore(level.value);
                  setScoreMenuVisible(false);
                }}
              >
                <Text
                  style={[styles.scoreOptionTitle, { color: level.textColor }]}
                >
                  {level.label}
                </Text>
                <Text
                  style={[
                    styles.scoreOptionSubtitle,
                    { color: level.textColor },
                  ]}
                >
                  {level.subtitle}
                </Text>
              </Pressable>
            ))}
            <Pressable
              style={styles.primaryBtn}
              onPress={() => setScoreMenuVisible(false)}
            >
              <Text style={styles.primaryBtnText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={faqModalVisible}
        animationType="fade"
        onRequestClose={() => setFaqModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.faqModalCard}>
            <View style={styles.faqHeaderRow}>
              <Text style={styles.cardTitle}>
                {isPrivateMode
                  ? "Private Analytics FAQ"
                  : "Public Analytics FAQ"}
              </Text>
              <Pressable onPress={() => setFaqModalVisible(false)}>
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {scoreFaq.map((item) => (
                <View key={item.key} style={styles.faqItem}>
                  <Text style={styles.faqTitle}>{item.title}</Text>
                  <Text style={styles.faqDescription}>
                    {item.description || " "}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, paddingBottom: 28 },
    chipRow: { gap: 8, paddingBottom: 8, marginBottom: 8 },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.inputSurface,
      borderRadius: 999,
      paddingVertical: 8,
      paddingHorizontal: 14,
    },
    chipActive: {
      backgroundColor: colors.inputAccent,
      borderColor: colors.inputAccentBorder,
    },
    chipText: { color: colors.textMuted, fontWeight: "600" },
    chipTextActive: { color: colors.primary },
    navRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
      marginBottom: 12,
    },
    navBtn: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.inputSurface,
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 12,
    },
    navBtnText: { color: colors.text, fontWeight: "700", fontSize: 12 },
    navLabel: {
      color: colors.text,
      fontWeight: "700",
      fontSize: 12,
      flexShrink: 1,
    },
    todayBtn: {
      borderWidth: 1,
      borderColor: colors.inputAccentBorder,
      backgroundColor: colors.inputAccent,
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 12,
    },
    todayBtnText: { color: colors.primary, fontWeight: "700", fontSize: 12 },
    dateRow: { flexDirection: "row", gap: 8, marginTop: 10 },
    dateBtn: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      backgroundColor: colors.inputSurface,
      paddingVertical: 8,
      paddingHorizontal: 10,
    },
    dateBtnText: { color: colors.text, fontWeight: "600", fontSize: 12 },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 14,
      marginBottom: 12,
    },
    cardTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 6,
    },
    cardTitle: {
      color: colors.text,
      fontWeight: "800",
      fontSize: 16,
      marginBottom: 6,
    },
    infoButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.inputSurface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
    chart: { borderRadius: 12, marginTop: 10 },
    emptyBox: {
      height: 180,
      borderRadius: 12,
      backgroundColor: colors.inputSurface,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 10,
    },
    emptyText: { color: colors.textMuted, fontWeight: "600" },
    metricRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
    metricCard: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center",
      backgroundColor: colors.surface,
    },
    summaryCard: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: "center",
      backgroundColor: colors.inputSurface,
    },
    metricLabel: { color: colors.textMuted, fontWeight: "600", fontSize: 12 },
    metricValue: {
      marginTop: 4,
      fontSize: 22,
      fontWeight: "800",
      color: colors.text,
    },
    slotGrid: { flexDirection: "row", gap: 8 },
    slotCard: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: "center",
      backgroundColor: colors.inputSurface,
    },
    slotDot: { width: 14, height: 14, borderRadius: 999, marginBottom: 6 },
    slotName: {
      color: colors.text,
      fontWeight: "700",
      textTransform: "capitalize",
    },
    slotValue: { color: colors.textMuted, marginTop: 2, fontSize: 12 },
    analyticsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    analyticsItem: {
      width: "48%",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.inputSurface,
      paddingVertical: 10,
      paddingHorizontal: 10,
    },
    analyticsLabel: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "600",
    },
    analyticsValue: {
      marginTop: 4,
      color: colors.text,
      fontSize: 18,
      fontWeight: "800",
    },
    legendRow: {
      flexDirection: "row",
      gap: 8,
      marginVertical: 10,
      flexWrap: "wrap",
    },
    legendDot: {
      width: 32,
      height: 32,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
    },
    legendText: { fontWeight: "800", fontSize: 12 },
    editorCard: {
      marginTop: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.inputSurface,
      padding: 12,
    },
    levelBtn: {
      flex: 1,
      borderWidth: 1,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    levelBtnText: { fontWeight: "800", textAlign: "center" },
    primaryBtn: {
      flex: 1,
      borderRadius: 12,
      height: 46,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.primary,
      marginTop: 10,
    },
    primaryBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 16 },
    secondaryBtn: {
      flex: 1,
      borderRadius: 12,
      height: 46,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      marginTop: 10,
    },
    secondaryBtnText: { color: colors.textMuted, fontWeight: "700" },
    calendarCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 12,
    },
    weekdayRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 8,
    },
    weekdayText: {
      width: `${100 / 7}%`,
      textAlign: "center",
      color: colors.textMuted,
      fontWeight: "700",
      fontSize: 11,
    },
    calendarGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    calendarBlank: { width: `${(100 - 36) / 7}%`, aspectRatio: 1 },
    calendarCell: {
      width: `${(100 - 36) / 7}%`,
      aspectRatio: 1,
      borderRadius: 12,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
    },
    calendarDay: { fontWeight: "800", fontSize: 14 },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 16,
    },
    modalCard: {
      width: "100%",
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 14,
    },
    faqModalCard: {
      width: "100%",
      maxWidth: 420,
      maxHeight: "78%",
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 16,
    },
    faqHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    faqItem: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.inputSurface,
      borderRadius: 12,
      padding: 12,
      marginBottom: 10,
    },
    faqTitle: {
      color: colors.text,
      fontWeight: "800",
      marginBottom: 4,
    },
    faqDescription: {
      color: colors.textMuted,
      lineHeight: 18,
      minHeight: 18,
    },
    scoreOption: {
      borderWidth: 2,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 12,
      marginBottom: 8,
    },
    scoreOptionTitle: { fontWeight: "800", fontSize: 15 },
    scoreOptionSubtitle: { marginTop: 4, fontSize: 12, fontWeight: "600" },
  });
