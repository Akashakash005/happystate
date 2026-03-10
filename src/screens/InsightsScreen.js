import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../context/ThemeContext";
import { getEntries } from "../services/storageService";
import { getStats } from "../utils/analytics";
import { useAuth } from "../context/AuthContext";
import { generateInsight } from "../services/aiService";

const RANGE_OPTIONS = ["day", "week", "month", "year"];

function capitalize(value) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildInsights(entries, stats, isPrivateMode = false) {
  if (!entries.length) {
    return [
      isPrivateMode
        ? "Start logging private levels to unlock your hidden pattern insights."
        : "Start tracking daily to unlock personalized insights.",
    ];
  }

  const messages = [];

  if (isPrivateMode) {
    if (stats.trend === "up")
      messages.push(
        "Your private intensity is climbing. Watch what is feeding the build-up.",
      );
    if (stats.trend === "down")
      messages.push(
        "Your private charge has cooled recently. Notice whether that feels like relief, avoidance, or recovery.",
      );
    if (stats.trend === "stable")
      messages.push(
        "Your private pattern looks steady. That makes trigger timing easier to spot.",
      );

    if (stats.streak >= 5)
      messages.push(`Consistent private logging: ${stats.streak}-day streak.`);
    if (stats.average >= 4)
      messages.push(
        "Your recent private levels stay high. Look for repeating time slots, cues, and loops.",
      );
    if (stats.average < 3)
      messages.push(
        "Your private levels have stayed relatively low. That can still reveal useful contrast against your public pattern.",
      );

    return messages;
  }

  if (stats.trend === "up")
    messages.push(
      "Your recent mood trend is improving. Keep your current routines.",
    );
  if (stats.trend === "down")
    messages.push(
      "Your mood dipped recently. Try sleep, movement, and short breaks.",
    );
  if (stats.trend === "stable")
    messages.push(
      "Your mood is stable. Small habit upgrades can create positive momentum.",
    );

  if (stats.streak >= 5)
    messages.push(`Strong consistency: ${stats.streak}-day tracking streak.`);
  if (stats.average >= 4)
    messages.push(
      "Overall mood is strong. Capture what is working and repeat it.",
    );
  if (stats.average < 3)
    messages.push(
      "Average mood is low. Consider reducing stressors and adding recovery time.",
    );

  return messages;
}

function parseInsightSections(text, isPrivateMode = false) {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const sectionDefs = [
    {
      key: "trend",
      heading: "WHAT IM NOTICING",
      title: isPrivateMode ? "Current Heat" : "What I am Noticing",
    },
    {
      key: "risk",
      heading: "WATCH FOR",
      title: isPrivateMode ? "Trigger Pattern" : "Watch For",
    },
    {
      key: "actions",
      heading: "TRY THIS TOMORROW",
      title: isPrivateMode ? "Boundary Shift" : "Try This Tomorrow",
    },
    {
      key: "reflection",
      heading: "REFLECTION",
      title: isPrivateMode ? "Shadow Reflection" : "Reflection",
    },
  ];

  const result = { trend: "", risk: "", actions: "", reflection: "" };
  let current = "";

  lines.forEach((line) => {
    const normalized = line.replace(":", "").toUpperCase();
    const match = sectionDefs.find((section) =>
      normalized.startsWith(section.heading),
    );
    if (match) {
      current = match.key;
      return;
    }
    if (current) {
      result[current] = result[current] ? `${result[current]}\n${line}` : line;
    }
  });

  const cards = sectionDefs
    .map((section) => ({ title: section.title, body: result[section.key] }))
    .filter((card) => card.body);

  if (!cards.length && text) {
    return [{ title: "AI Reflection", body: text }];
  }

  return cards;
}

function moodLabel(avg) {
  if (avg > 0.2) return "Positive";
  if (avg < -0.2) return "Strained";
  return "Neutral";
}

function stabilityLabel(score) {
  if (score >= 80) return "Highly Stable";
  if (score >= 60) return "Moderately Stable";
  return "Needs Support";
}

