import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
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

export default function EditExerciseScreen() {
  const {
    id: programId,
    dayId,
    exerciseId,
  } = useLocalSearchParams<{
    id: string;
    dayId: string;
    exerciseId: string;
  }>();

  const [exerciseName, setExerciseName] = useState("");
  const [sets, setSets] = useState("");
  const [reps, setReps] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchExercise();
  }, [exerciseId]);

  async function fetchExercise() {
    const { data } = await supabase
      .from("program_exercises")
      .select("target_sets, target_reps, notes, exercises(name)")
      .eq("id", exerciseId)
      .single();
    if (data) {
      const ex = data as any;
      setExerciseName(ex.exercises?.name || "");
      setSets(data.target_sets?.toString() ?? "");
      setReps(data.target_reps?.toString() ?? "");
      setNotes(data.notes ?? "");
    }
  }

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase
      .from("program_exercises")
      .update({
        target_sets: sets ? parseInt(sets) : null,
        target_reps: reps ? parseInt(reps) : null,
        notes: notes.trim() || null,
      })
      .eq("id", exerciseId);

    if (error) {
      Alert.alert("Error", "Failed to save changes.");
    }
    setSaving(false);
    router.back();
  }

  async function handleDelete() {
    Alert.alert("Remove Exercise", `Remove ${exerciseName} from this day?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          await supabase
            .from("program_exercises")
            .delete()
            .eq("id", exerciseId);
          setDeleting(false);
          router.back();
        },
      },
    ]);
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
        <Text style={styles.topBarTitle}>Edit Exercise</Text>
        <TouchableOpacity
          onPress={handleDelete}
          style={styles.deleteBtn}
          disabled={deleting}
        >
          <Ionicons name="trash-outline" size={18} color="#800000" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.exerciseNameCard}>
          <Text style={styles.exerciseNameLabel}>EXERCISE</Text>
          <Text style={styles.exerciseNameText}>{exerciseName}</Text>
        </View>

        <Text style={styles.sectionLabel}>SETS & REPS</Text>
        <View style={styles.setsRepsRow}>
          <View style={styles.field}>
            <Text style={styles.inputLabel}>Sets</Text>
            <TextInput
              style={styles.numInput}
              placeholder="3"
              placeholderTextColor="#333"
              value={sets}
              onChangeText={setSets}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.divider}>
            <Text style={styles.dividerText}>×</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.inputLabel}>Reps</Text>
            <TextInput
              style={styles.numInput}
              placeholder="10"
              placeholderTextColor="#333"
              value={reps}
              onChangeText={setReps}
              keyboardType="number-pad"
            />
          </View>
        </View>

        <Text style={styles.sectionLabel}>
          NOTES <Text style={styles.optional}>(OPTIONAL)</Text>
        </Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="e.g. Keep back straight, slow on the eccentric…"
          placeholderTextColor="#333"
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Text style={styles.saveBtnText}>
            {saving ? "Saving…" : "Save Changes"}
          </Text>
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
  deleteBtn: {
    width: 36,
    height: 36,
    backgroundColor: "#111",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  scroll: { paddingHorizontal: 20, paddingBottom: 48, paddingTop: 8 },
  exerciseNameCard: {
    backgroundColor: "#111",
    borderRadius: 14,
    padding: 18,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: "#1a1a1a",
  },
  exerciseNameLabel: {
    color: "#555",
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  exerciseNameText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  sectionLabel: {
    color: "#555",
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 14,
  },
  optional: { color: "#333", fontWeight: "400" },
  setsRepsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
    marginBottom: 28,
  },
  field: { flex: 1 },
  divider: { paddingBottom: 14 },
  dividerText: { color: "#444", fontSize: 22, fontWeight: "300" },
  inputLabel: {
    color: "#888",
    fontSize: 11,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  numInput: {
    backgroundColor: "#111",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#fff",
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
    borderWidth: 1,
    borderColor: "#1a1a1a",
  },
  input: {
    backgroundColor: "#111",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#fff",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#1a1a1a",
    marginBottom: 32,
  },
  textArea: { height: 90, paddingTop: 14 },
  saveBtn: {
    backgroundColor: "#800000",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
