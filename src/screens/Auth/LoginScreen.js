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

export default function LoginScreen({ navigation }) {
  const { login, authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const passwordRef = useRef(null);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Missing fields", "Please enter email and password.");
      return;
    }

    try {
      await login({ email, password });
    } catch (error) {
      Alert.alert("Login failed", error?.message || "Could not sign in.");
    }
  };

  return (
    <LinearGradient
      colors={["#8298fa", "#E3E8FF"]}
      start={{ x: 0, y: 1 }}
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
                <Text style={styles.topRowText}>Don't have an account?</Text>
                <Pressable
                  style={styles.ghostButton}
                  onPress={() => navigation.navigate("Signup")}
                >
                  <Text style={styles.ghostButtonText}>Get Started</Text>
                </Pressable>
              </View>
              <Text style={styles.brandText}>HappyState</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.title}>Welcome Back</Text>
              <Text style={styles.subtitle}>Enter your details below</Text>

              <TextInput
                style={styles.input}
                placeholder="Email address"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                returnKeyType="next"
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor="#A0AEC0"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />

              <TextInput
                ref={passwordRef}
                style={styles.input}
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                returnKeyType="done"
                placeholderTextColor="#A0AEC0"
                onSubmitEditing={handleLogin}
              />

              <Pressable
                style={[styles.signInButton, authLoading && styles.disabled]}
                onPress={handleLogin}
                disabled={authLoading}
              >
                <LinearGradient
                  colors={["#8298fa", "#E3E8FF"]}
                  start={{ x: 0, y: 1 }}
                  end={{ x: 0, y: 0 }}
                  style={styles.signInButtonGradient}
                >
                  <Text style={styles.signInButtonText}>
                    {authLoading ? "Signing In..." : "Sign in"}
                  </Text>
                </LinearGradient>
              </Pressable>

              <Pressable style={styles.forgotButton}>
                <Text style={styles.forgotButtonText}>
                  Forgot your password?
                </Text>
              </Pressable>

              <View style={styles.separatorWrap}>
                <View style={styles.separatorLine} />
                <Text style={styles.separatorText}>Or sign in with</Text>
                <View style={styles.separatorLine} />
              </View>

              <View style={styles.socialRow}>
                <Pressable style={styles.socialButton}>
                  <Text style={styles.socialButtonText}>Google</Text>
                </Pressable>
                <Pressable style={styles.socialButton}>
                  <Text style={styles.socialButtonText}>Facebook</Text>
                </Pressable>
              </View>
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
    marginTop: 10,

    borderRadius: 30,
    backgroundColor: COLORS.surface,
    paddingTop: 32,
    paddingHorizontal: 20,
    paddingBottom: 26,
    minHeight: 520,
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
  signInButton: {
    borderRadius: 13,
    overflow: "hidden",
    marginTop: 4,
  },
  signInButtonGradient: {
    height: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  signInButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.7,
  },
  forgotButton: {
    marginTop: 18,
    alignItems: "center",
  },
  forgotButtonText: {
    color: "#70748F",
    fontSize: 15,
    fontWeight: "500",
  },
  separatorWrap: {
    marginTop: 22,
    flexDirection: "row",
    alignItems: "center",
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#ECEEF5",
  },
  separatorText: {
    marginHorizontal: 14,
    color: "#99A1BA",
    fontSize: 13,
  },
  socialRow: {
    marginTop: 18,
    flexDirection: "row",
    gap: 10,
  },
  socialButton: {
    flex: 1,
    height: 50,
    borderWidth: 1,
    borderColor: "#ECEEF5",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  socialButtonText: {
    color: "#27304A",
    fontSize: 15,
    fontWeight: "600",
  },
});
