import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../context/ThemeContext";
import {
  getProfile,
  hasRequiredPersonalDetails,
  saveProfile,
} from "../services/profileService";
import {
  getMemoryContext,
  saveLongTermSummary,
} from "../services/memoryService";
import { useAuth } from "../context/AuthContext";

const TABS = [
  { key: "mode", label: "Mode" },
  { key: "general", label: "General" },
  { key: "emotional", label: "Emotional" },
  { key: "ai", label: "AI Preferences" },
  { key: "journal", label: "Journal Settings" },
  { key: "privacy", label: "Privacy" },
  { key: "account", label: "Account" },
];

const CARD_GRADIENT = {
  colors: ["#7b91eb", "#95aafc", "#c1ccff"],
  locations: [0, 0.5, 1],
  start: { x: 1, y: 1 },
  end: { x: 0, y: 0 },
};
const AVATAR_MAX_BYTES = 120 * 1024;

function isEmailLike(value) {
  return String(value || "").includes("@");
}

function SegmentedControl({ options, value, onChange, disabled }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.segmentRow}>
      {options.map((option) => {
        const isActive = option === value;
        return (
          <Pressable
            key={option}
            style={[
              styles.segmentBtn,
              isActive && styles.segmentBtnActive,
              disabled && styles.segmentDisabled,
            ]}
            onPress={() => onChange(option)}
            disabled={disabled}
          >
            <Text
              style={[styles.segmentText, isActive && styles.segmentTextActive]}
            >
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function RowSwitch({ label, value, onValueChange, disabled }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.switchRow}>
      <Text style={styles.switchLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        thumbColor="#FFFFFF"
        trackColor={{ false: colors.border, true: colors.primary }}
      />
    </View>
  );
}

function FieldLabel({ children, hint }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.fieldHeader}>
      <Text style={styles.fieldLabel}>{children}</Text>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export default function ProfileScreen({ navigation, route }) {
  const { colors, setPrivateMode, refreshThemeFromProfile } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const cardGradient = useMemo(
    () => ({
      ...CARD_GRADIENT,
      colors: colors.cardGradient,
    }),
    [colors],
  );
  const {
    user,
    profile: authProfile,
    logout,
    deleteAccount,
    refreshProfile,
  } = useAuth();
  const forceOnboarding = Boolean(route?.params?.forceOnboarding);
  const [form, setForm] = useState(null);
  const [activeTab, setActiveTab] = useState("general");
  const [saving, setSaving] = useState(false);
  const [accountActionLoading, setAccountActionLoading] = useState(false);
  const [memoryForm, setMemoryForm] = useState(null);
  const [newTagLabel, setNewTagLabel] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [sectionEdit, setSectionEdit] = useState({
    general: false,
    emotional: false,
    ai: false,
    journal: false,
    privacy: false,
  });
  const [confirmModal, setConfirmModal] = useState({
    visible: false,
    title: "",
    message: "",
    confirmText: "",
    destructive: false,
    onConfirm: null,
  });
  const [genderModalVisible, setGenderModalVisible] = useState(false);

  const bannerOpacity = useRef(new Animated.Value(0)).current;
  const bannerTranslate = useRef(new Animated.Value(-8)).current;

  const loadProfile = useCallback(async () => {
    const [stored, memory] = await Promise.all([
      getProfile(),
      getMemoryContext(),
    ]);
    const resolvedEmail = String(stored.email || user?.email || "").trim();
    const storedName = String(stored.name || "").trim();
    const authName = String(authProfile?.displayName || "").trim();
    const isStoredNameEmailLike =
      isEmailLike(storedName) ||
      (resolvedEmail &&
        storedName.toLowerCase() === resolvedEmail.toLowerCase());
    const resolvedName = isStoredNameEmailLike
      ? isEmailLike(authName)
        ? "You"
        : authName || "You"
      : storedName || (isEmailLike(authName) ? "You" : authName || "You");

    setForm({
      ...stored,
      name: resolvedName,
      email: resolvedEmail,
    });

    if (
      (isStoredNameEmailLike && resolvedName !== storedName) ||
      resolvedEmail !== String(stored.email || "").trim()
    ) {
      try {
        await saveProfile({
          ...stored,
          name: resolvedName,
          email: resolvedEmail,
        });
      } catch {
        // Non-blocking migration; UI still uses sanitized in-memory values.
      }
    }

    const longTerm = memory?.longTermSummary || {};
    setMemoryForm({
      profileSummary: longTerm.profileSummary || "",
      emotionalBaselineSummary: longTerm.emotionalBaselineSummary || "",
      personalityPattern: longTerm.personalityPattern || "",
      stressBaseline: longTerm.stressBaseline || "",
      emotionalTriggersText: (longTerm.emotionalTriggers || []).join(", "),
      supportPatternsText: (longTerm.supportPatterns || []).join(", "),
      recurringThemesText: (longTerm.recurringThemes || []).join(", "),
      relationshipPatternsText: (longTerm.relationshipPatterns || []).join(
        ", ",
      ),
      manualTags: Array.isArray(longTerm.manualTags) ? longTerm.manualTags : [],
      updatedAt: longTerm.updatedAt || null,
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
    };
  }, [bannerOpacity, bannerTranslate]);

  useEffect(() => {
    if (!forceOnboarding) return;
    setActiveTab("general");
    setSectionEdit({
      general: true,
      emotional: false,
      ai: false,
      journal: false,
      privacy: false,
    });
  }, [forceOnboarding]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...(prev || {}), [key]: value }));
  };
  const setMemoryField = (key, value) => {
    setMemoryForm((prev) => ({ ...(prev || {}), [key]: value }));
  };

  const parseCommaList = (value) =>
    String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 20);

  const openSectionEdit = (key) => {
    setSectionEdit((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const showSaveSuccess = () => {
    bannerOpacity.setValue(0);
    bannerTranslate.setValue(-8);
    Animated.parallel([
      Animated.timing(bannerOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(bannerTranslate, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(bannerOpacity, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
          }),
          Animated.timing(bannerTranslate, {
            toValue: -8,
            duration: 180,
            useNativeDriver: true,
          }),
        ]).start();
      }, 1500);
    });
  };

  const onSaveSection = async (sectionKey) => {
    if (!form || saving || !sectionEdit[sectionKey]) return;
    setSaving(true);
    try {
      if (sectionKey === "journal") {
        const nextManualTags = Array.isArray(memoryForm?.manualTags)
          ? memoryForm.manualTags
              .map((item) => ({
                label: String(item?.label || "").trim(),
                name: String(item?.name || "").trim(),
              }))
              .filter((item) => item.label && item.name)
          : [];

        await saveLongTermSummary({
          profileSummary: String(memoryForm?.profileSummary || "").trim(),
          emotionalBaselineSummary: String(
            memoryForm?.emotionalBaselineSummary || "",
          ).trim(),
          personalityPattern: String(
            memoryForm?.personalityPattern || "",
          ).trim(),
          stressBaseline: String(memoryForm?.stressBaseline || "").trim(),
          emotionalTriggers: parseCommaList(memoryForm?.emotionalTriggersText),
          supportPatterns: parseCommaList(memoryForm?.supportPatternsText),
          recurringThemes: parseCommaList(memoryForm?.recurringThemesText),
          relationshipPatterns: parseCommaList(
            memoryForm?.relationshipPatternsText,
          ),
          manualTags: nextManualTags,
        });
      } else {
        const saved = await saveProfile(form);
        setForm(saved);
        if (sectionKey === "privacy") {
          await setPrivateMode(Boolean(saved.privateJournalMode));
          await refreshThemeFromProfile();
        }
      }
      setSectionEdit((prev) => ({ ...prev, [sectionKey]: false }));
      showSaveSuccess();

      if (forceOnboarding && sectionKey === "general") {
        if (!hasRequiredPersonalDetails(saved)) {
          Alert.alert(
            "Complete required details",
            "Please fill name, age, profession, weight, height, gender, and about before continuing.",
          );
          setSectionEdit((prev) => ({ ...prev, general: true }));
          return;
        }

        try {
          await refreshProfile?.();
        } catch {
          // Continue navigation even if profile refresh fails.
        }

        navigation.replace("MainTabs");
      }
    } catch (error) {
      Alert.alert(
        "Validation error",
        error?.message || "Could not save profile.",
      );
    } finally {
      setSaving(false);
    }
  };
  //  const performLogout = async () => {
  //     try {
  //       await logout();
  //     } catch (error) {
  //       Alert.alert("Logout failed", error?.message || "Could not logout.");
  //     }
  //   };

  const openConfirmModal = ({
    title,
    message,
    confirmText,
    destructive = false,
    onConfirm,
  }) => {
    setConfirmModal({
      visible: true,
      title,
      message,
      confirmText,
      destructive,
      onConfirm,
    });
  };

  const closeConfirmModal = () => {
    setConfirmModal((prev) => ({ ...prev, visible: false }));
  };

  const onLogout = () => {
    openConfirmModal({
      title: "Confirm logout",
      message: "Are you sure you want to logout?",
      confirmText: "Logout",
      destructive: true,
      onConfirm: async () => {
        try {
          await logout();
        } catch (error) {
          Alert.alert("Logout failed", error?.message || "Could not logout.");
        }
      },
    });
  };

  const onDeleteAccount = () => {
    openConfirmModal({
      title: "Confirm account deletion",
      message:
        "Are you sure you want to delete your account? This action cannot be undone.",
      confirmText: "Delete Account",
      destructive: true,
      onConfirm: async () => {
        if (accountActionLoading) return;
        setAccountActionLoading(true);
        try {
          await deleteAccount();
        } catch (error) {
          const message =
            error?.code === "auth/requires-recent-login"
              ? "For security, please login again and then retry deleting your account."
              : error?.message || "Could not delete account.";
          Alert.alert("Delete failed", message);
        } finally {
          setAccountActionLoading(false);
        }
      },
    });
  };

  const onSelectGender = (editable) => {
    if (!editable) return;
    setGenderModalVisible(true);
  };

  const onPickAvatar = async () => {
    if (!sectionEdit.general || saving) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission required",
        "Please allow photo library access to upload your avatar.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.35,
      base64: true,
    });

    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    const rawBase64 = String(asset.base64 || "");
    if (!rawBase64) {
      Alert.alert("Upload failed", "Could not read selected image.");
      return;
    }

    const approxBytes = Math.floor((rawBase64.length * 3) / 4);
    if (approxBytes > AVATAR_MAX_BYTES) {
      Alert.alert(
        "Image too large",
        "Please choose a smaller image. Avatar limit is 120 KB for Firestore safety.",
      );
      return;
    }

    const mime = asset.mimeType || "image/jpeg";
    setForm((prev) => ({
      ...(prev || {}),
      avatarDataUri: `data:${mime};base64,${rawBase64}`,
      avatarSizeBytes: approxBytes,
    }));
  };

  const addManualTag = () => {
    const label = String(newTagLabel || "").trim();
    const name = String(newTagName || "").trim();
    if (!label || !name) return;
    setMemoryForm((prev) => ({
      ...(prev || {}),
      manualTags: [...(prev?.manualTags || []), { label, name }],
    }));
    setNewTagLabel("");
    setNewTagName("");
  };

  const renderSectionHeader = (title, description, sectionKey) => (
    <View style={styles.sectionHeaderRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionDesc}>{description}</Text>
      </View>
      {!forceOnboarding ? (
        <Pressable
          style={styles.editIconBtn}
          onPress={() => openSectionEdit(sectionKey)}
        >
          <Ionicons
            name={
              sectionEdit[sectionKey]
                ? "checkmark-done-outline"
                : "create-outline"
            }
            size={18}
            color={colors.primary}
          />
        </Pressable>
      ) : null}
    </View>
  );

  const renderSaveButton = (sectionKey) => (
    <Pressable
      style={[
        styles.saveBtn,
        (!sectionEdit[sectionKey] || saving) && styles.saveBtnDisabled,
      ]}
      disabled={!sectionEdit[sectionKey] || saving}
      onPress={() => onSaveSection(sectionKey)}
    >
      <Text style={styles.saveBtnText}>
        {saving ? "Saving..." : "Save Changes"}
      </Text>
    </Pressable>
  );

  const renderTabContent = () => {
    if (!form) return null;

    if (activeTab === "mode") {
      const privateActive = Boolean(form.privateJournalMode);
      return (
        <LinearGradient {...cardGradient} style={styles.card}>
          <Text style={styles.sectionTitle}>Character Mode</Text>
          <Text style={styles.sectionDesc}>
            Switch the entire app between public and private character data instantly.
          </Text>

          <Pressable
            style={[
              styles.modeOptionCard,
              !privateActive && styles.modeOptionCardActive,
            ]}
            onPress={async () => {
              await setPrivateMode(false);
              setForm((prev) => ({ ...(prev || {}), privateJournalMode: false }));
              await loadProfile();
            }}
          >
            <Text style={styles.modeOptionTitle}>Public Character</Text>
            <Text style={styles.modeOptionText}>
              Uses the public collection for profile, moods, journal, and memory.
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.modeOptionCard,
              privateActive && styles.modeOptionCardActive,
            ]}
            onPress={async () => {
              await setPrivateMode(true);
              setForm((prev) => ({ ...(prev || {}), privateJournalMode: true }));
              await loadProfile();
            }}
          >
            <Text style={styles.modeOptionTitle}>Private Character</Text>
            <Text style={styles.modeOptionText}>
              Uses the private collection for the full app, including memory and mood logs.
            </Text>
          </Pressable>
        </LinearGradient>
      );
    }

    if (activeTab === "general" || forceOnboarding) {
      const editable = sectionEdit.general;
      return (
        <LinearGradient {...cardGradient} style={styles.card}>
          {renderSectionHeader(
            forceOnboarding ? "Personal Details" : "General",
            forceOnboarding
              ? "Complete your personal details to start using HappyState."
              : "Used for profile context in personalized AI summaries.",
            "general",
          )}

          <FieldLabel>Name</FieldLabel>
          <TextInput
            style={[styles.input, !editable && styles.inputDisabled]}
            editable={editable}
            value={String(form.name || "")}
            onChangeText={(v) => setField("name", v)}
          />

          <FieldLabel hint="Primary account email (read-only)">
            Email
          </FieldLabel>
          <TextInput
            style={[styles.input, styles.inputDisabled]}
            editable={false}
            value={String(form.email || user?.email || "")}
          />

          <View style={styles.twoCol}>
            <View style={styles.col}>
              <FieldLabel>Age</FieldLabel>
              <TextInput
                style={[styles.input, !editable && styles.inputDisabled]}
                editable={editable}
                keyboardType="numeric"
                value={String(form.age || "")}
                onChangeText={(v) => setField("age", v)}
              />
            </View>
            <View style={styles.col}>
              <FieldLabel>Gender</FieldLabel>
              <Pressable
                style={[
                  styles.dropdownField,
                  !editable && styles.inputDisabled,
                ]}
                onPress={() => onSelectGender(editable)}
                disabled={!editable}
              >
                <Text style={styles.dropdownText}>
                  {form.gender || "Select gender"}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={18}
                  color={colors.textMuted}
                />
              </Pressable>
            </View>
          </View>

          <FieldLabel>Profession</FieldLabel>
          <TextInput
            style={[styles.input, !editable && styles.inputDisabled]}
            editable={editable}
            value={String(form.profession || "")}
            onChangeText={(v) => setField("profession", v)}
          />

          <View style={styles.twoCol}>
            <View style={styles.col}>
              <FieldLabel>Weight (kg)</FieldLabel>
              <TextInput
                style={[styles.input, !editable && styles.inputDisabled]}
                editable={editable}
                keyboardType="decimal-pad"
                value={String(form.weight || "")}
                onChangeText={(v) => setField("weight", v)}
              />
            </View>
            <View style={styles.col}>
              <FieldLabel>Height (cm)</FieldLabel>
              <TextInput
                style={[styles.input, !editable && styles.inputDisabled]}
                editable={editable}
                keyboardType="decimal-pad"
                value={String(form.height || "")}
                onChangeText={(v) => setField("height", v)}
              />
            </View>
          </View>

          <FieldLabel>About</FieldLabel>
          <TextInput
            style={[styles.aboutInput, !editable && styles.inputDisabled]}
            editable={editable}
            multiline
            value={String(form.about || "")}
            onChangeText={(v) => setField("about", v)}
            maxLength={240}
            textAlignVertical="top"
          />

          <Pressable
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            disabled={saving || (forceOnboarding && !sectionEdit.general)}
            onPress={() => onSaveSection("general")}
          >
            <Text style={styles.saveBtnText}>
              {saving
                ? "Saving..."
                : forceOnboarding
                  ? "Save & Continue"
                  : "Save Changes"}
            </Text>
          </Pressable>
        </LinearGradient>
      );
    }

    if (activeTab === "emotional") {
      const editable = sectionEdit.emotional;
      return (
        <LinearGradient {...cardGradient} style={styles.card}>
          {renderSectionHeader(
            "Emotional Baseline",
            "Used for trend analysis and stability insights.",
            "emotional",
          )}

          <FieldLabel>Stress Level</FieldLabel>
          <SegmentedControl
            disabled={!editable}
            options={["Low", "Medium", "High"]}
            value={form.stressLevel}
            onChange={(v) => setField("stressLevel", v)}
          />

          <FieldLabel>Sleep Average (hours)</FieldLabel>
          <TextInput
            style={[styles.input, !editable && styles.inputDisabled]}
            editable={editable}
            keyboardType="decimal-pad"
            value={String(form.sleepAverage)}
            onChangeText={(v) => setField("sleepAverage", v)}
          />

          <FieldLabel>Energy Pattern</FieldLabel>
          <SegmentedControl
            disabled={!editable}
            options={["Morning", "Night", "Mixed"]}
            value={form.energyPattern}
            onChange={(v) => setField("energyPattern", v)}
          />

          <FieldLabel>Emotional Sensitivity</FieldLabel>
          <SegmentedControl
            disabled={!editable}
            options={["Low", "Moderate", "High"]}
            value={form.emotionalSensitivity}
            onChange={(v) => setField("emotionalSensitivity", v)}
          />

          {renderSaveButton("emotional")}
        </LinearGradient>
      );
    }

    if (activeTab === "ai") {
      const editable = sectionEdit.ai;
      return (
        <LinearGradient {...cardGradient} style={styles.card}>
          {renderSectionHeader(
            "AI Preferences",
            "Controls tone, depth and default range for AI outputs.",
            "ai",
          )}

          <FieldLabel>AI Tone</FieldLabel>
          <SegmentedControl
            disabled={!editable}
            options={["Gentle", "Direct", "Motivational"]}
            value={form.aiTone}
            onChange={(v) => setField("aiTone", v)}
          />

          <FieldLabel>Suggestion Depth</FieldLabel>
          <SegmentedControl
            disabled={!editable}
            options={["Quick", "Detailed"]}
            value={form.suggestionDepth}
            onChange={(v) => setField("suggestionDepth", v)}
          />

          <FieldLabel>Default Insight Range</FieldLabel>
          <SegmentedControl
            disabled={!editable}
            options={["Day", "Week", "Month", "Year"]}
            value={form.defaultInsightRange}
            onChange={(v) => setField("defaultInsightRange", v)}
          />

          {renderSaveButton("ai")}
        </LinearGradient>
      );
    }

    if (activeTab === "journal") {
      const editable = sectionEdit.journal;
      return (
        <LinearGradient {...cardGradient} style={styles.card}>
          {renderSectionHeader(
            "Journal Settings",
            "Edit the same AI long-term context used in journal conversations.",
            "journal",
          )}

          <FieldLabel hint="Part of AI context. Add mappings like boss: Rakesh, mom: Sumathi.">
            Manual Tags
          </FieldLabel>
          <View style={styles.twoCol}>
            <View style={styles.col}>
              <TextInput
                style={[styles.input, !editable && styles.inputDisabled]}
                editable={editable}
                placeholder="Label (e.g. boss)"
                placeholderTextColor={colors.textMuted}
                value={newTagLabel}
                onChangeText={setNewTagLabel}
              />
            </View>
            <View style={styles.col}>
              <TextInput
                style={[styles.input, !editable && styles.inputDisabled]}
                editable={editable}
                placeholder="Name (e.g. Rakesh)"
                placeholderTextColor={colors.textMuted}
                value={newTagName}
                onChangeText={setNewTagName}
              />
            </View>
          </View>
          <Pressable
            style={[styles.inlineAddBtn, !editable && styles.saveBtnDisabled]}
            disabled={!editable}
            onPress={addManualTag}
          >
            <Text style={styles.inlineAddBtnText}>Add Tag</Text>
          </Pressable>

          {(memoryForm?.manualTags || []).map((tag, idx) => (
            <View key={`${tag.label}_${idx}`} style={styles.tagRow}>
              <TextInput
                style={[styles.tagInput, !editable && styles.inputDisabled]}
                editable={editable}
                value={String(tag.label || "")}
                onChangeText={(v) =>
                  setMemoryForm((prev) => {
                    const next = [...(prev?.manualTags || [])];
                    next[idx] = { ...next[idx], label: v };
                    return { ...(prev || {}), manualTags: next };
                  })
                }
              />
              <TextInput
                style={[styles.tagInput, !editable && styles.inputDisabled]}
                editable={editable}
                value={String(tag.name || "")}
                onChangeText={(v) =>
                  setMemoryForm((prev) => {
                    const next = [...(prev?.manualTags || [])];
                    next[idx] = { ...next[idx], name: v };
                    return { ...(prev || {}), manualTags: next };
                  })
                }
              />
              <Pressable
                style={styles.tagDeleteBtn}
                disabled={!editable}
                onPress={() =>
                  setMemoryForm((prev) => ({
                    ...(prev || {}),
                    manualTags: (prev?.manualTags || []).filter(
                      (_, i) => i !== idx,
                    ),
                  }))
                }
              >
                <Ionicons
                  name="trash-outline"
                  size={16}
                  color={colors.danger}
                />
              </Pressable>
            </View>
          ))}

          <FieldLabel hint="This is the AI memory context; your edits override auto-generated text.">
            Profile Summary
          </FieldLabel>
          <TextInput
            style={[styles.aboutInput, !editable && styles.inputDisabled]}
            editable={editable}
            multiline
            value={String(memoryForm?.profileSummary || "")}
            onChangeText={(v) => setMemoryField("profileSummary", v)}
            textAlignVertical="top"
          />

          <FieldLabel>Emotional Baseline Summary</FieldLabel>
          <TextInput
            style={[styles.aboutInput, !editable && styles.inputDisabled]}
            editable={editable}
            multiline
            value={String(memoryForm?.emotionalBaselineSummary || "")}
            onChangeText={(v) => setMemoryField("emotionalBaselineSummary", v)}
            textAlignVertical="top"
          />

          <FieldLabel>Personality Pattern</FieldLabel>
          <TextInput
            style={[styles.aboutInput, !editable && styles.inputDisabled]}
            editable={editable}
            multiline
            value={String(memoryForm?.personalityPattern || "")}
            onChangeText={(v) => setMemoryField("personalityPattern", v)}
            textAlignVertical="top"
          />

          <FieldLabel>Stress Baseline</FieldLabel>
          <TextInput
            style={[styles.input, !editable && styles.inputDisabled]}
            editable={editable}
            value={String(memoryForm?.stressBaseline || "")}
            onChangeText={(v) => setMemoryField("stressBaseline", v)}
          />

          <FieldLabel hint="Comma separated">Emotional Triggers</FieldLabel>
          <TextInput
            style={[styles.input, !editable && styles.inputDisabled]}
            editable={editable}
            value={String(memoryForm?.emotionalTriggersText || "")}
            onChangeText={(v) => setMemoryField("emotionalTriggersText", v)}
          />

          <FieldLabel hint="Comma separated">Support Patterns</FieldLabel>
          <TextInput
            style={[styles.input, !editable && styles.inputDisabled]}
            editable={editable}
            value={String(memoryForm?.supportPatternsText || "")}
            onChangeText={(v) => setMemoryField("supportPatternsText", v)}
          />

          <FieldLabel hint="Comma separated">Recurring Themes</FieldLabel>
          <TextInput
            style={[styles.input, !editable && styles.inputDisabled]}
            editable={editable}
            value={String(memoryForm?.recurringThemesText || "")}
            onChangeText={(v) => setMemoryField("recurringThemesText", v)}
          />

          <FieldLabel hint="Comma separated">Relationship Patterns</FieldLabel>
          <TextInput
            style={[styles.input, !editable && styles.inputDisabled]}
            editable={editable}
            value={String(memoryForm?.relationshipPatternsText || "")}
            onChangeText={(v) => setMemoryField("relationshipPatternsText", v)}
          />

          {renderSaveButton("journal")}
        </LinearGradient>
      );
    }

    if (activeTab === "privacy") {
      const editable = sectionEdit.privacy;
      return (
        <LinearGradient {...cardGradient} style={styles.card}>
          {renderSectionHeader(
            "Privacy",
            "Choose how much long-term context AI can use.",
            "privacy",
          )}

          <RowSwitch
            disabled={!editable}
            label="Allow long-term emotional analysis"
            value={form.allowLongTermAnalysis}
            onValueChange={(v) => setField("allowLongTermAnalysis", v)}
          />
          <View style={styles.switchSpacer} />
          <RowSwitch
            disabled={!editable}
            label="Show professional support suggestions"
            value={form.showProfessionalSupportSuggestions}
            onValueChange={(v) =>
              setField("showProfessionalSupportSuggestions", v)
            }
          />
          {renderSaveButton("privacy")}
        </LinearGradient>
      );
    }

    return (
      <LinearGradient {...cardGradient} style={styles.card}>
        <Text style={styles.sectionTitle}>Account</Text>
        <Text style={styles.sectionDesc}>
          Security and account-level controls.
        </Text>

        <Pressable style={styles.accountBtn} onPress={onLogout}>
          <Text style={styles.accountBtnText}>Logout</Text>
        </Pressable>

        <Pressable
          style={[
            styles.accountBtn,
            styles.deleteBtn,
            accountActionLoading && styles.accountBtnDisabled,
          ]}
          onPress={onDeleteAccount}
          disabled={accountActionLoading}
        >
          <Text style={[styles.accountBtnText, styles.deleteBtnText]}>
            Delete Account
          </Text>
        </Pressable>
      </LinearGradient>
    );
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
          colors={colors.heroGradient}
          locations={[0, 0.5, 1]}
          start={{ x: 1, y: 1 }} // bottom-right
          end={{ x: 0, y: 0 }} // top-left
          style={styles.heroSection}
        >
          <Pressable
            style={[
              styles.heroAvatarWrap,
              (!sectionEdit.general || saving) && styles.heroAvatarDisabled,
            ]}
            onPress={onPickAvatar}
            disabled={!sectionEdit.general || saving}
          >
            <View style={styles.heroAvatar}>
              {form.avatarDataUri ? (
                <Image
                  source={{ uri: form.avatarDataUri }}
                  style={styles.heroAvatarImage}
                />
              ) : (
                <Text style={styles.heroAvatarText}>
                  {(form.name || "U").charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
            <View style={styles.heroAvatarBadge}>
              <Ionicons name="camera-outline" size={12} color="#FFFFFF" />
            </View>
          </Pressable>
          <Text style={styles.heroAvatarHint}>
            Avatar limit: 120 KB (Firestore-safe). Tap avatar to upload.
          </Text>
          <Text style={styles.heroName}>{form.name || "You"}</Text>
          <Text style={styles.heroEmail}>
            {user?.email || "No email linked"}
          </Text>
        </LinearGradient>

        {!forceOnboarding ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabRow}
          >
            {TABS.map((tab) => {
              const active = tab.key === activeTab;
              return (
                <Pressable
                  key={tab.key}
                  style={styles.tabBtn}
                  onPress={() => setActiveTab(tab.key)}
                >
                  <Text
                    style={[styles.tabText, active && styles.tabTextActive]}
                  >
                    {tab.label}
                  </Text>
                  <View
                    style={[
                      styles.tabUnderline,
                      active && styles.tabUnderlineActive,
                    ]}
                  />
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {renderTabContent()}
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
        <Text style={styles.successText}>Saved successfully.</Text>
      </Animated.View>

      <Modal
        transparent
        visible={confirmModal.visible}
        animationType="fade"
        onRequestClose={closeConfirmModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{confirmModal.title}</Text>
            <Text style={styles.modalMessage}>{confirmModal.message}</Text>
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={closeConfirmModal}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalConfirmBtn,
                  confirmModal.destructive && styles.modalConfirmBtnDanger,
                ]}
                onPress={async () => {
                  const action = confirmModal.onConfirm;
                  closeConfirmModal();
                  if (typeof action === "function") {
                    await action();
                  }
                }}
              >
                <Text style={styles.modalConfirmText}>
                  {confirmModal.confirmText || "Confirm"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={genderModalVisible}
        animationType="fade"
        onRequestClose={() => setGenderModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select gender</Text>
            <Text style={styles.modalMessage}>Choose one option</Text>

            {["Female", "Male", "Non-binary", "Prefer not to say"].map(
              (option) => (
                <Pressable
                  key={option}
                  style={styles.genderOptionBtn}
                  onPress={() => {
                    setField("gender", option);
                    setGenderModalVisible(false);
                  }}
                >
                  <Text style={styles.genderOptionText}>{option}</Text>
                </Pressable>
              ),
            )}

            <Pressable
              style={styles.modalCancelFullBtn}
              onPress={() => setGenderModalVisible(false)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { justifyContent: "center", alignItems: "center" },
  loadingText: { color: colors.textMuted, fontWeight: "600" },
  content: { padding: 14, paddingBottom: 28 },

  heroSection: {
    alignItems: "center",
    borderRadius: 14,
    paddingVertical: 20,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.12)",
    marginBottom: 10,
  },
  heroAvatar: {
    width: 82,
    height: 82,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    overflow: "hidden",
  },
  heroAvatarWrap: {
    position: "relative",
  },
  heroAvatarDisabled: {
    opacity: 0.75,
  },
  heroAvatarImage: {
    width: "100%",
    height: "100%",
  },
  heroAvatarBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
  },
  heroAvatarText: { color: "#FFFFFF", fontWeight: "800", fontSize: 32 },
  heroAvatarHint: {
    marginTop: 8,
    color: "#E2E8F0",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  heroName: {
    marginTop: 12,
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 26,
  },
  heroEmail: { marginTop: 4, color: "#CBD5E1", fontWeight: "600" },

  tabRow: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 2,
    marginBottom: 10,
  },
  tabBtn: { marginRight: 18, paddingBottom: 8 },
  tabText: { color: colors.textMuted, fontWeight: "700", fontSize: 14 },
  tabTextActive: { color: colors.primary },
  tabUnderline: {
    marginTop: 5,
    height: 2,
    borderRadius: 99,
    backgroundColor: "transparent",
  },
  tabUnderlineActive: { backgroundColor: colors.primary },

  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  modeOptionCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    backgroundColor: colors.surface,
    marginTop: 10,
  },
  modeOptionCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.inputAccent,
  },
  modeOptionTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 16,
  },
  modeOptionText: {
    marginTop: 6,
    color: colors.textMuted,
    lineHeight: 20,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: { color: colors.text, fontWeight: "800", fontSize: 18 },
  sectionDesc: {
    marginTop: 4,
    color: colors.textMuted,
    lineHeight: 18,
    fontSize: 12,
    marginBottom: 6,
  },
  editIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.inputAccentBorder,
    backgroundColor: colors.inputAccent,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },

  fieldHeader: { marginBottom: 8 },
  fieldLabel: { color: colors.text, fontWeight: "700" },
  fieldHint: { marginTop: 2, color: colors.textMuted, fontSize: 12 },

  input: {
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  dropdownField: {
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownText: {
    color: colors.text,
    fontWeight: "600",
  },
  inputDisabled: {
    backgroundColor: colors.border,
    color: colors.textMuted,
  },
  aboutInput: {
    minHeight: 86,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  twoCol: { flexDirection: "row", gap: 10 },
  col: { flex: 1 },

  segmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  segmentBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  segmentBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.inputAccent,
  },
  segmentDisabled: { opacity: 0.6 },
  segmentText: { color: colors.textMuted, fontWeight: "600", fontSize: 12 },
  segmentTextActive: { color: colors.primary, fontWeight: "700" },

  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  switchLabel: {
    color: colors.text,
    fontWeight: "600",
    flex: 1,
    paddingRight: 12,
    lineHeight: 20,
  },
  switchSpacer: { height: 12 },

  inlineAddBtn: {
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  inlineAddBtnText: { color: "#FFFFFF", fontWeight: "800" },
  tagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  tagInput: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 10,
  },
  tagDeleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerSurface,
    alignItems: "center",
    justifyContent: "center",
  },

  saveBtn: {
    marginTop: 14,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnDisabled: { opacity: 0.55 },
  saveBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },

  accountBtn: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  accountBtnDisabled: { opacity: 0.7 },
  accountBtnText: { color: colors.text, fontWeight: "800" },
  deleteBtn: { borderColor: colors.dangerBorder, backgroundColor: colors.dangerSurface },
  deleteBtnText: { color: colors.danger },

  successBanner: {
    position: "absolute",
    left: 14,
    right: 14,
    top: 10,
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#86EFAC",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  successText: {
    color: "#166534",
    textAlign: "center",
    fontWeight: "700",
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modalCard: {
    width: "100%",
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  modalTitle: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 18,
  },
  modalMessage: {
    marginTop: 8,
    color: colors.textMuted,
    lineHeight: 20,
  },
  modalActions: {
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  modalCancelBtn: {
    height: 40,
    minWidth: 92,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  modalCancelText: {
    color: colors.text,
    fontWeight: "700",
  },
  modalCancelFullBtn: {
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  genderOptionBtn: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputSurface,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  genderOptionText: {
    color: colors.text,
    fontWeight: "700",
  },
  modalConfirmBtn: {
    height: 40,
    minWidth: 120,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  modalConfirmBtnDanger: {
    backgroundColor: colors.danger,
  },
  modalConfirmText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
});

