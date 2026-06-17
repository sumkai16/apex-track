import { Link, router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
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
import { supabase } from "../../lib/supabase";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({ email: "", password: "" });
  const params = useLocalSearchParams();
  const registered = params?.registered;
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (registered) {
      setShowSuccess(true);
      const t = setTimeout(() => {
        setShowSuccess(false);
        // remove the query param so the message doesn't reappear on refresh
        router.replace("/(auth)/login");
      }, 3200);
      return () => clearTimeout(t);
    }
  }, [registered]);

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

  const handleEmailChange = (text: string) => {
    setEmail(text);
    setErrors((prev) => ({ ...prev, email: validateEmail(text) }));
  };

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    setErrors((prev) => ({ ...prev, password: validatePassword(text) }));
  };

  const isFormValid = () => {
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    return !emailError && !passwordError;
  };

  async function handleLogin() {
    if (!isFormValid()) {
      setErrors({
        email: validateEmail(email),
        password: validatePassword(password),
      });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);

    if (error) {
      Alert.alert("Login failed", error.message);
    } else {
      router.replace("/(tabs)/home");
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
          {showSuccess ? (
            <View style={styles.successBanner}>
              <Text style={styles.successText}>
                Account created — please sign in
              </Text>
            </View>
          ) : null}
          <Image
            source={require("../../assets/images/logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to continue your grind</Text>
        </View>

        <View style={styles.form}>
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
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? "Logging in..." : "LOG IN"}
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
          <TouchableOpacity style={styles.socialButton}>
            <Image
              source={require("../../assets/images/gmail.png")}
              style={styles.socialIcon}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </View>

        <Link href="/(auth)/register" asChild>
          <TouchableOpacity style={styles.linkButton}>
            <Text style={styles.linkText}>
              No account? <Text style={styles.linkAccent}>Register</Text>
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
  successBanner: {
    backgroundColor: "#0a7a0a",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  successText: {
    color: "#eaffea",
    fontSize: 13,
    textAlign: "center",
  },
});
