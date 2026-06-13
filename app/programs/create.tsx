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

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const TEMPLATES: Record<
  string,
  { title: string; description: string; days: string[][] }
> = {
  "strength-4wk": {
    title: "4-Week Strength Builder",
    description:
      "Progressive full-body strength program — Beginner to Intermediate",
    days: [
      [
        "Barbell Back Squat",
        "Barbell Bench Press",
        "Bent-Over Barbell Row",
        "Walking Lunges",
      ],
      [
        "Romanian Deadlift",
        "Overhead Barbell Press",
        "Weighted Pull-Up",
        "Incline Dumbbell Row",
      ],
      ["Rest"],
      [
        "Front Squat",
        "Close-Grip Bench Press",
        "Single-Arm Dumbbell Row",
        "Hamstring Curl",
      ],
      [
        "Conventional Deadlift",
        "Dumbbell Shoulder Press",
        "Lat Pulldown",
        "Bulgarian Split Squat",
      ],
      [
        "Dumbbell Biceps Curl",
        "Tricep Rope Pushdown",
        "Hanging Leg Raise",
        "Farmer's Carry",
      ],
      ["Rest"],
    ],
  },
  "hypertrophy-6wk": {
    title: "6-Week Hypertrophy Focus",
    description: "Upper/lower split with volume progression for muscle growth",
    days: [
      [
        "Barbell Bench Press",
        "Incline Dumbbell Press",
        "Cable Crossover",
        "One-Arm Dumbbell Row",
        "Tricep Rope Pushdown",
        "Dumbbell Biceps Curl",
      ],
      [
        "Back Squat",
        "Leg Press",
        "Romanian Deadlift",
        "Lying Leg Curl",
        "Seated Calf Raise",
      ],
      [
        "Overhead Barbell Press",
        "Dumbbell Lateral Raise",
        "Rear Delt Fly",
        "Face Pull",
        "Skull Crusher",
      ],
      [
        "Conventional Deadlift",
        "Bulgarian Split Squat",
        "Leg Extension",
        "Standing Calf Raise",
      ],
      ["Chest Supported Row", "Incline Fly", "Hammer Curl", "Parallel Bar Dip"],
      ["Accessory / Conditioning: Farmer Carry, Battle Ropes"],
      ["Rest"],
    ],
  },
  "conditioning-3wk": {
    title: "3-Week Conditioning Primer",
    description:
      "Short, intense sessions to boost aerobic capacity and work capacity",
    days: [
      ["Interval Treadmill Sprints", "Burpees", "Box Jumps", "Core Plank"],
      ["Rowing Machine 4x500m", "Kettlebell Swings", "Russian Twists"],
      ["Active Recovery: Mobility / Light Swim"],
      ["Circuit: Push-Ups", "Goblet Squat", "TRX Rows", "Plank"],
      ["Hill Sprints", "Sled Push"],
      ["Mixed Intervals: Battle Ropes", "Jump Rope", "Shuttle Runs"],
      ["Rest"],
    ],
  },
};

export default function CreateProgramScreen() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const params = useLocalSearchParams();

  useEffect(() => {
    const template = params?.template as string | undefined;
    if (!template) return;
    try {
      const parsed = JSON.parse(decodeURIComponent(String(template)));
      if (parsed?.name) setName(parsed.name);
      if (parsed?.description) setDescription(parsed.description);
    } catch (e) {
      // ignore malformed template param
    }
  }, [params]);

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

    // 2. Create 7 program_days (Mon–Sun) and return created rows
    const daysPayload = DAYS.map((day, i) => ({
      program_id: program.id,
      name: day,
      day_order: i,
    }));

    const { data: createdDays, error: daysError } = await supabase
      .from("program_days")
      .insert(daysPayload)
      .select();

    if (daysError || !createdDays) {
      Alert.alert("Error", "Failed to create program days.");
      setSaving(false);
      return;
    }

    // If a template was provided, attempt to populate exercises
    const templateParam = params?.template as string | undefined;
    if (templateParam) {
      try {
        const parsed = JSON.parse(decodeURIComponent(String(templateParam)));
        const tplId = parsed?.id as string | undefined;
        if (tplId && TEMPLATES[tplId]) {
          const tpl = TEMPLATES[tplId];

          // Build unique exercise name list
          const allNames = new Set<string>();
          tpl.days.forEach((dayArr) => dayArr.forEach((n) => allNames.add(n)));
          // Remove placeholders like 'Rest' or 'Accessory/Conditioning' that shouldn't map to exercises
          const exerciseNames = Array.from(allNames).filter(
            (n) => !/rest|accessory|active recovery|circuit/i.test(n),
          );

          // Lookup existing exercises
          let existing: { id: string; name: string }[] = [];
          if (exerciseNames.length > 0) {
            const { data: exData } = await supabase
              .from("exercises")
              .select("id, name")
              .in("name", exerciseNames);
            if (exData) existing = exData as { id: string; name: string }[];
          }

          const existingMap = new Map(existing.map((e) => [e.name, e.id]));

          // Create missing exercises
          const missing = exerciseNames.filter((n) => !existingMap.has(n));
          if (missing.length > 0) {
            const payload = missing.map((name) => ({
              name,
              category: null,
              equipment_type: null,
              is_system: true,
              created_by: user.id,
            }));
            const { data: inserted } = await supabase
              .from("exercises")
              .insert(payload)
              .select("id, name");
            if (inserted) {
              inserted.forEach((it: any) => existingMap.set(it.name, it.id));
            }
          }

          // Map day_order -> program_day_id
          const dayIdByOrder = new Map<number, string>();
          createdDays.forEach((d: any) => dayIdByOrder.set(d.day_order, d.id));

          // Build program_exercises payload
          const pePayload: any[] = [];
          tpl.days.forEach((dayArr, dayIndex) => {
            const dayId = dayIdByOrder.get(dayIndex);
            if (!dayId) return;
            let orderIndex = 0;
            dayArr.forEach((exName) => {
              if (/rest|active recovery/i.test(exName)) return;
              // Use created id if available
              const exId = existingMap.get(exName);
              if (!exId) return;
              pePayload.push({
                program_day_id: dayId,
                exercise_id: exId,
                order_index: orderIndex++,
                target_sets: null,
                target_reps: null,
              });
            });
          });

          if (pePayload.length > 0) {
            const { error: peError } = await supabase
              .from("program_exercises")
              .insert(pePayload);
            if (peError) {
              console.warn(
                "Failed to insert program_exercises:",
                peError.message,
              );
            }
          }
        }
      } catch (e) {
        // ignore template parsing errors
        console.warn(e);
      }
    }

    setSaving(false);
    // Navigate to the program detail so user can review populated program
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
