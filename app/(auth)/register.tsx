import { Link, router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { signInWithGoogle } from "../../lib/auth/oauth";
import { supabase } from "../../lib/supabase";
import { registeringFlag } from "../_layout";

export default function RegisterScreen() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const busy = loading || googleLoading;
  const [errors, setErrors] = useState({
    displayName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const validateDisplayName = (text: string) => {
    if (!text) {
      return "Display name is required";
    } else if (text.length < 2) {
      return "Display name must be at least 2 characters";
    } else if (text.length > 30) {
      return "Display name must be less than 30 characters";
    }
    return "";
  };

  const validateEmail = (text: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!text) {
      return "Email is required";
    } else if (!emailRegex.test(text)) {
      return "Please enter a valid email address";
    }
    return "";
  };

  const validatePassword = (text: string) => {
    if (!text) {
      return "Password is required";
    } else if (text.length < 8) {
      return "Password must be at least 8 characters";
    } else if (!/[A-Z]/.test(text)) {
      return "Password must contain at least one uppercase letter";
    } else if (!/[a-z]/.test(text)) {
      return "Password must contain at least one lowercase letter";
    } else if (!/[0-9]/.test(text)) {
      return "Password must contain at least one number";
    }
    return "";
  };

  const validateConfirmPassword = (text: string) => {
    if (!text) {
      return "Please confirm your password";
    } else if (text !== password) {
      return "Passwords do not match";
    }
    return "";
  };

  const handleDisplayNameChange = (text: string) => {
    setDisplayName(text);
    setErrors((prev) => ({ ...prev, displayName: validateDisplayName(text) }));
  };

  const handleEmailChange = (text: string) => {
    setEmail(text);
    setErrors((prev) => ({ ...prev, email: validateEmail(text) }));
  };

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    setErrors((prev) => ({
      ...prev,
      password: validatePassword(text),
      confirmPassword: prev.confirmPassword
        ? prev.confirmPassword !== text
          ? "Passwords do not match"
          : ""
        : prev.confirmPassword,
    }));
  };

  const handleConfirmPasswordChange = (text: string) => {
    setConfirmPassword(text);
    setErrors((prev) => ({
      ...prev,
      confirmPassword: validateConfirmPassword(text),
    }));
  };

  const isFormValid = () => {
    const displayNameError = validateDisplayName(displayName);
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    const confirmError = validateConfirmPassword(confirmPassword);
    return !displayNameError && !emailError && !passwordError && !confirmError;
  };

  async function handleRegister() {
    if (!isFormValid()) {
      setErrors({
        displayName: validateDisplayName(displayName),
        email: validateEmail(email),
        password: validatePassword(password),
        confirmPassword: validateConfirmPassword(confirmPassword),
      });
      return;
    }

    registeringFlag.value = true;
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      registeringFlag.value = false;
      setLoading(false);
      Alert.alert("Registration failed", error.message);
      return;
    }

    if (data.user) {
      await supabase.from("profiles").insert({
        id: data.user.id,
        display_name: displayName,
      });
      await supabase.auth.signOut();
    }

    setLoading(false);
    registeringFlag.value = false;
    router.replace("/(auth)/login?registered=1");
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    try {
      const success = await signInWithGoogle();
      if (success) {
        router.replace("/(tabs)/home");
      }
    } catch (err: any) {
      Alert.alert("Google sign-in failed", err.message ?? "Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoContainer}>
          <Image
            source={require("../../assets/images/logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>Start tracking your gains</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>DISPLAY NAME</Text>
          <TextInput
            style={[
              styles.input,
              errors.displayName ? styles.inputError : null,
            ]}
            placeholder="e.g. Axcee"
            placeholderTextColor="#444"
            value={displayName}
            onChangeText={handleDisplayNameChange}
            editable={!loading}
          />
          {errors.displayName ? (
            <Text style={styles.errorText}>{errors.displayName}</Text>
          ) : null}

          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            style={[styles.input, errors.email ? styles.inputError : null]}
            placeholder="you@email.com"
            placeholderTextColor="#444"
            value={email}
            onChangeText={handleEmailChange}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!loading}
          />
          {errors.email ? (
            <Text style={styles.errorText}>{errors.email}</Text>
          ) : null}

          <Text style={styles.label}>PASSWORD</Text>
          <View
            style={[
              styles.passwordContainer,
              errors.password ? styles.inputError : null,
            ]}
          >
            <TextInput
              style={styles.passwordInput}
              placeholder="••••••••"
              placeholderTextColor="#444"
              value={password}
              onChangeText={handlePasswordChange}
              secureTextEntry={!showPassword}
              editable={!loading}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              disabled={loading}
            >
              <Text style={styles.showText}>
                {showPassword ? "Hide" : "Show"}
              </Text>
            </TouchableOpacity>
          </View>
          {errors.password ? (
            <Text style={styles.errorText}>{errors.password}</Text>
          ) : null}

          <Text style={styles.label}>CONFIRM PASSWORD</Text>
          <View
            style={[
              styles.passwordContainer,
              errors.confirmPassword ? styles.inputError : null,
            ]}
          >
            <TextInput
              style={styles.passwordInput}
              placeholder="••••••••"
              placeholderTextColor="#444"
              value={confirmPassword}
              onChangeText={handleConfirmPasswordChange}
              secureTextEntry={!showPassword}
              editable={!loading}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(!showPassword)}
              disabled={loading}
            >
              <Text style={styles.showText}>
                {showPassword ? "Hide" : "Show"}
              </Text>
            </TouchableOpacity>
          </View>
          {errors.confirmPassword ? (
            <Text style={styles.errorText}>{errors.confirmPassword}</Text>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? "Creating account..." : "CREATE ACCOUNT"}
          </Text>
        </TouchableOpacity>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or continue with</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.socialRow}>
          <TouchableOpacity style={styles.socialButton}>
            <Image
              source={require("../../assets/images/fb.png")}
              style={styles.socialIcon}
              resizeMode="contain"
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.socialButton, busy && styles.buttonDisabled]}
            onPress={handleGoogleSignIn}
            disabled={busy}
          >
            <Image
              source={require("../../assets/images/gmail.png")}
              style={styles.socialIcon}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </View>

        <Link href="/(auth)/login" asChild>
          <TouchableOpacity style={styles.linkButton}>
            <Text style={styles.linkText}>
              Have an account? <Text style={styles.linkAccent}>Log in</Text>
            </Text>
          </TouchableOpacity>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050505" },
  inner: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  logoContainer: { alignItems: "center", marginBottom: 36 },
  logo: { width: 340, height: 180, marginBottom: 16 },
  title: { color: "#fff", fontSize: 22, fontWeight: "700", marginBottom: 4 },
  subtitle: { color: "#555", fontSize: 13 },
  form: { marginBottom: 20 },
  label: {
    color: "#888",
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    backgroundColor: "#111",
    color: "#fff",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    borderWidth: 1,
    borderColor: "transparent",
  },
  inputError: {
    borderColor: "#cc0000",
  },
  errorText: {
    color: "#ff4444",
    fontSize: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  passwordContainer: {
    backgroundColor: "#111",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "transparent",
  },
  passwordInput: { flex: 1, color: "#fff", fontSize: 14 },
  showText: { color: "#555", fontSize: 12 },
  button: {
    backgroundColor: "#800000",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 20,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 1,
  },
  dividerRow: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#222" },
  dividerText: { color: "#444", fontSize: 12, marginHorizontal: 10 },
  socialRow: { flexDirection: "row", gap: 12, marginBottom: 28 },

  socialButton: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  socialIcon: { width: 40, height: 40 },
  linkButton: { alignItems: "center" },
  linkText: { color: "#555", fontSize: 13 },
  linkAccent: { color: "#800000", fontWeight: "600" },
});
