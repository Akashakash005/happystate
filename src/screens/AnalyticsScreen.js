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
  calculateDailyAverage,
  calculateHalfYearAverage,
  calculateSlotAverage,
  calculateStabilityScore,
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
  const dailyAverage = useMemo(
    () => calculateDailyAverage(filteredEntries),
    [filteredEntries],
  );
  const slotAverage = useMemo(
    () => calculateSlotAverage(filteredEntries),
    [filteredEntries],
  );
  const stability = useMemo(
    () => calculateStabilityScore(filteredEntries),
    [filteredEntries],
  );
  const halfYearAverage = useMemo(
    () =>
      filter === "jan-june" || filter === "jul-dec"
        ? calculateHalfYearAverage(entries, filter)
        : null,
    [entries, filter],
  );

  const chartData = useMemo(() => {
    if (!dailyAverage.length) {
      return null;
    }
    const labels = dailyAverage.map((item) => shortDateLabel(item.date));
    const values = dailyAverage.map((item) => item.average);
    return { labels, values };
  }, [dailyAverage]);

  const chartWidth = Math.max(Dimensions.get("window").width - 56, 300);

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
          {chartData ? (
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
