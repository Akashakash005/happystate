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
import { COLORS } from "../constants/colors";
import { getEntries } from "../services/storageService";
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

const BASE_FILTERS = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "halfyear", label: "Half Year" },
  { key: "custom", label: "Custom" },
];
const SCORE_FAQ = [
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
    description:
      "Share of positive entries in the selected period.",
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
    description:
      "Combined indicator of recovery speed, trend, and stability.",
  },
];

function slotColor(score) {
  if (score > 0.2) return "#22C55E";
  if (score < -0.2) return "#EF4444";
  return "#F59E0B";
}

function scoreLabel(score) {
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

function round2(value) {
  return Number((value || 0).toFixed(2));
}

function scoreToPercent(score) {
  return Math.round(clamp(((score || 0) + 1) * 50, 0, 100));
}

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

function getMoodPalette(averageMoodPercent) {
  // Stability thresholds:
  // >= 80  => great
  // 50-79 => average
  // < 50  => bad
  if (averageMoodPercent >= 80) {
    // great
    // colors={["#29e518", "#6ccb7e", "#e3ffea"]}
    return ["#29e518", "#6ccb7e", "#e3ffea"];
  }
  if (averageMoodPercent >= 50) {
    // average
    // colors={["#f8e61d", "#ffee6e", "#E3E8FF"]}
    return ["#f8e61d", "#ffee6e", "#E3E8FF"];
  }
  // bad
  // colors={["#fa6d58", "#ff7c6e", "#E3E8FF"]}
  return ["#fa6d58", "#ff7c6e", "#E3E8FF"];
}

function shortDateLabel(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function toIsoDay(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toIsoMonth(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function startOfDay(dateInput) {
  const d = new Date(dateInput);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeekMonday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
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

  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.max(
    1,
    Math.round((range.end.getTime() - range.start.getTime()) / dayMs) + 1,
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
  if (unit === "month") {
    d.setMonth(d.getMonth() + 1);
    return d;
  }
  if (unit === "week") {
    d.setDate(d.getDate() + 7);
    return d;
  }
  d.setDate(d.getDate() + 1);
  return d;
}

function getBucketKey(dateInput, unit) {
  if (unit === "month") return toIsoMonth(dateInput);
  return toIsoDay(dateInput);
}

function getBucketLabel(dateInput, unit) {
  if (unit === "month") {
    return dateInput.toLocaleDateString("en-US", { month: "short" });
  }
  return shortDateLabel(toIsoDay(dateInput));
}

function findFallbackValueBeforeDate(allEntries, dateStartTs) {
  const before = (allEntries || [])
    .filter((entry) => {
      const ts = new Date(
        entry.dateISO || entry.actualLoggedAt || entry.updatedAt || entry.date,
      ).getTime();
      return !Number.isNaN(ts) && ts < dateStartTs;
    })
    .sort((a, b) => {
      const ta = new Date(
        a.dateISO || a.actualLoggedAt || a.updatedAt || a.date,
      ).getTime();
      const tb = new Date(
        b.dateISO || b.actualLoggedAt || b.updatedAt || b.date,
      ).getTime();
      return tb - ta;
    });

  if (!before.length) return 0; // neutral fallback
  const candidate = before[0];
  if (typeof candidate.score === "number") return candidate.score;
  const mood = Number(candidate.mood || 3);
  return (mood - 3) / 2;
}

export default function AnalyticsScreen() {
  const [entries, setEntries] = useState([]);
  const [filter, setFilter] = useState("week");
  const [referenceDate, setReferenceDate] = useState(new Date());
  const initialCustomRange = useMemo(
    () => getDateRange("month", new Date()),
    [],
  );
  const [customStartDate, setCustomStartDate] = useState(
    initialCustomRange.start,
  );
  const [customEndDate, setCustomEndDate] = useState(initialCustomRange.end);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [faqVisible, setFaqVisible] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const load = useCallback(async () => {
    const all = await getEntries();
    setEntries(all);
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
  }, [filter, fadeAnim]);

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
      const direct = [...filteredEntries]
        .sort((a, b) => toEntryTime(a) - toEntryTime(b))
        .map((entry, index) => ({
          label: toSlotLabel(entry.slot),
          value: round2(toEntryScore(entry)),
          key: `${entry?.id || "entry"}-${index}`,
        }));
      return direct;
    }

    const daily = calculateDailyAverage(filteredEntries);
    const buckets = {};
    daily.forEach((item) => {
      const [y, m, d] = item.date.split("-").map(Number);
      const date = new Date(y, (m || 1) - 1, d || 1);
      const bucketDate = getBucketStart(date, aggregationUnit);
      const key = getBucketKey(bucketDate, aggregationUnit);
      buckets[key] = buckets[key] || [];
      buckets[key].push(item.average);
    });

    const rangeStart = dateRange.start.getTime();
    const rangeEnd = dateRange.end.getTime();
    let carry = findFallbackValueBeforeDate(entries, rangeStart);
    const filled = [];
    let cursor = getBucketStart(dateRange.start, aggregationUnit);

    while (cursor.getTime() <= rangeEnd) {
      const key = getBucketKey(cursor, aggregationUnit);
      const values = buckets[key];
      if (values?.length) {
        carry = round2(values.reduce((sum, n) => sum + n, 0) / values.length);
      }
      filled.push({
        label: getBucketLabel(cursor, aggregationUnit),
        value: carry,
        key,
      });
      cursor = advanceBucket(cursor, aggregationUnit);
    }
    return filled;
  }, [aggregationUnit, dateRange.end, dateRange.start, entries, filteredEntries, filter]);
  const slotAverage = useMemo(
    () => calculateSlotAverage(filteredEntries),
    [filteredEntries],
  );
  const stability = useMemo(
    () => calculateStabilityFromSeries(trendSeries.map((item) => item.value)),
    [trendSeries],
  );

  const chartData = useMemo(() => {
    if (!trendSeries.length) {
      return null;
    }
    const labels = trendSeries.map((item) => item.label);
    const values = trendSeries.map((item) => item.value);
    return { labels, values };
  }, [trendSeries]);

  const chartWidth = Math.max(Dimensions.get("window").width - 56, 300);
  const chartHint =
    filter === "day"
      ? "X-axis: Mood entries (M/A/E/N)  |  Y-axis: Mood score"
      : aggregationUnit === "day"
        ? "X-axis: Day  |  Y-axis: Mood score (daily avg)"
        : aggregationUnit === "week"
          ? "X-axis: Week  |  Y-axis: Mood score (weekly avg)"
          : "X-axis: Month  |  Y-axis: Mood score (monthly avg)";

  const metrics = useMemo(() => {
    const ordered = [...filteredEntries].sort(
      (a, b) => toEntryTime(a) - toEntryTime(b),
    );
    const scores = ordered.map((entry) => toEntryScore(entry));
    const total = scores.length;
    const meanPercent = scoreToPercent(average(scores));

    const stdev = stdDev(scores);
    const variability = Math.round(clamp((stdev / 1) * 100, 0, 100));

    const trend = total >= 2 ? round2(scores[total - 1] - scores[0]) : 0;

    const peakIntensity = round2(
      scores.length ? Math.max(...scores.map((s) => Math.abs(s))) : 0,
    );

    const positives = scores.filter((s) => s > 0).length;
    const balance = Math.round((positives / (total || 1)) * 100);

    const last3 = scores.slice(-3);
    let momentum = 0;
    if (last3.length >= 2) {
      momentum = round2(last3[last3.length - 1] - last3[0]);
    }

    let recoveryTotalSteps = 0;
    let recoveryEpisodes = 0;
    for (let i = 0; i < scores.length; i += 1) {
      if (scores[i] >= 0) continue;
      let j = i + 1;
      while (j < scores.length && scores[j] <= 0) j += 1;
      if (j < scores.length) {
        recoveryTotalSteps += j - i;
        recoveryEpisodes += 1;
      }
    }
    const avgRecoverySteps = recoveryEpisodes
      ? recoveryTotalSteps / recoveryEpisodes
      : 0;
    const recovery = recoveryEpisodes
      ? Math.round(clamp(100 - ((avgRecoverySteps - 1) / 4) * 100, 0, 100))
      : 100;

    const bestSlot = slotAverage.reduce(
      (best, slot) => (slot.average > best.average ? slot : best),
      slotAverage[0] || { slot: "morning", average: 0 },
    );
    const worstSlot = slotAverage.reduce(
      (worst, slot) => (slot.average < worst.average ? slot : worst),
      slotAverage[0] || { slot: "morning", average: 0 },
    );

    const slotConsistency = ["morning", "afternoon", "evening", "night"].map(
      (slot) => {
        const values = ordered
          .filter((entry) => entry.slot === slot)
          .map((entry) => toEntryScore(entry));
        if (!values.length) return { slot, score: 0 };
        const slotStd = stdDev(values);
        return { slot, score: Math.round(clamp(100 - slotStd * 100, 0, 100)) };
      },
    );

    const resilience = Math.round(
      clamp(
        0.4 * recovery +
          0.3 * clamp(((trend + 1) / 2) * 100, 0, 100) +
          0.3 * (100 - variability),
        0,
        100,
      ),
    );

    return {
      averageMoodPercent: meanPercent,
      variability,
      trend,
      recovery,
      peakIntensity,
      balance,
      momentum,
      resilience,
      bestSlot,
      worstSlot,
      slotConsistency,
    };
  }, [filteredEntries, slotAverage]);
  const moodColors = useMemo(
    () => getMoodPalette(metrics.averageMoodPercent),
    [metrics.averageMoodPercent],
  );
  const onShiftRange = useCallback(
    (direction) => {
      if (filter === "custom") {
        const dayMs = 24 * 60 * 60 * 1000;
        const spanDays = Math.max(
          1,
          Math.round(
            (customEndDate.getTime() - customStartDate.getTime()) / dayMs,
          ) + 1,
        );
        const shiftMs = direction * spanDays * dayMs;
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
    if (!value) return;
    setCustomStartDate(value);
  }, []);

  const onChangeCustomEnd = useCallback((_, value) => {
    if (Platform.OS !== "ios") setShowEndPicker(false);
    if (!value) return;
    setCustomEndDate(value);
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.filterRow}>
            {filters.map((item) => {
              const active = item.key === filter;
              return (
                <Pressable
                  key={item.key}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setFilter(item.key)}
                >
                  <Text
                    style={[
                      styles.filterText,
                      active && styles.filterTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
        <View style={styles.periodNavRow}>
          <Pressable
            style={styles.periodButton}
            onPress={() => onShiftRange(-1)}
          >
            <Text style={styles.periodButtonText}>Prev</Text>
          </Pressable>
          <Text style={styles.periodLabel}>{rangeLabel}</Text>
          <Pressable style={styles.periodButton} onPress={() => onShiftRange(1)}>
            <Text style={styles.periodButtonText}>Next</Text>
          </Pressable>
          <Pressable style={styles.periodTodayButton} onPress={onJumpToCurrent}>
            <Text style={styles.periodTodayText}>Today</Text>
          </Pressable>
        </View>
        {filter === "custom" ? (
          <View style={styles.customRangeRow}>
            <Pressable
              style={styles.customDateButton}
              onPress={() => setShowStartPicker(true)}
            >
              <Text style={styles.customDateText}>
                Start:{" "}
                {customStartDate.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </Text>
            </Pressable>
            <Pressable
              style={styles.customDateButton}
              onPress={() => setShowEndPicker(true)}
            >
              <Text style={styles.customDateText}>
                End:{" "}
                {customEndDate.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
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
      </View>

      <Animated.View style={{ opacity: fadeAnim }}>
        <LinearGradient
          colors={["#7b91eb", "#6E8BFF", "#E3E8FF"]}
          locations={[0, 0.5, 1]}
          start={{ x: 1, y: 1 }} // bottom-right
          end={{ x: 0, y: 0 }} // top-left
          style={styles.card}
        >
          <Text style={styles.cardTitle}>Emotional Trend Graph</Text>
          <Text style={styles.chartHintText}>{chartHint}</Text>
          {chartData ? (
            <View style={styles.chartFrame}>
              <View style={styles.chartMain}>
                <LineChart
                  data={{
                    labels: chartData.labels,
                    datasets: [{ data: chartData.values }],
                  }}
                  width={chartWidth}
                  height={220}
                  withDots
                  withShadow={false}
                  withInnerLines
                  yAxisInterval={1}
                  yAxisLabel=""
                  yAxisSuffix=""
                  fromZero={false}
                  chartConfig={{
                    backgroundGradientFrom: "#FFFFFF",
                    backgroundGradientTo: "#FFFFFF",
                    color: (opacity = 1) => `rgba(29, 78, 216, ${opacity})`,
                    labelColor: (opacity = 1) =>
                      `rgba(100, 116, 139, ${opacity})`,
                    decimalPlaces: 2,
                    propsForDots: {
                      r: "3",
                      strokeWidth: "1",
                      stroke: "#1D4ED8",
                    },
                  }}
                  style={styles.chart}
                />
              </View>
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>
                No emotional data for this filter yet.
              </Text>
            </View>
          )}
        </LinearGradient>

        <View style={styles.metricsRow}>
          <LinearGradient
            colors={moodColors}
            locations={[0, 0.5, 1]}
            start={{ x: 1, y: 1 }} // bottom-right
            end={{ x: 0, y: 0 }} // top-left
            style={styles.metricCard}
          >
            <Text style={styles.metricLabel}>Mood Score</Text>
            <Text style={styles.metricValue}>
              {metrics.averageMoodPercent}%
            </Text>
          </LinearGradient>
          <LinearGradient
            colors={["#7b91eb", "#E3E8FF"]}
            start={{ x: 1, y: 1 }} // bottom-right
            end={{ x: 0, y: 0 }} // top-left
            style={styles.metricCard}
          >
            <Text style={styles.metricLabel}>Entries</Text>
            <Text style={styles.metricValue}>{filteredEntries.length}</Text>
          </LinearGradient>
        </View>

        <LinearGradient
          colors={["#7b91eb", "#6E8BFF", "#E3E8FF"]}
          locations={[0, 0.5, 1]}
          start={{ x: 1, y: 1 }} // bottom-right
          end={{ x: 0, y: 0 }} // top-left
          style={styles.card}
        >
          <Text style={styles.cardTitle}>Time Slot Pattern</Text>
          <Text style={styles.slotSummaryText}>
            Best:{" "}
            {metrics.bestSlot.slot.charAt(0).toUpperCase() +
              metrics.bestSlot.slot.slice(1)}{" "}
            ({scoreToPercent(metrics.bestSlot.average)}%) | Worst:{" "}
            {metrics.worstSlot.slot.charAt(0).toUpperCase() +
              metrics.worstSlot.slot.slice(1)}{" "}
            ({scoreToPercent(metrics.worstSlot.average)}%)
          </Text>
          <View style={styles.slotGrid}>
            {slotAverage.map((slot) => (
              <View key={slot.slot} style={styles.slotCard}>
                <View
                  style={[
                    styles.slotDot,
                    { backgroundColor: slotColor(slot.average) },
                  ]}
                />
                <Text style={styles.slotName}>
                  {slot.slot.charAt(0).toUpperCase() + slot.slot.slice(1)}
                </Text>
                <Text style={styles.slotValue}>{scoreLabel(slot.average)}</Text>
                <Text style={styles.slotConsistency}>
                  C:{" "}
                  {metrics.slotConsistency.find((s) => s.slot === slot.slot)
                    ?.score || 0}
                  %
                </Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        <LinearGradient
          colors={["#7b91eb", "#6E8BFF", "#E3E8FF"]}
          locations={[0, 0.5, 1]}
          start={{ x: 1, y: 1 }}
          end={{ x: 0, y: 0 }}
          style={styles.card}
        >
          <View style={styles.analyticsHeaderRow}>
            <Text style={styles.cardTitle}>Advanced Mood Analytics</Text>
            <Pressable
              style={styles.faqButton}
              onPress={() => setFaqVisible(true)}
            >
              <Ionicons
                name="information-circle-outline"
                size={20}
                color={COLORS.primary}
              />
            </Pressable>
          </View>
          <View style={styles.analyticsGrid}>
            <View style={styles.analyticsItem}>
              <Text style={styles.analyticsLabel}>Stability Score</Text>
              <Text style={styles.analyticsValue}>{stability}%</Text>
            </View>
            <View style={styles.analyticsItem}>
              <Text style={styles.analyticsLabel}>Variability</Text>
              <Text style={styles.analyticsValue}>{metrics.variability}%</Text>
            </View>
            <View style={styles.analyticsItem}>
              <Text style={styles.analyticsLabel}>Trend Direction</Text>
              <Text style={styles.analyticsValue}>
                {metrics.trend > 0 ? "+" : ""}
                {metrics.trend.toFixed(2)}
              </Text>
            </View>
            <View style={styles.analyticsItem}>
              <Text style={styles.analyticsLabel}>Recovery Score</Text>
              <Text style={styles.analyticsValue}>{metrics.recovery}%</Text>
            </View>
            <View style={styles.analyticsItem}>
              <Text style={styles.analyticsLabel}>Peak Intensity</Text>
              <Text style={styles.analyticsValue}>
                {metrics.peakIntensity.toFixed(2)}
              </Text>
            </View>
            <View style={styles.analyticsItem}>
              <Text style={styles.analyticsLabel}>Emotional Balance</Text>
              <Text style={styles.analyticsValue}>{metrics.balance}%</Text>
            </View>
            <View style={styles.analyticsItem}>
              <Text style={styles.analyticsLabel}>Momentum (Last 3)</Text>
              <Text style={styles.analyticsValue}>
                {metrics.momentum > 0 ? "+" : ""}
                {metrics.momentum.toFixed(2)}
              </Text>
            </View>
            <View style={styles.analyticsItem}>
              <Text style={styles.analyticsLabel}>Resilience</Text>
              <Text style={styles.analyticsValue}>{metrics.resilience}%</Text>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>

      <Modal
        transparent
        visible={faqVisible}
        animationType="fade"
        onRequestClose={() => setFaqVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.faqModalCard}>
            <Text style={styles.faqTitle}>Analysis Scores FAQ</Text>
            <ScrollView style={styles.faqScroll}>
              {SCORE_FAQ.map((item) => (
                <View key={item.key} style={styles.faqItem}>
                  <Text style={styles.faqItemTitle}>{item.title}</Text>
                  <Text style={styles.faqItemDescription}>
                    {item.description}
                  </Text>
                </View>
              ))}
            </ScrollView>
            <Pressable
              style={styles.faqCloseButton}
              onPress={() => setFaqVisible(false)}
            >
              <Text style={styles.faqCloseButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 28 },
  filterContainer: { marginBottom: 12 },
  filterRow: { flexDirection: "row", gap: 8, paddingBottom: 2 },
  periodNavRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  periodButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#F8FAFC",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  periodButtonText: { color: COLORS.text, fontWeight: "700", fontSize: 12 },
  periodLabel: {
    color: COLORS.text,
    fontWeight: "700",
    fontSize: 12,
    flexShrink: 1,
  },
  periodTodayButton: {
    borderWidth: 1,
    borderColor: "#93C5FD",
    backgroundColor: "#EFF6FF",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  periodTodayText: { color: COLORS.primary, fontWeight: "700", fontSize: 12 },
  customRangeRow: {
    marginTop: 8,
    flexDirection: "row",
    gap: 8,
  },
  customDateButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  customDateText: {
    color: COLORS.text,
    fontWeight: "600",
    fontSize: 12,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#F8FAFC",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  filterChipActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "#93C5FD",
  },
  filterText: { color: COLORS.textMuted, fontWeight: "600" },
  filterTextActive: { color: COLORS.primary },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 16,
    marginBottom: 10,
  },
  chartHintText: {
    marginBottom: 8,
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  chartFrame: {
    flexDirection: "row",
    alignItems: "center",
  },
  chartMain: {
    flex: 1,
  },
  axisYTitle: {
    width: 24,
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    transform: [{ rotate: "-90deg" }],
  },
  axisXTitle: {
    marginTop: 2,
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  chart: { borderRadius: 12 },
  emptyWrap: {
    height: 180,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: { color: COLORS.textMuted, fontWeight: "600" },
  metricsRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  metricCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  metricLabel: { color: COLORS.textMuted, fontWeight: "600" },
  metricValue: {
    marginTop: 4,
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.text,
  },
  slotGrid: { flexDirection: "row", gap: 8 },
  slotCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  slotDot: { width: 14, height: 14, borderRadius: 999, marginBottom: 6 },
  slotName: { color: COLORS.text, fontWeight: "700" },
  slotValue: { color: COLORS.textMuted, marginTop: 2, fontSize: 12 },
  slotSummaryText: {
    marginBottom: 10,
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  slotConsistency: {
    color: COLORS.textMuted,
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
  },
  analyticsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  analyticsHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  faqButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#93C5FD",
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  analyticsItem: {
    width: "48%",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  analyticsLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  analyticsValue: {
    marginTop: 4,
    color: COLORS.text,
    fontSize: 18,
    fontWeight: "800",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  faqModalCard: {
    width: "100%",
    maxHeight: "80%",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    padding: 14,
  },
  faqTitle: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 18,
    marginBottom: 10,
  },
  faqScroll: {
    maxHeight: 360,
  },
  faqItem: {
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    padding: 10,
  },
  faqItemTitle: {
    color: COLORS.text,
    fontWeight: "700",
    marginBottom: 4,
  },
  faqItemDescription: {
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  faqCloseButton: {
    marginTop: 8,
    borderRadius: 12,
    height: 42,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  faqCloseButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});

