import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
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
import { getMoodMeta } from "../constants/moods";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { getProfile } from "../services/profileService";
import {
  deleteEntry,
  getEntries,
  upsertEntry,
} from "../services/storageService";
import {
  filterEntriesByRange,
  formatRangeLabel,
  getDateRange,
} from "../utils/analyticsRange";
import { formatLongDate, toDateKey } from "../utils/date";

const SLOT_OPTIONS = ["morning", "afternoon", "evening", "night"];
const SLOT_ORDER = { morning: 1, afternoon: 2, evening: 3, night: 4 };
const HISTORY_FILTERS = [
  { key: "week", label: "Current Week" },
  { key: "month", label: "Current Month" },
  { key: "custom", label: "Custom" },
  { key: "all", label: "All" },
];

function capitalize(value) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getWelcomeName(profileName, email) {
  const cleanProfileName = String(profileName || "").trim();
  if (cleanProfileName && !cleanProfileName.includes("@"))
    return cleanProfileName;

  const localPart = String(email || "")
    .split("@")[0]
    ?.trim();
  if (localPart) return localPart;

  return "there";
}

function getSlotByHour(hour) {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

export default function HomeScreen() {
  const { user, profile } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [entries, setEntries] = useState([]);
  const [profileName, setProfileName] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [entryDate, setEntryDate] = useState(new Date());
  const [entrySlot, setEntrySlot] = useState(
    getSlotByHour(new Date().getHours()),
  );
  const [entryMood, setEntryMood] = useState(3);
  const [entryNote, setEntryNote] = useState("");
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);
  const [editDate, setEditDate] = useState(new Date());
  const [editSlot, setEditSlot] = useState(
    getSlotByHour(new Date().getHours()),
  );
  const [editMood, setEditMood] = useState(3);
  const [editNote, setEditNote] = useState("");
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [historyFilter, setHistoryFilter] = useState("week");
  const initialCustomRange = useMemo(
    () => getDateRange("week", new Date()),
    [],
  );
  const [customStartDate, setCustomStartDate] = useState(
    initialCustomRange.start,
  );
  const [customEndDate, setCustomEndDate] = useState(initialCustomRange.end);
  const [showCustomStartPicker, setShowCustomStartPicker] = useState(false);
  const [showCustomEndPicker, setShowCustomEndPicker] = useState(false);

  const loadEntries = useCallback(async () => {
    const [all, storedProfile] = await Promise.all([
      getEntries(),
      getProfile(),
    ]);
    setEntries(all);
    setProfileName(String(storedProfile?.name || "").trim());
  }, []);

  useFocusEffect(
    useCallback(() => {
      Keyboard.dismiss();
      loadEntries();
      return () => {
        Keyboard.dismiss();
      };
    }, [loadEntries]),
  );

  const selectedDateKey = useMemo(() => toDateKey(entryDate), [entryDate]);
  const existingEntryForSelection = useMemo(
    () =>
      entries.find(
        (item) => item.date === selectedDateKey && item.slot === entrySlot,
      ) || null,
    [entries, selectedDateKey, entrySlot],
  );
  const saveDisabled = saving || Boolean(existingEntryForSelection);

  const resetDraft = useCallback(() => {
    const now = new Date();
    const slot = getSlotByHour(now.getHours());
    setEntryDate(now);
    setEntrySlot(slot);
    setEntryMood(3);
    setEntryNote("");
    setEditingEntryId(null);
  }, []);

  const onChangeDraftDate = (_, selectedDate) => {
    setShowDatePicker(false);
    if (!selectedDate) return;
    setEntryDate(selectedDate);
    setEntryMood(3);
    setEntryNote("");
    setEditingEntryId(null);
  };

  const onChangeSlot = (slot) => {
    setEntrySlot(slot);
    setEntryMood(3);
    setEntryNote("");
    setEditingEntryId(null);
  };

  const onSaveEntry = async (options = {}) => {
    const { showSavedAlert = true, closeEditModal = false } = options;
    if (existingEntryForSelection) {
      if (showSavedAlert) {
        Alert.alert(
          "Entry already exists",
          "This date and slot already has an entry. Use Edit from entry history to update it.",
        );
      }
      return;
    }
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
      if (showSavedAlert) {
        Alert.alert(
          "Saved",
          exists ? "Entry updated for this slot." : "New entry saved.",
        );
      }
      if (closeEditModal) {
        setEditModalVisible(false);
      }
      resetDraft();
    } finally {
      setSaving(false);
    }
  };

  const onDeleteEntry = (entry) => {
    setDeleteTarget(entry);
    setDeleteModalVisible(true);
  };

  const onConfirmDeleteEntry = async () => {
    if (!deleteTarget) return;
    const updated = await deleteEntry({
      id: deleteTarget.id,
      date: deleteTarget.date,
      slot: deleteTarget.slot,
    });
    setEntries(updated);
    if (editingEntryId === deleteTarget.id) {
      resetDraft();
    }
    setDeleteModalVisible(false);
    setDeleteTarget(null);
  };

  const onEditEntry = (entry) => {
    setShowEditDatePicker(false);
    setEditDate(new Date(entry.date));
    setEditSlot(entry.slot);
    setEditMood(entry.mood);
    setEditNote(entry.note || "");
    setEditingEntryId(entry.id);
    setEditModalVisible(true);
  };

  const onChangeEditDate = (_, selectedDate) => {
    setShowEditDatePicker(false);
    if (!selectedDate) return;
    setEditDate(selectedDate);
  };

  const onSaveEditedEntry = async () => {
    if (saving || !editingEntryId) return;

    const nextDateKey = toDateKey(editDate);
    const originalEntry = entries.find((item) => item.id === editingEntryId);
    if (!originalEntry) {
      setEditModalVisible(false);
      setEditingEntryId(null);
      return;
    }

    const hasConflict = entries.some(
      (item) =>
        item.id !== editingEntryId &&
        item.date === nextDateKey &&
        item.slot === editSlot,
    );
    if (hasConflict) {
      Alert.alert(
        "Entry already exists",
        "Another entry already exists for that date and slot.",
      );
      return;
    }

    setSaving(true);
    try {
      let updated = await upsertEntry({
        date: nextDateKey,
        slot: editSlot,
        mood: editMood,
        note: editNote.trim(),
        actualLoggedAt: new Date().toISOString(),
        isBackfilled: nextDateKey !== toDateKey(new Date()),
      });

      const movedDate = originalEntry.date !== nextDateKey;
      const movedSlot = originalEntry.slot !== editSlot;
      if (movedDate || movedSlot) {
        updated = await deleteEntry({ id: originalEntry.id });
      }

      setEntries(updated);
      setShowEditDatePicker(false);
      setEditModalVisible(false);
      setEditingEntryId(null);
    } finally {
      setSaving(false);
    }
  };

  const historyDateRange = useMemo(() => {
    if (historyFilter === "all") return null;
    if (historyFilter === "custom") {
      return getDateRange("custom", new Date(), {
        startDate: customStartDate,
        endDate: customEndDate,
      });
    }
    return getDateRange(historyFilter, new Date());
  }, [customEndDate, customStartDate, historyFilter]);

  const historyEntries = useMemo(() => {
    if (!historyDateRange) return entries;
    return filterEntriesByRange(entries, historyDateRange);
  }, [entries, historyDateRange]);

  const historyRangeLabel = useMemo(() => {
    if (!historyDateRange) return "All time";
    return formatRangeLabel(historyFilter, historyDateRange, new Date());
  }, [historyDateRange, historyFilter]);

  const onChangeCustomStart = useCallback((_, selectedDate) => {
    if (Platform.OS !== "ios") setShowCustomStartPicker(false);
    if (!selectedDate) return;
    setCustomStartDate(selectedDate);
  }, []);

  const onChangeCustomEnd = useCallback((_, selectedDate) => {
    if (Platform.OS !== "ios") setShowCustomEndPicker(false);
    if (!selectedDate) return;
    setCustomEndDate(selectedDate);
  }, []);

  const groupedEntries = useMemo(() => {
    const groups = historyEntries.reduce((acc, item) => {
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
  }, [historyEntries]);

  const welcomeName = useMemo(
    () => getWelcomeName(profileName || profile?.displayName, user?.email),
    [profileName, profile?.displayName, user?.email],
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: "padding", android: "height" })}
      keyboardVerticalOffset={Platform.select({ ios: 8, android: 14 })}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      >
        <Text style={styles.welcomeText}>
          Welcome back,{" "}
          <Text style={styles.welcomeNameText}>{welcomeName}</Text> !
        </Text>

        <LinearGradient
          colors={colors.cardGradientAlt}
          locations={[0, 0.5, 1]}
          start={{ x: 1, y: 1 }} // bottom-right
          end={{ x: 0, y: 0 }} // top-left
          style={styles.formCard}
        >
          <Text style={styles.title}> What you are feeling now?</Text>
          <Text style={styles.metaText}>
            Date: {formatLongDate(entryDate)} | Slot: {capitalize(entrySlot)}
          </Text>
          {existingEntryForSelection ? (
            <Text style={styles.lockedHint}>
              Entry already saved for this date and slot. Use Edit below to
              change it.
            </Text>
          ) : null}

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
            placeholderTextColor={colors.textMuted}
            style={[
              styles.input,
              existingEntryForSelection && styles.inputDisabled,
            ]}
            multiline
            maxLength={180}
            editable={!existingEntryForSelection}
          />

          <View style={styles.entryActions}>
            <Pressable
              style={[
                styles.primaryButton,
                saveDisabled && styles.buttonDisabled,
              ]}
              onPress={onSaveEntry}
              disabled={saveDisabled}
            >
              <Text style={styles.primaryButtonText}>
                {saving
                  ? "Saving..."
                  : existingEntryForSelection
                    ? "Already Saved"
                    : "Save Entry"}
              </Text>
            </Pressable>
          </View>
        </LinearGradient>

        <Text style={styles.sectionTitle}>Entries By Date</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.historyFilterRow}
        >
          {HISTORY_FILTERS.map((item) => {
            const active = item.key === historyFilter;
            return (
              <Pressable
                key={item.key}
                style={[
                  styles.historyFilterChip,
                  active && styles.historyFilterChipActive,
                ]}
                onPress={() => setHistoryFilter(item.key)}
              >
                <Text
                  style={[
                    styles.historyFilterText,
                    active && styles.historyFilterTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {historyFilter === "custom" ? (
          <View style={styles.customRangeRow}>
            <Pressable
              style={styles.customDateButton}
              onPress={() => setShowCustomStartPicker(true)}
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
              onPress={() => setShowCustomEndPicker(true)}
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
        {showCustomStartPicker ? (
          <DateTimePicker
            value={customStartDate}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={onChangeCustomStart}
          />
        ) : null}
        {showCustomEndPicker ? (
          <DateTimePicker
            value={customEndDate}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={onChangeCustomEnd}
          />
        ) : null}
        <Text style={styles.historyRangeText}>{historyRangeLabel}</Text>

        {!groupedEntries.length ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              No entries found for this filter.
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
                    colors={colors.cardGradientAlt}
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
                            color={colors.primary}
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
                            color={colors.danger}
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

      <Modal
        transparent
        visible={editModalVisible}
        animationType="fade"
        onRequestClose={() => {
          setShowEditDatePicker(false);
          setEditModalVisible(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <LinearGradient
            colors={colors.cardGradientAlt}
            locations={[0, 0.5, 1]}
            start={{ x: 1, y: 1 }}
            end={{ x: 0, y: 0 }}
            style={styles.editModalCard}
          >
            <Text style={styles.title}>Edit Mood Entry</Text>
            <Text style={styles.metaText}>
              Date: {formatLongDate(editDate)} | Slot: {capitalize(editSlot)}
            </Text>

            <Pressable
              style={styles.dateButton}
              onPress={() => setShowEditDatePicker(true)}
            >
              <Text style={styles.dateButtonText}>Choose Date</Text>
            </Pressable>

            {showEditDatePicker ? (
              <DateTimePicker
                value={editDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={onChangeEditDate}
              />
            ) : null}

            <View style={styles.slotRow}>
              {SLOT_OPTIONS.map((slot) => {
                const active = slot === editSlot;
                return (
                  <Pressable
                    key={slot}
                    style={[
                      styles.slotButton,
                      active && styles.slotButtonActive,
                    ]}
                    onPress={() => setEditSlot(slot)}
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

            <MoodSelector value={editMood} onChange={setEditMood} />

            <TextInput
              value={editNote}
              onChangeText={setEditNote}
              placeholder="Update your note..."
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              multiline
              maxLength={180}
            />

            <View style={styles.entryActions}>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => {
                  setShowEditDatePicker(false);
                  setEditModalVisible(false);
                }}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryButton, saving && styles.buttonDisabled]}
                onPress={onSaveEditedEntry}
                disabled={saving}
              >
                <Text style={styles.primaryButtonText}>
                  {saving ? "Saving..." : "Save Entry"}
                </Text>
              </Pressable>
            </View>
          </LinearGradient>
        </View>
      </Modal>

      <Modal
        transparent
        visible={deleteModalVisible}
        animationType="fade"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.deleteModalCard}>
            <Text style={styles.deleteModalTitle}>Delete entry</Text>
            <Text style={styles.deleteModalMessage}>
              This entry will be removed permanently.
            </Text>
            <View style={styles.entryActions}>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => {
                  setDeleteModalVisible(false);
                  setDeleteTarget(null);
                }}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryButton, styles.deleteConfirmButton]}
                onPress={onConfirmDeleteEntry}
              >
                <Text style={styles.primaryButtonText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 36 },
  welcomeText: {
    paddingLeft: 5,
    color: colors.text,
    fontWeight: "800",
    fontSize: 20,
    marginBottom: 10,
  },
  welcomeNameText: {
    color: "#F59E0B",
    fontWeight: "900",
    fontSize: 25,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 16,
  },
  title: { fontSize: 26, fontWeight: "800", color: colors.text },
  metaText: {
    marginTop: 4,
    marginBottom: 10,
    color: colors.text,
    fontWeight: "600",
    paddingHorizontal: 10,
  },
  dateButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.inputAccentBorder,
    borderRadius: 10,
    backgroundColor: colors.inputAccent,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  dateButtonText: { color: colors.primary, fontWeight: "700" },
  slotRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  slotButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    backgroundColor: colors.inputSurface,
    alignItems: "center",
  },
  slotButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.inputAccent,
  },
  slotButtonText: {
    color: colors.textMuted,
    fontWeight: "600",
    fontSize: 12,
  },
  slotButtonTextActive: {
    color: colors.primary,
  },
  input: {
    marginTop: 12,
    minHeight: 86,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: "top",
    color: colors.text,
    backgroundColor: colors.inputSurface,
  },
  inputDisabled: {
    opacity: 0.6,
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
    borderColor: colors.border,
    backgroundColor: colors.inputSurface,
  },
  secondaryButtonText: { color: colors.textMuted, fontWeight: "700" },
  primaryButton: {
    flex: 1,
    borderRadius: 12,
    height: 46,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.primary,
  },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 16 },
  buttonDisabled: { opacity: 0.7 },
  lockedHint: {
    color: colors.text,
    fontWeight: "700",
    marginBottom: 8,
    fontSize: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 8,
  },
  historyFilterRow: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 2,
    marginBottom: 6,
  },
  historyFilterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputSurface,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  historyFilterChipActive: {
    backgroundColor: colors.inputAccent,
    borderColor: colors.inputAccentBorder,
  },
  historyFilterText: {
    color: colors.textMuted,
    fontWeight: "600",
    fontSize: 12,
  },
  historyFilterTextActive: {
    color: colors.primary,
  },
  historyRangeText: {
    color: colors.textMuted,
    fontWeight: "600",
    marginBottom: 8,
    fontSize: 12,
  },
  customRangeRow: {
    marginTop: 2,
    marginBottom: 6,
    flexDirection: "row",
    gap: 8,
  },
  customDateButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.inputSurface,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  customDateText: {
    color: colors.text,
    fontWeight: "600",
    fontSize: 12,
  },
  empty: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: 14,
  },
  emptyText: { color: colors.textMuted },
  dateGroup: { marginBottom: 14 },
  dateHeader: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 16,
    marginBottom: 8,
  },
  entryCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  entryTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  entrySlot: { color: colors.text, fontWeight: "700" },
  entryTopActions: {
    flexDirection: "row",
    gap: 8,
  },
  iconActionButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteIconActionButton: {
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerSurface,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  entryNote: {
    marginTop: 8,
    color: colors.text,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  editModalCard: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  deleteModalCard: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    backgroundColor: colors.surface,
  },
  deleteModalTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 18,
  },
  deleteModalMessage: {
    marginTop: 8,
    color: colors.textMuted,
    lineHeight: 20,
  },
  deleteConfirmButton: {
    backgroundColor: colors.danger,
  },
});