function confidenceLabel(entryCount, range) {
  const expected =
    range === "day" ? 1 : range === "week" ? 5 : range === "month" ? 15 : 60;
  if (entryCount >= expected) return "High";
  if (entryCount >= Math.ceil(expected / 2)) return "Moderate";
  return "Low";
}

export default function InsightsScreen() {
  const { colors, isPrivateMode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [entries, setEntries] = useState([]);
  const [selectedRange, setSelectedRange] = useState("week");
  const [insightText, setInsightText] = useState("");
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState("");
  const [limitRemaining, setLimitRemaining] = useState(null);
  const [insightSummary, setInsightSummary] = useState(null);

  const { user, profile, logout, authLoading } = useAuth();

  const load = useCallback(async () => {
    const all = await getEntries();
    setEntries(all);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const stats = useMemo(() => getStats(entries), [entries]);
  const insights = useMemo(
    () => buildInsights(entries, stats, isPrivateMode),
    [entries, isPrivateMode, stats],
  );

  const aiCards = useMemo(
    () => parseInsightSections(insightText, isPrivateMode),
    [insightText, isPrivateMode],
  );

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      Alert.alert("Logout failed", error?.message || "Could not logout.");
    }
  };

  const onGetAiSuggestion = async () => {
    setInsightLoading(true);
    setInsightError("");
    setInsightText("");

    try {
      const result = await generateInsight({
        allEntries: entries,
        selectedRange,
        insightMode: isPrivateMode ? "private" : "public",
        userProfile: {
          uid: user?.uid,
          displayName: profile?.displayName || "",
          email: user?.email || "",
        },
      });

      setInsightText(result.insight || "No suggestion generated.");
      setLimitRemaining(result.limitRemaining);
      setInsightSummary(result.emotionalSummary || null);
    } catch (error) {
      setInsightError(error?.message || "Failed to generate suggestion.");
    } finally {
      setInsightLoading(false);
    }
  };

  const progressPct =
    limitRemaining === null
      ? 0
      : Math.max(0, Math.min(100, (limitRemaining / 50) * 100));
  const confidence = confidenceLabel(
    insightSummary?.entryCount || 0,
    selectedRange,
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>
          {isPrivateMode ? "Private Insights" : "Personal Insights"}
        </Text>
        <Text style={styles.heroText}>
          {isPrivateMode
            ? "Based on your private tracking, here are hidden patterns, trigger signals, and control insights."
            : "Based on your tracked mood history, here are actionable observations."}
        </Text>
      </View>

      <View style={styles.aiCard}>
        <Text style={styles.aiTitle}>
          {isPrivateMode ? "Private Pattern Reading" : "AI Suggestion"}
        </Text>
        <View style={styles.rangeRow}>
          {RANGE_OPTIONS.map((range) => {
            const active = range === selectedRange;
            return (
              <Pressable
                key={range}
                style={[styles.rangeButton, active && styles.rangeButtonActive]}
                onPress={() => setSelectedRange(range)}
              >
                <Text
                  style={[
                    styles.rangeButtonText,
                    active && styles.rangeButtonTextActive,
                  ]}
                >
                  {capitalize(range)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          style={[styles.primaryButton, insightLoading && styles.disabled]}
          onPress={onGetAiSuggestion}
          disabled={insightLoading}
        >
          <Text style={styles.primaryButtonText}>
            {insightLoading ? "Generating..." : "Get AI Suggestion"}
          </Text>
        </Pressable>

        {insightLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>
              {isPrivateMode
                ? "Reading your private pattern..."
                : "Building your reflection..."}
            </Text>
          </View>
        ) : null}

        {insightError ? (
          <Text style={styles.errorText}>{insightError}</Text>
        ) : null}

        {insightSummary ? (
          <View style={styles.snapshotCard}>
            <Text style={styles.snapshotTitle}>
              {capitalize(selectedRange)} {isPrivateMode ? "Private Snapshot" : "Snapshot"}
            </Text>
            <Text style={styles.snapshotLine}>
              {isPrivateMode ? "Average Level" : "Average Mood"}:{" "}
              {isPrivateMode
                ? (((insightSummary?.overallAverage || 0) * 2 + 3).toFixed(1) + "/5")
                : `${moodLabel(insightSummary?.overallAverage || 0)} (${(insightSummary?.overallAverage || 0).toFixed(2)})`}
            </Text>
            <Text style={styles.snapshotLine}>
              {isPrivateMode ? "Pattern Stability" : "Stability"}: {insightSummary?.stabilityScore ?? 0}% (
              {stabilityLabel(insightSummary?.stabilityScore ?? 0)})
            </Text>
            <Text style={styles.snapshotLine}>
              {isPrivateMode ? "Most Charged Window" : "Most Challenging Time"}:{" "}
              {capitalize(insightSummary?.commonNegativeTime || "n/a")}
            </Text>
            <Text style={styles.snapshotLine}>
              Insight Confidence: {confidence} (Data points:{" "}
              {insightSummary?.entryCount ?? 0})
            </Text>
          </View>
        ) : null}

        {!insightLoading && !insightError
          ? aiCards.map((card) => (
              <View key={card.title} style={styles.aiDetailCard}>
                <Text style={styles.aiDetailTitle}>{card.title}</Text>
                <Text style={styles.aiDetailBody}>{card.body}</Text>
              </View>
            ))
          : null}

        {limitRemaining !== null ? (
          <View style={styles.footerCard}>
            <Text style={styles.limitText}>
              AI Requests Remaining Today: {limitRemaining}
            </Text>
            <View style={styles.progressTrack}>
              <View
                style={[styles.progressFill, { width: `${progressPct}%` }]}
              />
            </View>
          </View>
        ) : null}
      </View>

      {insights.map((text, idx) => (
        <View key={`${text}-${idx}`} style={styles.card}>
          <Text style={styles.cardText}>{text}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 24 },
  accountCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  accountLabel: { color: colors.textMuted, fontWeight: "600", marginBottom: 2 },
  accountValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10,
  },
  logoutButton: {
    alignSelf: "flex-start",
    backgroundColor: colors.inputAccent,
    borderWidth: 1,
    borderColor: colors.inputAccentBorder,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  logoutText: { color: colors.primary, fontWeight: "700" },
  disabled: { opacity: 0.7 },
  hero: {
    backgroundColor: colors.inputAccent,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.inputAccentBorder,
    marginBottom: 12,
  },
  heroTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  heroText: { marginTop: 6, color: colors.text, lineHeight: 20 },
  aiCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  aiTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 8,
  },
  rangeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  rangeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    backgroundColor: colors.inputSurface,
    alignItems: "center",
  },
  rangeButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.inputAccent,
  },
  rangeButtonText: {
    color: colors.textMuted,
    fontWeight: "600",
    fontSize: 12,
  },
  rangeButtonTextActive: {
    color: colors.primary,
  },
  primaryButton: {
    marginTop: 12,
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 46,
    justifyContent: "center",
    alignItems: "center",
  },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 16 },
  loadingCard: {
    marginTop: 12,
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  loadingText: { marginLeft: 8, color: colors.textMuted },
  errorText: {
    marginTop: 12,
    color: colors.danger,
    lineHeight: 20,
    fontWeight: "600",
  },
  snapshotCard: {
    marginTop: 12,
    backgroundColor: colors.inputSurface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  snapshotTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 6,
  },
  snapshotLine: { color: colors.text, marginBottom: 4, lineHeight: 20 },
  aiDetailCard: {
    marginTop: 10,
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
  },
  aiDetailTitle: { color: colors.text, fontWeight: "800", marginBottom: 6 },
  aiDetailBody: { color: colors.text, lineHeight: 21 },
  footerCard: {
    marginTop: 10,
    backgroundColor: colors.inputSurface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
  },
  limitText: { color: colors.textMuted, fontWeight: "700", marginBottom: 8 },
  progressTrack: {
    height: 8,
    borderRadius: 99,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  progressFill: {
    height: 8,
    borderRadius: 99,
    backgroundColor: colors.primary,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  cardText: { color: colors.text, lineHeight: 22, fontWeight: "500" },
});
