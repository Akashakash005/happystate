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
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { LineChart } from "react-native-chart-kit";
import { useFocusEffect } from "@react-navigation/native";
import { COLORS } from "../constants/colors";
import { getEntries } from "../services/storageService";
import { getFilteredData } from "../utils/analyticsFilters";
import {
  calculateDaySlotSeries,
  calculateDailyAverage,
  calculateHalfYearAverage,
  calculateSlotAverage,
  calculateStabilityFromSeries,
} from "../utils/analyticsCalculations";

const FILTERS = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "jan-june", label: "Jan-Jun" },
  { key: "jul-dec", label: "Jul-Dec" },
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

function startOfWeekMonday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const shift = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - shift);
  return d;
}

function endOfWeekSunday(date) {
  const start = startOfWeekMonday(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function startOfMonth(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfMonth(date) {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}

function getDateWindow(filter) {
  const now = new Date();
  if (filter === "week") {
    return { start: startOfWeekMonday(now), end: endOfWeekSunday(now) };
  }
  if (filter === "month") {
    return { start: startOfMonth(now), end: endOfMonth(now) };
  }
  return null;
}

function findFallbackValueBeforeDate(allEntries, dateStartTs) {
  const before = (allEntries || [])
    .filter((entry) => {
      const ts = new Date(entry.dateISO || entry.actualLoggedAt || entry.updatedAt || entry.date).getTime();
      return !Number.isNaN(ts) && ts < dateStartTs;
    })
    .sort((a, b) => {
      const ta = new Date(a.dateISO || a.actualLoggedAt || a.updatedAt || a.date).getTime();
      const tb = new Date(b.dateISO || b.actualLoggedAt || b.updatedAt || b.date).getTime();
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

  const filteredEntries = useMemo(
    () => getFilteredData(entries, filter),
    [entries, filter],
  );
  const trendSeries = useMemo(() => {
    if (filter === "day") {
      const daySlots = calculateDaySlotSeries(filteredEntries);
      return daySlots.map((item) => ({
        label: item.label,
        value: item.value,
        key: item.slot,
      }));
    }

    const daily = calculateDailyAverage(filteredEntries);
    if (filter === "week" || filter === "month") {
      const window = getDateWindow(filter);
      if (!window) return [];

      const dailyMap = Object.fromEntries(
        daily.map((item) => [item.date, item.average]),
      );
      const startTs = window.start.getTime();
      let carry = findFallbackValueBeforeDate(entries, startTs);
      const filled = [];

      const cursor = new Date(window.start);
      while (cursor.getTime() <= window.end.getTime()) {
        const key = toIsoDay(cursor);
        if (Object.prototype.hasOwnProperty.call(dailyMap, key)) {
          carry = dailyMap[key];
        }
        filled.push({
          label: shortDateLabel(key),
          value: carry,
          key,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      return filled;
    }

    return daily.map((item) => ({
      label: shortDateLabel(item.date),
      value: item.average,
      key: item.date,
    }));
  }, [entries, filteredEntries, filter]);
  const slotAverage = useMemo(
    () => calculateSlotAverage(filteredEntries),
    [filteredEntries],
  );
  const stability = useMemo(
    () => calculateStabilityFromSeries(trendSeries.map((item) => item.value)),
    [trendSeries],
  );
  const halfYearAverage = useMemo(
    () =>
      filter === "jan-june" || filter === "jul-dec"
        ? calculateHalfYearAverage(entries, filter)
        : null,
    [entries, filter],
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
  const xAxisLabel = filter === "day" ? "Entry" : "Day";
  const yAxisLabel = "Emotion";
  const chartHint =
    filter === "day"
      ? "X-axis: Entry  |  Y-axis: Emotion"
      : "X-axis: Day  |  Y-axis: Emotion (daily average; missing days use last/neutral)";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.filterRow}>
            {FILTERS.map((item) => {
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
              <Text style={styles.axisYTitle}>{yAxisLabel}</Text>
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
                    labelColor: (opacity = 1) => `rgba(100, 116, 139, ${opacity})`,
                    decimalPlaces: 2,
                    propsForDots: {
                      r: "3",
                      strokeWidth: "1",
                      stroke: "#1D4ED8",
                    },
                  }}
                  bezier
                  style={styles.chart}
                />
                <Text style={styles.axisXTitle}>{xAxisLabel}</Text>
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
            colors={["#7b91eb", "#6E8BFF", "#E3E8FF"]}
            locations={[0, 0.5, 1]}
            start={{ x: 1, y: 1 }} // bottom-right
            end={{ x: 0, y: 0 }} // top-left
            style={styles.metricCard}
          >
            <Text style={styles.metricLabel}>Stability Score</Text>
            <Text style={styles.metricValue}>{stability}%</Text>
          </LinearGradient>
          {halfYearAverage !== null ? (
            <LinearGradient
              colors={["#7b91eb", "#6E8BFF", "#E3E8FF"]}
              locations={[0, 0.5, 1]}
              start={{ x: 1, y: 1 }} // bottom-right
              end={{ x: 0, y: 0 }} // top-left
              style={styles.metricCard}
            >
              <Text style={styles.metricLabel}>Half-Year Avg</Text>
              <Text style={styles.metricValue}>
                {halfYearAverage.toFixed(2)}
              </Text>
            </LinearGradient>
          ) : (
            <LinearGradient
              colors={["#7b91eb", "#E3E8FF"]}
              start={{ x: 1, y: 1 }} // bottom-right
              end={{ x: 0, y: 0 }} // top-left
              style={styles.metricCard}
            >
              <Text style={styles.metricLabel}>Entries</Text>
              <Text style={styles.metricValue}>{filteredEntries.length}</Text>
            </LinearGradient>
          )}
        </View>

        <LinearGradient
          colors={["#7b91eb", "#6E8BFF", "#E3E8FF"]}
          locations={[0, 0.5, 1]}
          start={{ x: 1, y: 1 }} // bottom-right
          end={{ x: 0, y: 0 }} // top-left
          style={styles.card}
        >
          <Text style={styles.cardTitle}>Time Slot Pattern</Text>
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
              </View>
            ))}
          </View>
        </LinearGradient>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 28 },
  filterContainer: { marginBottom: 12 },
  filterRow: { flexDirection: "row", gap: 8, paddingBottom: 2 },
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
});
