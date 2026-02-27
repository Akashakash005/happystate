import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { COLORS } from "../constants/colors";
import { getProfile, saveProfile } from "../services/profileService";
import { useAuth } from "../context/AuthContext";

function SegmentedControl({
  options,
  value,
  onChange,
  disabled,
  palette = "blue",
}) {
  const activePalette =
    palette === "warm"
      ? { bg: "#FFF7ED", border: "#FDBA74", text: "#C2410C" }
      : palette === "green"
        ? { bg: "#ECFDF5", border: "#86EFAC", text: "#166534" }
        : { bg: "#EEF2FF", border: "#A5B4FC", text: "#3730A3" };

  const scaleValuesRef = useRef({});
  options.forEach((option) => {
    if (!scaleValuesRef.current[option]) {
      scaleValuesRef.current[option] = new Animated.Value(1);
    }
  });

  const onPressOption = (option) => {
    if (disabled) return;
    const scale = scaleValuesRef.current[option];
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 0.96,
        duration: 70,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 110,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
    onChange(option);
  };

  return (
    <View style={styles.segmentRow}>
      {options.map((option) => {
        const isActive = option === value;
        return (
          <Animated.View
            key={option}
            style={[
              styles.segmentWrap,
              { transform: [{ scale: scaleValuesRef.current[option] }] },
            ]}
          >
            <Pressable
              style={[
                styles.segmentBtn,
                isActive && {
                  backgroundColor: activePalette.bg,
                  borderColor: activePalette.border,
                },
                disabled && styles.segmentDisabled,
              ]}
              onPress={() => onPressOption(option)}
              disabled={disabled}
            >
              <Text
                style={[
                  styles.segmentText,
                  isActive && { color: activePalette.text, fontWeight: "700" },
                ]}
              >
                {option}
              </Text>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

function SectionCard({ icon, title, children }) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionIcon}>{icon}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function RowSwitch({ label, value, onValueChange, disabled }) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        thumbColor="#FFFFFF"
        trackColor={{ false: "#CBD5E1", true: "#93C5FD" }}
      />
    </View>
  );
}

function stabilityLabel(form) {
  const stress = form?.stressLevel || "Medium";
  const sleep = Number(form?.sleepAverage || 7);
  if (stress === "Low" && sleep >= 7) return "Highly Stable";
  if (stress === "High" || sleep < 6) return "Needs Support";
  return "Moderately Stable";
}

export default function ProfileScreen() {
  const { user, profile: authProfile } = useAuth();
  const [form, setForm] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  const bannerOpacity = useRef(new Animated.Value(0)).current;
  const bannerTranslate = useRef(new Animated.Value(-10)).current;
  const saveScale = useRef(new Animated.Value(1)).current;

  const badgeText = useMemo(() => {
    if (!form) return "";
    return `${stabilityLabel(form)} | ${form.aiTone} AI Mode`;
  }, [form]);

  const loadProfile = useCallback(async () => {
    const stored = await getProfile();
    setForm({
      ...stored,
      name: stored.name || authProfile?.displayName || user?.email || "You",
    });
  }, [authProfile?.displayName, user?.email]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile]),
  );

  useEffect(() => {
    return () => {
      bannerOpacity.stopAnimation();
      bannerTranslate.stopAnimation();
      saveScale.stopAnimation();
    };
  }, [bannerOpacity, bannerTranslate, saveScale]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...(prev || {}), [key]: value }));
  };

  const showSaveSuccess = () => {
    bannerOpacity.setValue(0);
    bannerTranslate.setValue(-10);
    Animated.parallel([
      Animated.timing(bannerOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(bannerTranslate, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(bannerOpacity, {
            toValue: 0,
            duration: 220,
            useNativeDriver: true,
          }),
          Animated.timing(bannerTranslate, {
            toValue: -10,
            duration: 220,
            useNativeDriver: true,
          }),
        ]).start();
      }, 2000);
    });
  };

  const onSave = async () => {
    if (!form || saving) return;
    Animated.sequence([
      Animated.timing(saveScale, {
        toValue: 0.98,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(saveScale, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start();

    setSaving(true);
    try {
      const saved = await saveProfile(form);
      setForm(saved);
      setEditMode(false);
      showSaveSuccess();
    } catch (error) {
      Alert.alert(
        "Validation error",
        error?.message || "Could not save profile.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (!form) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={["#8298fa", "#E3E8FF"]}
          start={{ x: 0, y: 1 }}
          end={{ x: 0, y: 0 }}
          style={styles.heroCard}
        >
          <View style={styles.heroTopRow}>
            <View style={styles.heroAvatar}>
              <Text style={styles.heroAvatarText}>
                {(form.name || "U").charAt(0).toUpperCase()}
              </Text>
            </View>
            <Pressable
              style={[styles.editBtn, editMode && styles.editBtnActive]}
              onPress={() => setEditMode((v) => !v)}
            >
              <Text
                style={[
                  styles.editBtnText,
                  editMode && styles.editBtnTextActive,
                ]}
              >
                {editMode ? "Done" : "Edit"}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.heroName}>{form.name}</Text>
          <Text style={styles.heroEmail}>
            {user?.email || "No email linked"}
          </Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badgeText}</Text>
          </View>
        </LinearGradient>

        <SectionCard icon="💛" title="Emotional Baseline">
          <View style={styles.group}>
            <Text style={styles.groupTitle}>Stress Level</Text>
            <SegmentedControl
              options={["Low", "Medium", "High"]}
              value={form.stressLevel}
              onChange={(v) => setField("stressLevel", v)}
              disabled={!editMode}
              palette="warm"
            />
          </View>

          <View style={styles.group}>
            <Text style={styles.groupTitle}>Sleep Average (hours)</Text>
            <TextInput
              style={[styles.input, !editMode && styles.inputDisabled]}
              value={String(form.sleepAverage)}
              onChangeText={(v) => setField("sleepAverage", v)}
              editable={editMode}
              keyboardType="decimal-pad"
              placeholder="e.g. 7.5"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>

          <View style={styles.group}>
            <Text style={styles.groupTitle}>Energy Pattern</Text>
            <SegmentedControl
              options={["Morning", "Night", "Mixed"]}
              value={form.energyPattern}
              onChange={(v) => setField("energyPattern", v)}
              disabled={!editMode}
              palette="green"
            />
          </View>

          <View style={styles.group}>
            <Text style={styles.groupTitle}>Emotional Sensitivity</Text>
            <SegmentedControl
              options={["Low", "Moderate", "High"]}
              value={form.emotionalSensitivity}
              onChange={(v) => setField("emotionalSensitivity", v)}
              disabled={!editMode}
            />
          </View>
        </SectionCard>

        <SectionCard icon="🧠" title="AI Preferences">
          <View style={styles.group}>
            <Text style={styles.groupTitle}>AI Tone</Text>
            <SegmentedControl
              options={["Gentle", "Direct", "Motivational"]}
              value={form.aiTone}
              onChange={(v) => setField("aiTone", v)}
              disabled={!editMode}
            />
          </View>

          <View style={styles.group}>
            <Text style={styles.groupTitle}>Suggestion Depth</Text>
            <SegmentedControl
              options={["Quick", "Detailed"]}
              value={form.suggestionDepth}
              onChange={(v) => setField("suggestionDepth", v)}
              disabled={!editMode}
              palette="green"
            />
          </View>

          <View style={styles.group}>
            <Text style={styles.groupTitle}>Default Insight Range</Text>
            <SegmentedControl
              options={["Day", "Week", "Month", "Year"]}
              value={form.defaultInsightRange}
              onChange={(v) => setField("defaultInsightRange", v)}
              disabled={!editMode}
            />
          </View>
        </SectionCard>

        <SectionCard icon="🔒" title="Privacy Controls">
          <View style={styles.group}>
            <RowSwitch
              label="Allow long-term emotional analysis"
              value={form.allowLongTermAnalysis}
              onValueChange={(v) => setField("allowLongTermAnalysis", v)}
              disabled={!editMode}
            />
          </View>
          <View style={styles.groupLast}>
            <RowSwitch
              label="Show professional support suggestions"
              value={form.showProfessionalSupportSuggestions}
              onValueChange={(v) =>
                setField("showProfessionalSupportSuggestions", v)
              }
              disabled={!editMode}
            />
          </View>
        </SectionCard>
      </ScrollView>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.successBanner,
          {
            opacity: bannerOpacity,
            transform: [{ translateY: bannerTranslate }],
          },
        ]}
      >
        <Text style={styles.successText}>
          Saved successfully. Your preferences are updated.
        </Text>
      </Animated.View>

      <View style={styles.footer}>
        <Animated.View style={{ transform: [{ scale: saveScale }] }}>
          <Pressable
            onPress={onSave}
            disabled={!editMode || saving}
            style={({ pressed }) => [
              styles.saveBtnWrap,
              (!editMode || saving) && styles.saveBtnDisabled,
              pressed && { opacity: 0.92 },
            ]}
          >
            <LinearGradient
              colors={["#8298fa", "#E3E8FF"]}
              start={{ x: 0, y: 1 }}
              end={{ x: 0, y: 0 }}
              style={styles.saveBtn}
            >
              <Text style={styles.saveBtnText}>
                {saving ? "Saving..." : "Save Profile"}
              </Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3F6FC" },
  center: { justifyContent: "center", alignItems: "center" },
  loadingText: { color: COLORS.textMuted, fontWeight: "600" },
  content: { padding: 16, paddingBottom: 130 },

  heroCard: {
    borderRadius: 18,
    padding: 20,
    marginBottom: 24,
    shadowColor: "#3730A3",
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroAvatar: {
    width: 70,
    height: 70,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1E3A8A",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  heroAvatarText: {
    fontSize: 28,
    fontWeight: "800",
    color: "#1D4ED8",
  },
  heroName: {
    marginTop: 14,
    fontSize: 24,
    fontWeight: "800",
    color: "#1E293B",
  },
  heroEmail: {
    marginTop: 4,
    fontSize: 13,
    color: "#475569",
    fontWeight: "600",
  },
  badge: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.7)",
    borderColor: "rgba(255,255,255,0.85)",
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  badgeText: {
    color: "#334155",
    fontWeight: "700",
    fontSize: 12,
  },
  editBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(71,85,105,0.24)",
    backgroundColor: "rgba(255,255,255,0.7)",
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  editBtnActive: {
    borderColor: "#6366F1",
    backgroundColor: "#EEF2FF",
  },
  editBtnText: {
    color: "#334155",
    fontWeight: "700",
  },
  editBtnTextActive: {
    color: "#4338CA",
  },

  sectionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 20,
    marginBottom: 24,
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionIcon: { fontSize: 18, marginRight: 8 },
  sectionTitle: { color: "#0F172A", fontWeight: "800", fontSize: 17 },
  sectionBody: { marginTop: 2 },

  group: { marginBottom: 16 },
  groupLast: { marginBottom: 0 },
  groupTitle: { color: "#475569", fontWeight: "700", marginBottom: 10 },

  segmentRow: {
    flexDirection: "row",
    gap: 8,
  },
  segmentWrap: { flex: 1 },
  segmentBtn: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    paddingVertical: 11,
    alignItems: "center",
  },
  segmentText: {
    color: "#64748B",
    fontWeight: "600",
    fontSize: 12,
  },
  segmentDisabled: { opacity: 0.6 },

  input: {
    height: 48,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    paddingHorizontal: 14,
    color: "#0F172A",
    backgroundColor: "#F8FAFC",
  },
  inputDisabled: {
    backgroundColor: "#F1F5F9",
    color: "#94A3B8",
  },

  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  switchLabel: {
    color: "#0F172A",
    fontWeight: "600",
    flex: 1,
    paddingRight: 12,
  },

  successBanner: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 94,
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#86EFAC",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    zIndex: 10,
  },
  successText: {
    color: "#166534",
    fontWeight: "700",
    fontSize: 13,
    textAlign: "center",
  },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  saveBtnWrap: {
    borderRadius: 18,
    shadowColor: "#4338CA",
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  saveBtn: {
    height: 54,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.55 },
  saveBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});
