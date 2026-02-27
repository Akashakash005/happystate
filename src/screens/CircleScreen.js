import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../constants/colors";
import { getAllJournalEntries } from "../services/journalService";
import { buildCircle } from "../utils/buildCircle";
import { formatLongDate } from "../utils/date";

function moodCorrelationLabel(avgMood) {
  if (avgMood >= 0.2) return "Positive";
  if (avgMood <= -0.2) return "Stress-linked";
  return "Mixed";
}

function moodCorrelationColor(avgMood) {
  if (avgMood >= 0.2) return COLORS.success;
  if (avgMood <= -0.2) return COLORS.danger;
  return COLORS.warning;
}

export default function CircleScreen() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const analyzeConnections = async () => {
    setLoading(true);
    setError("");

    try {
      const entries = await getAllJournalEntries();
      const analysis = await buildCircle(
        entries.map((entry) => ({
          text: entry.text,
          mood: entry.sentimentScore,
          date: entry.date,
        })),
      );
      setResult(analysis);
    } catch (e) {
      setError(e?.message || "Failed to analyze connections.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.heroIcon}>
        <Ionicons name="people-outline" size={40} color={COLORS.primary} />
      </View>
      <Text style={styles.heroTitle}>Building Your Circle</Text>
      <Text style={styles.heroDescription}>
        Your Circle automatically detects people you mention and reveals how
        those connections correlate with your emotional patterns.
      </Text>

      <LinearGradient
        colors={["#7b91eb", "#6E8BFF", "#E3E8FF"]}
        locations={[0, 0.5, 1]}
        start={{ x: 1, y: 1 }} // bottom-right
        end={{ x: 0, y: 0 }} // top-left
        style={styles.discoveryCard}
      >
        <Text style={styles.discoveryTitle}>What You will Discover:</Text>
        <View style={styles.discoveryItem}>
          <Text style={styles.discoveryLabel}>Mood Correlations</Text>
          <Text style={styles.discoveryText}>
            See how your mood differs when writing about each person.
          </Text>
        </View>
        <View style={styles.discoveryItem}>
          <Text style={styles.discoveryLabel}>Connection Patterns</Text>
          <Text style={styles.discoveryText}>
            Find who brings positive energy and who correlates with stress.
          </Text>
        </View>
        <View style={styles.discoveryItem}>
          <Text style={styles.discoveryLabel}>Recency Awareness</Text>
          <Text style={styles.discoveryText}>
            Track the latest connections that may need attention.
          </Text>
        </View>
      </LinearGradient>

      <View style={styles.infoBar}>
        <Text style={styles.infoBarText}>
          A connection requires 2+ mentions
        </Text>
      </View>

      <Pressable
        style={[styles.analyzeButton, loading && styles.analyzeButtonDisabled]}
        onPress={analyzeConnections}
        disabled={loading}
      >
        <Text style={styles.analyzeButtonText}>
          {loading ? "Analyzing..." : "Analyze My Connections"}
        </Text>
      </Pressable>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {result ? (
        <View style={styles.resultsWrap}>
          <Text style={styles.resultsTitle}>Interaction Pattern Cards</Text>

          {!result.people.length ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                No repeated names yet. Mention people at least twice in journal
                chats.
              </Text>
            </View>
          ) : (
            result.people.map((person) => (
              <View key={person.person} style={styles.personCard}>
                <View style={styles.personTopRow}>
                  <Text style={styles.personName}>{person.person}</Text>
                  <Text
                    style={[
                      styles.correlationTag,
                      { color: moodCorrelationColor(person.avgMood) },
                    ]}
                  >
                    {moodCorrelationLabel(person.avgMood)}
                  </Text>
                </View>
                <Text style={styles.personMeta}>
                  Mentions: {person.mentionCount}
                </Text>
                <Text style={styles.personMeta}>
                  Average Mood Score: {person.avgMood.toFixed(2)}
                </Text>
                <Text style={styles.personMeta}>
                  Last Mention: {formatLongDate(person.lastMentionDate)}
                </Text>
              </View>
            ))
          )}

          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Who brings positive energy?</Text>
            <Text style={styles.summaryText}>
              {result.positiveEnergy.length
                ? result.positiveEnergy
                    .map((person) => person.person)
                    .join(", ")
                : "No strong positive patterns yet."}
            </Text>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Who correlates with stress?</Text>
            <Text style={styles.summaryText}>
              {result.stressCorrelated.length
                ? result.stressCorrelated
                    .map((person) => person.person)
                    .join(", ")
                : "No strong stress-linked patterns yet."}
            </Text>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 28 },
  heroIcon: {
    width: 86,
    height: 86,
    borderRadius: 999,
    backgroundColor: COLORS.border,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  heroTitle: {
    marginTop: 16,
    textAlign: "center",
    fontSize: 36,
    fontWeight: "800",
    color: COLORS.text,
  },
  heroDescription: {
    marginTop: 10,
    textAlign: "center",
    color: COLORS.textMuted,
    lineHeight: 28,
    fontSize: 15,
    paddingHorizontal: 10,
  },
  discoveryCard: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 14,
    backgroundColor: COLORS.surface,
  },
  discoveryTitle: {
    fontSize: 25,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 8,
  },
  discoveryItem: { marginTop: 10 },
  discoveryLabel: { fontSize: 20, fontWeight: "700", color: COLORS.text },
  discoveryText: {
    marginTop: 2,
    color: COLORS.text,
    fontSize: 20,
    lineHeight: 28,
  },
  infoBar: {
    marginTop: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingVertical: 10,
    alignItems: "center",
  },
  infoBarText: { color: COLORS.textMuted, fontWeight: "600" },
  analyzeButton: {
    marginTop: 16,
    alignSelf: "center",
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    minWidth: 220,
    height: 50,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  analyzeButtonDisabled: { opacity: 0.7 },
  analyzeButtonText: { color: COLORS.surface, fontWeight: "800", fontSize: 16 },
  loadingWrap: { marginTop: 10, alignItems: "center" },
  errorText: { marginTop: 10, color: COLORS.danger, fontWeight: "600" },
  resultsWrap: { marginTop: 18 },
  resultsTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 10,
  },
  emptyCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: COLORS.surface,
  },
  emptyText: { color: COLORS.textMuted },
  personCard: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: COLORS.surface,
    marginBottom: 8,
  },
  personTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  personName: { color: COLORS.text, fontWeight: "800", fontSize: 16 },
  correlationTag: { fontWeight: "700" },
  personMeta: { color: COLORS.textMuted, marginTop: 4 },
  summaryCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: COLORS.surface,
  },
  summaryTitle: { color: COLORS.text, fontWeight: "800", marginBottom: 4 },
  summaryText: { color: COLORS.textMuted, lineHeight: 20 },
});
