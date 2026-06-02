import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export default function CreateProgramScreen() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim()) {
      Alert.alert("Required", "Please enter a program name.");
      return;
    }
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // 1. Create the program
    const { data: program, error: programError } = await supabase
      .from("programs")
      .insert({
        user_id: user.id,
        name: name.trim(),
        description: description.trim() || null,
      })
      .select()
      .single();

    if (programError || !program) {
      Alert.alert("Error", "Failed to create program.");
      setSaving(false);
      return;
    }

    // 2. Create 7 program_days (Mon–Sun)
    const daysPayload = DAYS.map((day, i) => ({
      program_id: program.id,
      name: day,
      day_order: i,
    }));
    const { error: daysError } = await supabase
      .from("program_days")
      .insert(daysPayload);

    if (daysError) {
      Alert.alert("Error", "Failed to create program days.");
      setSaving(false);
      return;
    }

    setSaving(false);
    // Navigate to the program detail so user can add exercises
    router.replace(`/programs/${program.id}`);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar barStyle="light-content" />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>New Program</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>PROGRAM DETAILS</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Title</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Push Pull Legs"
            placeholderTextColor="#333"
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>
            Description <Text style={styles.optional}>(optional)</Text>
          </Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="What's this program about?"
            placeholderTextColor="#333"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        <Text style={styles.sectionLabel}>WEEKLY SCHEDULE</Text>
        <Text style={styles.scheduleHint}>
          Your program will have 7 day slots. You'll add exercises to each day
          on the next screen.
        </Text>

        <View style={styles.daysPreview}>
          {DAYS.map((day, i) => (
            <View key={day} style={styles.dayChip}>
              <Text style={styles.dayChipNum}>{i + 1}</Text>
              <Text style={styles.dayChipText}>{day}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.createBtn, saving && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Text style={styles.createBtnText}>
            {saving ? "Creating…" : "Create Program"}
          </Text>
          {!saving && <Ionicons name="arrow-forward" size={18} color="#fff" />}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050505" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    backgroundColor: "#111",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  scroll: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8 },
  sectionLabel: {
    color: "#555",
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 14,
    marginTop: 8,
  },
  inputGroup: { marginBottom: 18 },
  inputLabel: {
    color: "#888",
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  optional: { color: "#444", fontWeight: "400" },
  input: {
    backgroundColor: "#111",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#fff",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#1a1a1a",
  },
  textArea: { height: 100, paddingTop: 14 },
  scheduleHint: {
    color: "#444",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
  },
  daysPreview: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 32,
  },
  dayChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#111",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "#1a1a1a",
  },
  dayChipNum: {
    color: "#800000",
    fontSize: 10,
    fontWeight: "700",
  },
  dayChipText: { color: "#888", fontSize: 13 },
  createBtn: {
    backgroundColor: "#800000",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  createBtnDisabled: { opacity: 0.5 },
  createBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
