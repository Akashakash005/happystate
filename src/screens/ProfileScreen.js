import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
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
import { useFocusEffect } from "@react-navigation/native";
import { COLORS } from "../constants/colors";
import {
  getProfile,
  hasRequiredPersonalDetails,
  saveProfile,
} from "../services/profileService";
import { useAuth } from "../context/AuthContext";

const TABS = [
  { key: "general", label: "General" },
  { key: "emotional", label: "Emotional" },
  { key: "ai", label: "AI Preferences" },
  { key: "privacy", label: "Privacy" },
  { key: "account", label: "Account" },
];

const CARD_GRADIENT = {
  colors: ["#7b91eb", "#95aafc", "#c1ccff"],
  locations: [0, 0.5, 1],
  start: { x: 1, y: 1 },
  end: { x: 0, y: 0 },
};

function SegmentedControl({ options, value, onChange, disabled }) {
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

function FieldLabel({ children, hint }) {
  return (
    <View style={styles.fieldHeader}>
      <Text style={styles.fieldLabel}>{children}</Text>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export default function ProfileScreen({ navigation, route }) {
  const { user, profile: authProfile, logout, deleteAccount, refreshProfile } = useAuth();
  const forceOnboarding = Boolean(route?.params?.forceOnboarding);
  const [form, setForm] = useState(null);
  const [activeTab, setActiveTab] = useState("general");
  const [saving, setSaving] = useState(false);
  const [accountActionLoading, setAccountActionLoading] = useState(false);
  const [sectionEdit, setSectionEdit] = useState({
    general: false,
    emotional: false,
    ai: false,
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
    };
  }, [bannerOpacity, bannerTranslate]);

  useEffect(() => {
    if (!forceOnboarding) return;
    setActiveTab("general");
    setSectionEdit({
      general: true,
      emotional: false,
      ai: false,
      privacy: false,
    });
  }, [forceOnboarding]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...(prev || {}), [key]: value }));
  };

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
      const saved = await saveProfile(form);
      setForm(saved);
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
            color={COLORS.primary}
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

    if (activeTab === "general" || forceOnboarding) {
      const editable = sectionEdit.general;
      return (
        <LinearGradient {...CARD_GRADIENT} style={styles.card}>
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
                  color={COLORS.textMuted}
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
        <LinearGradient {...CARD_GRADIENT} style={styles.card}>
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
        <LinearGradient {...CARD_GRADIENT} style={styles.card}>
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

    if (activeTab === "privacy") {
      const editable = sectionEdit.privacy;
      return (
        <LinearGradient {...CARD_GRADIENT} style={styles.card}>
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
      <LinearGradient {...CARD_GRADIENT} style={styles.card}>
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
          colors={["#7b91eb", "#6E8BFF", "#E3E8FF"]}
          locations={[0, 0.5, 1]}
          start={{ x: 1, y: 1 }} // bottom-right
          end={{ x: 0, y: 0 }} // top-left
          style={styles.heroSection}
        >
          <View style={styles.heroAvatar}>
            <Text style={styles.heroAvatarText}>
              {(form.name || "U").charAt(0).toUpperCase()}
            </Text>
          </View>
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
                  <Text style={[styles.tabText, active && styles.tabTextActive]}>
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
              <Pressable style={styles.modalCancelBtn} onPress={closeConfirmModal}>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { justifyContent: "center", alignItems: "center" },
  loadingText: { color: COLORS.textMuted, fontWeight: "600" },
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
  },
  heroAvatarText: { color: "#FFFFFF", fontWeight: "800", fontSize: 32 },
  heroName: {
    marginTop: 12,
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 26,
  },
  heroEmail: { marginTop: 4, color: "#CBD5E1", fontWeight: "600" },

  tabRow: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 2,
    marginBottom: 10,
  },
  tabBtn: { marginRight: 18, paddingBottom: 8 },
  tabText: { color: COLORS.textMuted, fontWeight: "700", fontSize: 14 },
  tabTextActive: { color: COLORS.primary },
  tabUnderline: {
    marginTop: 5,
    height: 2,
    borderRadius: 99,
    backgroundColor: "transparent",
  },
  tabUnderlineActive: { backgroundColor: COLORS.primary },

  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionTitle: { color: COLORS.text, fontWeight: "800", fontSize: 18 },
  sectionDesc: {
    marginTop: 4,
    color: COLORS.textMuted,
    lineHeight: 18,
    fontSize: 12,
  },
  editIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#93C5FD",
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },

  fieldHeader: { marginBottom: 8 },
  fieldLabel: { color: COLORS.text, fontWeight: "700" },
  fieldHint: { marginTop: 2, color: COLORS.textMuted, fontSize: 12 },

  input: {
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  dropdownField: {
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dropdownText: {
    color: COLORS.text,
    fontWeight: "600",
  },
  inputDisabled: {
    backgroundColor: "#E2E8F0",
    color: COLORS.textMuted,
  },
  aboutInput: {
    minHeight: 86,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
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
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  segmentBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: "#EFF6FF",
  },
  segmentDisabled: { opacity: 0.6 },
  segmentText: { color: COLORS.textMuted, fontWeight: "600", fontSize: 12 },
  segmentTextActive: { color: COLORS.primary, fontWeight: "700" },

  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  switchLabel: {
    color: COLORS.text,
    fontWeight: "600",
    flex: 1,
    paddingRight: 12,
    lineHeight: 20,
  },
  switchSpacer: { height: 12 },

  saveBtn: {
    marginTop: 14,
    height: 46,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnDisabled: { opacity: 0.55 },
  saveBtnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },

  accountBtn: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  accountBtnDisabled: { opacity: 0.7 },
  accountBtnText: { color: COLORS.text, fontWeight: "800" },
  deleteBtn: { borderColor: "#FCA5A5", backgroundColor: "#FEF2F2" },
  deleteBtnText: { color: COLORS.danger },

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
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modalCard: {
    width: "100%",
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
  },
  modalTitle: {
    color: COLORS.text,
    fontWeight: "800",
    fontSize: 18,
  },
  modalMessage: {
    marginTop: 8,
    color: COLORS.textMuted,
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
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  modalCancelText: {
    color: COLORS.text,
    fontWeight: "700",
  },
  modalCancelFullBtn: {
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  genderOptionBtn: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  genderOptionText: {
    color: COLORS.text,
    fontWeight: "700",
  },
  modalConfirmBtn: {
    height: 40,
    minWidth: 120,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  modalConfirmBtnDanger: {
    backgroundColor: COLORS.danger,
  },
  modalConfirmText: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
});
