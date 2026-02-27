import React, { useRef, useState } from "react";
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
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS } from "../../constants/colors";
import { useAuth } from "../../context/AuthContext";

export default function SignupScreen({ navigation }) {
  const { signup, authLoading } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmPasswordRef = useRef(null);

  const handleSignup = async () => {
    if (!email.trim() || !password || !confirmPassword) {
      Alert.alert("Missing fields", "Please complete all required fields.");
      return;
    }

    if (password.length < 6) {
      Alert.alert("Weak password", "Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert(
        "Password mismatch",
        "Password and confirm password must match.",
      );
      return;
    }

    try {
      await signup({ email, password, displayName });
    } catch (error) {
      const code = String(error?.code || "").toLowerCase();
      const message = String(error?.message || "");
      const normalized = message.toUpperCase();

      if (
        code.includes("invalid-credential") ||
        code.includes("wrong-password") ||
        normalized.includes("INVALID_LOGIN_CREDENTIALS")
      ) {
        Alert.alert(
          "Account already exists",
          "This email is already registered. Password does not match. Use Login or reset password.",
        );
        return;
      }

      Alert.alert("Signup failed", message || "Could not create account.");
    }
  };

  return (
    <LinearGradient
      colors={["#0033ff", "#3e58c1", "#0e1b58"]}
      locations={[0, 0.5, 1]}
      start={{ x: 1, y: 1 }}
      end={{ x: 0, y: 0 }}
      style={styles.gradientBackground}
    >
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboardContainer}
          behavior={Platform.select({ ios: "padding", android: "height" })}
          keyboardVerticalOffset={Platform.select({ ios: 8, android: 20 })}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.heroSection}>
              <View style={styles.topRow}>
                <Text style={styles.topRowText}>Already have an account?</Text>
                <Pressable
                  style={styles.ghostButton}
                  onPress={() => navigation.goBack()}
                >
                  <Text style={styles.ghostButtonText}>Sign in</Text>
                </Pressable>
              </View>
              <Text style={styles.brandText}>HappyState</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.title}>Get Started</Text>
              <Text style={styles.subtitle}>Create your account below</Text>

              <TextInput
                ref={nameRef}
                style={styles.input}
                placeholder="Your name"
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                placeholderTextColor="#A0AEC0"
              />

              <TextInput
                ref={emailRef}
                style={styles.input}
                placeholder="Email address"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                placeholderTextColor="#A0AEC0"
              />

              <TextInput
                ref={passwordRef}
                style={styles.input}
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                returnKeyType="next"
                onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                placeholderTextColor="#A0AEC0"
              />

              <TextInput
                ref={confirmPasswordRef}
                style={styles.input}
                placeholder="Confirm password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={handleSignup}
                placeholderTextColor="#A0AEC0"
              />

              <Pressable
                style={[styles.signUpButton, authLoading && styles.disabled]}
                onPress={handleSignup}
                disabled={authLoading}
              >
                <LinearGradient
                  colors={["#0033ff", "#3e58c1", "#0e1b58"]}
                  locations={[0, 0.5, 1]}
                  start={{ x: 1, y: 1 }}
                  end={{ x: 0, y: 0 }}
                  style={styles.signUpButtonGradient}
                >
                  <Text style={styles.signUpButtonText}>
                    {authLoading ? "Creating..." : "Sign up"}
                  </Text>
                </LinearGradient>
              </Pressable>

              <Pressable
                style={styles.linkButton}
                onPress={() => navigation.goBack()}
              >
                <Text style={styles.linkText}>Already have an account? Login</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradientBackground: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "flex-start",
    paddingBottom: 130,
  },
  heroSection: {
    paddingHorizontal: 22,
    paddingTop: 30,
    paddingBottom: 28,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topRowText: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 14,
  },
  ghostButton: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 11,
  },
  ghostButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  brandText: {
    marginTop: 36,
    textAlign: "center",
    color: "#FFFFFF",
    fontSize: 44,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 30,
    paddingTop: 32,
    paddingHorizontal: 20,
    paddingBottom: 26,
    minHeight: 560,
  },
  title: {
    fontSize: 40,
    fontWeight: "800",
    color: "#1B1C2B",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 24,
    color: "#6E7191",
    textAlign: "center",
    fontSize: 17,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E7E9F2",
    borderRadius: 13,
    paddingHorizontal: 15,
    height: 54,
    marginBottom: 12,
    color: COLORS.text,
    backgroundColor: "#FFFFFF",
    fontSize: 16,
  },
  signUpButton: {
    borderRadius: 13,
    overflow: "hidden",
    marginTop: 4,
  },
  signUpButtonGradient: {
    height: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  signUpButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.7,
  },
  linkButton: {
    marginTop: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  linkText: {
    color: COLORS.primary,
    fontWeight: "600",
    fontSize: 15,
  },
});
