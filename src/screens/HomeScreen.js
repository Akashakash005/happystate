import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import MoodSelector from "../components/MoodSelector";
import { COLORS } from "../constants/colors";
import { getMoodMeta } from "../constants/moods";
import {
  deleteEntry,
  getEntries,
  upsertEntry,
} from "../services/storageService";
import { formatLongDate, toDateKey } from "../utils/date";

const SLOT_OPTIONS = ["morning", "afternoon", "evening", "night"];
const SLOT_ORDER = { morning: 1, afternoon: 2, evening: 3, night: 4 };

function capitalize(value) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getSlotByHour(hour) {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

export default function HomeScreen() {
  const [entries, setEntries] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [entryDate, setEntryDate] = useState(new Date());
  const [entrySlot, setEntrySlot] = useState(
    getSlotByHour(new Date().getHours()),
  );
  const [entryMood, setEntryMood] = useState(3);
  const [entryNote, setEntryNote] = useState("");
  const [editingEntryId, setEditingEntryId] = useState(null);

  const loadEntries = useCallback(async () => {
    const all = await getEntries();
    setEntries(all);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadEntries();
    }, [loadEntries]),
  );

  const hydrateDraftFromEntry = useCallback(
    (dateKey, slot) => {
      const existing = entries.find(
        (item) => item.date === dateKey && item.slot === slot,
      );
      if (existing) {
        setEntryMood(existing.mood);
        setEntryNote(existing.note || "");
        setEditingEntryId(existing.id);
      } else {
        setEntryMood(3);
        setEntryNote("");
        setEditingEntryId(null);
      }
    },
    [entries],
  );

  const resetDraft = useCallback(() => {
    const now = new Date();
    const slot = getSlotByHour(now.getHours());
    const dateKey = toDateKey(now);
    setEntryDate(now);
    setEntrySlot(slot);
    hydrateDraftFromEntry(dateKey, slot);
  }, [hydrateDraftFromEntry]);

  const onChangeDraftDate = (_, selectedDate) => {
    setShowDatePicker(false);
    if (!selectedDate) return;
    setEntryDate(selectedDate);
    hydrateDraftFromEntry(toDateKey(selectedDate), entrySlot);
  };

  const onChangeSlot = (slot) => {
    setEntrySlot(slot);
    hydrateDraftFromEntry(toDateKey(entryDate), slot);
  };

  const onSaveEntry = async () => {
    if (saving) return;
    setSaving(true);
    const dateKey = toDateKey(entryDate);
    const exists = entries.some(
      (item) => item.date === dateKey && item.slot === entrySlot,
    );

    try {
      const updated = await upsertEntry({
        date: dateKey,
        slot: entrySlot,
        mood: entryMood,
        note: entryNote.trim(),
        actualLoggedAt: new Date().toISOString(),
        isBackfilled: dateKey !== toDateKey(new Date()),
      });
      setEntries(updated);
      Alert.alert(
        "Saved",
        exists ? "Entry updated for this slot." : "New entry saved.",
      );
      resetDraft();
    } finally {
      setSaving(false);
    }
  };

  const onDeleteEntry = async (entry) => {
    Alert.alert("Delete entry", "This entry will be removed permanently.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const updated = await deleteEntry({
            id: entry.id,
            date: entry.date,
            slot: entry.slot,
          });
          setEntries(updated);
          if (editingEntryId === entry.id) {
            resetDraft();
          }
        },
      },
    ]);
  };

  const onEditEntry = (entry) => {
    const draftDate = new Date(entry.date);
    setEntryDate(draftDate);
    setEntrySlot(entry.slot);
    setEntryMood(entry.mood);
    setEntryNote(entry.note || "");
    setEditingEntryId(entry.id);
  };

  const groupedEntries = useMemo(() => {
    const groups = entries.reduce((acc, item) => {
      if (!acc[item.date]) acc[item.date] = [];
      acc[item.date].push(item);
      return acc;
    }, {});

    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map((date) => ({
        date,
        items: [...groups[date]].sort(
          (a, b) => (SLOT_ORDER[b.slot] || 0) - (SLOT_ORDER[a.slot] || 0),
        ),
      }));
  }, [entries]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: "padding", android: "height" })}
      keyboardVerticalOffset={Platform.select({ ios: 8, android: 14 })}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient
          colors={["#7b91eb", "#6E8BFF", "#E3E8FF"]}
          locations={[0, 0.5, 1]}
          start={{ x: 1, y: 1 }} // bottom-right
          end={{ x: 0, y: 0 }} // top-left
          style={styles.formCard}
        >
          <Text style={styles.title}> What you are feeling now?</Text>
          <Text style={styles.metaText}>
            Date: {formatLongDate(entryDate)} | Slot: {capitalize(entrySlot)}
          </Text>

          <Pressable
            style={styles.dateButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={styles.dateButtonText}>Choose Date</Text>
          </Pressable>

          {showDatePicker ? (
            <DateTimePicker
              value={entryDate}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={onChangeDraftDate}
            />
          ) : null}

          <View style={styles.slotRow}>
            {SLOT_OPTIONS.map((slot) => {
              const active = slot === entrySlot;
              return (
                <Pressable
                  key={slot}
                  style={[styles.slotButton, active && styles.slotButtonActive]}
                  onPress={() => onChangeSlot(slot)}
                >
                  <Text
                    style={[
                      styles.slotButtonText,
                      active && styles.slotButtonTextActive,
                    ]}
                  >
                    {capitalize(slot)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <MoodSelector value={entryMood} onChange={setEntryMood} />

          <TextInput
            value={entryNote}
            onChangeText={setEntryNote}
            placeholder="Start with a thought, a feeling, or a moment…"
            placeholderTextColor={COLORS.textMuted}
            style={styles.input}
            multiline
            maxLength={180}
          />

          <View style={styles.entryActions}>
            <Pressable
              style={[styles.primaryButton, saving && styles.buttonDisabled]}
              onPress={onSaveEntry}
              disabled={saving}
            >
              <Text style={styles.primaryButtonText}>
                {saving ? "Saving..." : "Save Entry"}
              </Text>
            </Pressable>
          </View>
        </LinearGradient>

        <Text style={styles.sectionTitle}>Entries By Date</Text>

        {!groupedEntries.length ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              No entries yet. Add your first mood above.
            </Text>
          </View>
        ) : (
          groupedEntries.map((group) => (
            <View key={group.date} style={styles.dateGroup}>
              <Text style={styles.dateHeader}>
                {formatLongDate(group.date)}
              </Text>
              {group.items.map((entry) => {
                const meta = getMoodMeta(entry.mood);
                return (
                  <LinearGradient
                    key={entry.id}
                    colors={["#7b91eb", "#6E8BFF", "#E3E8FF"]}
                    locations={[0, 0.5, 1]}
                    start={{ x: 1, y: 1 }} // bottom-right
                    end={{ x: 0, y: 0 }} // top-left
                    style={styles.entryCard}
                  >
                    <View style={styles.entryTopRow}>
                      <Text style={styles.entrySlot}>
                        {capitalize(entry.slot)}
                      </Text>
                      <View style={styles.entryTopActions}>
                        <Pressable
                          style={styles.iconActionButton}
                          onPress={() => onEditEntry(entry)}
                        >
                          <Ionicons
                            name="create-outline"
                            size={16}
                            color={COLORS.primary}
                          />
                        </Pressable>
                        <Pressable
                          style={[
                            styles.iconActionButton,
                            styles.deleteIconActionButton,
                          ]}
                          onPress={() => onDeleteEntry(entry)}
                        >
                          <Ionicons
                            name="trash-outline"
                            size={16}
                            color={COLORS.danger}
                          />
                        </Pressable>
                      </View>
                    </View>

                    {entry.note ? (
                      <Text style={styles.entryNote}>{entry.note}</Text>
                    ) : null}

                    <View
                      style={[styles.badge, { backgroundColor: meta.color }]}
                    >
                      <Text style={styles.badgeText}>{meta.label}</Text>
                    </View>
                  </LinearGradient>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 36 },
  formCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 16,
  },
  title: { fontSize: 26, fontWeight: "800", color: COLORS.text },
  metaText: {
    marginTop: 4,
    marginBottom: 10,
    color: COLORS.text,
    fontWeight: "600",
    paddingHorizontal: 10,
  },
  dateButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#93C5FD",
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  dateButtonText: { color: COLORS.primary, fontWeight: "700" },
  slotRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  slotButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 10,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
  },
  slotButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: "#EFF6FF",
  },
  slotButtonText: {
    color: COLORS.textMuted,
    fontWeight: "600",
    fontSize: 12,
  },
  slotButtonTextActive: {
    color: COLORS.primary,
  },
  input: {
    marginTop: 12,
    minHeight: 86,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: "top",
    color: COLORS.text,
    backgroundColor: "#F8FAFC",
  },
  entryActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 12,
    height: 46,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#F8FAFC",
  },
  secondaryButtonText: { color: COLORS.textMuted, fontWeight: "700" },
  primaryButton: {
    flex: 1,
    borderRadius: 12,
    height: 46,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.primary,
  },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 16 },
  buttonDisabled: { opacity: 0.7 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 10,
  },
  empty: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    padding: 14,
  },
  emptyText: { color: COLORS.textMuted },
  dateGroup: { marginBottom: 14 },
  dateHeader: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 16,
    marginBottom: 8,
  },
  entryCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  entryTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  entrySlot: { color: COLORS.text, fontWeight: "700" },
  entryTopActions: {
    flexDirection: "row",
    gap: 8,
  },
  iconActionButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteIconActionButton: {
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  entryNote: {
    marginTop: 8,
    color: COLORS.text,
    lineHeight: 20,
    fontWeight: "700",
    fontStyle: "italic",
  },
  badge: {
    marginTop: 10,
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
});
