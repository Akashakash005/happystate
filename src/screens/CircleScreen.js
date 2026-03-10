import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../context/ThemeContext";
import {
  deleteCirclePerson,
  getCircleState,
  refreshCircleState,
  saveCirclePersonEdit,
} from "../services/circleService";
import { getGeminiQuotaState } from "../services/aiJournalService";
import { formatLongDate } from "../utils/date";

function moodCorrelationLabel(avgMood) {
  if (avgMood >= 0.2) return "Positive";
  if (avgMood <= -0.2) return "Stress-linked";
  return "Mixed";
}

function moodCorrelationColor(avgMood, colors) {
  if (avgMood >= 0.2) return colors.success;
  if (avgMood <= -0.2) return colors.danger;
  return colors.warning;
}

export default function CircleScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState("summary");
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editKey, setEditKey] = useState("");
  const [editPerson, setEditPerson] = useState("");
  const [editAliases, setEditAliases] = useState("");
  const [quotaModalVisible, setQuotaModalVisible] = useState(false);
  const [quotaMessage, setQuotaMessage] = useState("");

  const loadCircleState = useCallback(async () => {
    const state = await getCircleState();
    setResult(state);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCircleState();
    }, [loadCircleState]),
  );

  const analyzeConnections = async () => {
    setLoading(true);
    setError("");

    try {
      const quotaBefore = getGeminiQuotaState();
      const analysis = await refreshCircleState();
      setResult(analysis);
      const quotaAfter = getGeminiQuotaState();
      if (quotaAfter.active && (!quotaBefore.active || quotaAfter.message !== quotaBefore.message)) {
        setQuotaMessage(
          quotaAfter.message || "The AI is temporarily busy. Please try again after some time.",
        );
        setQuotaModalVisible(true);
      }
    } catch (e) {
      setError(e?.message || "Failed to analyze connections.");
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (person) => {
    setEditKey(person.key);
    setEditPerson(person.person);
    setEditAliases((person.aliases || []).join(", "));
    setEditModalVisible(true);
  };

  const onSaveEdit = async () => {
    const updated = await saveCirclePersonEdit({
      key: editKey,
      person: editPerson,
      aliases: String(editAliases || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    });
    setResult(updated);
    setEditModalVisible(false);
  };

  const onDeletePerson = async () => {
    const updated = await deleteCirclePerson(editKey);
    setResult(updated);
    setEditModalVisible(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.heroIcon}>
        <Ionicons name="people-outline" size={40} color={colors.primary} />
      </View>
      <Text style={styles.heroTitle}>Building Your Circle</Text>
      <Text style={styles.heroDescription}>
        Your Circle automatically detects people you mention and reveals how
        those connections correlate with your emotional patterns.
      </Text>

      <LinearGradient
        colors={colors.cardGradientAlt}
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

      <View style={styles.toggleRow}>
        <Pressable
          style={[styles.toggleChip, viewMode === "summary" && styles.toggleChipActive]}
          onPress={() => setViewMode("summary")}
        >
          <Text style={[styles.toggleChipText, viewMode === "summary" && styles.toggleChipTextActive]}>
            Circle Summary
          </Text>
        </Pressable>
        <Pressable
          style={[styles.toggleChip, viewMode === "extracted" && styles.toggleChipActive]}
          onPress={() => setViewMode("extracted")}
        >
          <Text style={[styles.toggleChipText, viewMode === "extracted" && styles.toggleChipTextActive]}>
            Extracted Names
          </Text>
        </Pressable>
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
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {result ? (
        <View style={styles.resultsWrap}>
          <Text style={styles.resultsTitle}>
            {viewMode === "summary" ? "Interaction Pattern Cards" : "Name | Other Names"}
          </Text>

          {!result.people.length ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                No repeated names yet. Mention people at least twice in journal
                chats.
              </Text>
            </View>
          ) : viewMode === "summary" ? (
            result.people.map((person) => (
              <View key={person.person} style={styles.personCard}>
                <View style={styles.personTopRow}>
                  <Text style={styles.personName}>{person.person}</Text>
                  <Text
                    style={[
                      styles.correlationTag,
                      { color: moodCorrelationColor(person.avgMood, colors) },
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
          ) : (
            result.people.map((person) => (
              <View key={person.key || person.person} style={styles.personCard}>
                <View style={styles.personTopRow}>
                  <Text style={styles.personName}>{person.person}</Text>
                  <Pressable
                    style={styles.editAliasBtn}
                    onPress={() => openEditModal(person)}
                  >
                    <Ionicons name="create-outline" size={16} color={colors.primary} />
                  </Pressable>
                </View>
                <Text style={styles.personMeta}>
                  Other Names: {(person.aliases || []).join(", ") || "None"}
                </Text>
                <Text style={styles.personMeta}>
                  Mentions: {person.mentionCount}
                </Text>
              </View>
            ))
          )}

          {viewMode === "summary" ? (
            <>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Who brings positive energy?</Text>
                <Text style={styles.summaryText}>
                  {result.positiveEnergy.length
                    ? result.positiveEnergy.join(", ")
                    : "No strong positive patterns yet."}
                </Text>
              </View>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Who correlates with stress?</Text>
                <Text style={styles.summaryText}>
                  {result.stressCorrelated.length
                    ? result.stressCorrelated.join(", ")
                    : "No strong stress-linked patterns yet."}
                </Text>
              </View>
            </>
          ) : null}
        </View>
      ) : null}

      <Modal
        transparent
        visible={quotaModalVisible}
        animationType="fade"
        onRequestClose={() => setQuotaModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.quotaModalCard}>
            <LinearGradient
              colors={colors.cardGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.quotaModalGlow}
            >
              <Text style={styles.modalTitle}>AI Temporarily Busy</Text>
              <Text style={styles.quotaModalMessage}>
                {quotaMessage || "Please try again after some time."}
              </Text>
              <Pressable
                style={styles.modalPrimaryBtn}
                onPress={() => setQuotaModalVisible(false)}
              >
                <Text style={styles.modalPrimaryText}>Okay</Text>
              </Pressable>
            </LinearGradient>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={editModalVisible}
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Extracted Person</Text>
            <TextInput
              style={styles.aliasInput}
              value={editPerson}
              onChangeText={setEditPerson}
              placeholder="Primary name"
              placeholderTextColor={colors.textMuted}
            />
            <TextInput
              style={[styles.aliasInput, styles.aliasTextarea]}
              value={editAliases}
              onChangeText={setEditAliases}
              placeholder="Other names, comma separated"
              placeholderTextColor={colors.textMuted}
              multiline
            />
            <View style={styles.modalActionRow}>
              <Pressable
                style={styles.modalSecondaryBtn}
                onPress={() => setEditModalVisible(false)}
              >
                <Text style={styles.modalSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalDeleteBtn} onPress={onDeletePerson}>
                <Text style={styles.modalDeleteText}>Delete</Text>
              </Pressable>
              <Pressable style={styles.modalPrimaryBtn} onPress={onSaveEdit}>
                <Text style={styles.modalPrimaryText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 28 },
  heroIcon: {
    width: 86,
    height: 86,
    borderRadius: 999,
    backgroundColor: colors.border,
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
    color: colors.text,
  },
  heroDescription: {
    marginTop: 10,
    textAlign: "center",
    color: colors.textMuted,
    lineHeight: 28,
    fontSize: 15,
    paddingHorizontal: 10,
  },
  discoveryCard: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    backgroundColor: colors.surface,
  },
  discoveryTitle: {
    fontSize: 25,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 8,
  },
  discoveryItem: { marginTop: 10 },
  discoveryLabel: { fontSize: 20, fontWeight: "700", color: colors.text },
  discoveryText: {
    marginTop: 2,
    color: colors.text,
    fontSize: 20,
    lineHeight: 28,
  },
  infoBar: {
    marginTop: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 10,
    alignItems: "center",
  },
  infoBarText: { color: colors.textMuted, fontWeight: "600" },
  toggleRow: {
    marginTop: 16,
    flexDirection: "row",
    gap: 8,
  },
  toggleChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputSurface,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  toggleChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.inputAccent,
  },
  toggleChipText: { color: colors.textMuted, fontWeight: "700", fontSize: 12 },
  toggleChipTextActive: { color: colors.primary },
  analyzeButton: {
    marginTop: 16,
    alignSelf: "center",
    borderRadius: 12,
    backgroundColor: colors.primary,
    minWidth: 220,
    height: 50,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  analyzeButtonDisabled: { opacity: 0.7 },
  analyzeButtonText: { color: colors.surface, fontWeight: "800", fontSize: 16 },
  loadingWrap: { marginTop: 10, alignItems: "center" },
  errorText: { marginTop: 10, color: colors.danger, fontWeight: "600" },
  resultsWrap: { marginTop: 18 },
  resultsTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 10,
  },
  emptyCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: colors.surface,
  },
  emptyText: { color: colors.textMuted },
  personCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: colors.surface,
    marginBottom: 8,
  },
  personTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  personName: { color: colors.text, fontWeight: "800", fontSize: 16 },
  editAliasBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  correlationTag: { fontWeight: "700" },
  personMeta: { color: colors.textMuted, marginTop: 4 },
  summaryCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: colors.surface,
  },
  summaryTitle: { color: colors.text, fontWeight: "800", marginBottom: 4 },
  summaryText: { color: colors.textMuted, lineHeight: 20 },
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
  quotaModalCard: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  quotaModalGlow: {
    padding: 18,
  },
  modalTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 18,
    marginBottom: 10,
  },
  quotaModalMessage: {
    color: colors.text,
    lineHeight: 22,
    marginBottom: 14,
  },
  aliasInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.inputSurface,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  aliasTextarea: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  modalActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  modalPrimaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  modalPrimaryText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  modalDeleteBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.dangerBorder || colors.danger,
    backgroundColor: colors.dangerSurface || colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  modalDeleteText: {
    color: colors.danger,
    fontWeight: "800",
  },
  modalSecondaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  modalSecondaryText: {
    color: colors.textMuted,
    fontWeight: "700",
  },
});
