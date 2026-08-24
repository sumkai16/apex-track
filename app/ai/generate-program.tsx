import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";

interface Question {
  id: string;
  order_index: number;
  question: string;
  field_key: string;
  suggestions: string[];
}

export default function GenerateProgramScreen() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();
      if (profile?.display_name) {
        setDisplayName(profile.display_name.split(" ")[0]);
      }
    }

    const { data } = await supabase
      .from("ai_generator_questions")
      .select("*")
      .eq("is_active", true)
      .order("order_index");

    if (data) setQuestions(data);
    setLoading(false);
  }

  function selectAnswer(fieldKey: string, answer: string) {
    setAnswers((prev) => ({ ...prev, [fieldKey]: answer }));
  }

  function isComplete() {
    return questions.every((q) => answers[q.field_key]);
  }

  async function handleGenerate() {
    if (!isComplete()) {
      Alert.alert(
        "Incomplete",
        "Please answer all questions before generating.",
      );
      return;
    }

    setGenerating(true);

    try {
      // The prompt, the exercise catalogue and the OpenRouter key all live in
      // the `generate-program` Edge Function now — the key must not ship in the
      // app bundle. The function also validates the returned exercise ids
      // against the catalogue before we insert them.
      const { data, error } = await supabase.functions.invoke(
        "generate-program",
        { body: { answers } },
      );

      if (error) {
        let message = "Failed to generate program. Please try again.";
        const context = (error as { context?: Response }).context;
        if (context && typeof context.json === "function") {
          const errBody = await context.json().catch(() => null);
          if (errBody?.error) message = String(errBody.error);
        }
        throw new Error(message);
      }

      if (!data?.program) throw new Error("The AI returned an empty program.");

      await saveProgram(data.program, data.daysPerWeek ?? 4);
    } catch (err) {
      console.log("Generate error:", err);
      Alert.alert(
        "Error",
        err instanceof Error
          ? err.message
          : "Failed to generate program. Please try again.",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function saveProgram(parsed: any, daysPerWeek: number) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: program, error: programError } = await supabase
      .from("programs")
      .insert({
        user_id: user.id,
        name: parsed.program_name,
        description: parsed.description,
      })
      .select()
      .single();

    if (programError || !program) throw new Error("Failed to create program");

    const allDays = [];
    let trainingIndex = 0;
    for (let i = 0; i < 7; i++) {
      if (
        trainingIndex < parsed.days.length &&
        shouldTrainOnDay(i, daysPerWeek)
      ) {
        allDays.push({
          program_id: program.id,
          name: parsed.days[trainingIndex].name,
          day_order: i,
          is_rest_day: false,
        });
        trainingIndex++;
      } else {
        allDays.push({
          program_id: program.id,
          name: getDayName(i),
          day_order: i,
          is_rest_day: true,
        });
      }
    }

    const { data: createdDays, error: daysError } = await supabase
      .from("program_days")
      .insert(allDays)
      .select();

    if (daysError || !createdDays) throw new Error("Failed to create days");

    const trainingDays = createdDays.filter((d) => !d.is_rest_day);
    for (let i = 0; i < parsed.days.length; i++) {
      const day = parsed.days[i];
      const createdDay = trainingDays[i];
      if (!createdDay) continue;

      const exercisesPayload = day.exercises.map((ex: any, idx: number) => ({
        program_day_id: createdDay.id,
        exercise_id: ex.exercise_id,
        target_sets: ex.target_sets,
        target_reps: ex.target_reps,
        order_index: idx,
      }));

      await supabase.from("program_exercises").insert(exercisesPayload);
    }

    Alert.alert(
      "🎉 Program Created!",
      `"${parsed.program_name}" has been added to your programs.`,
      [
        {
          text: "View Program",
          onPress: () => router.replace(`/programs/${program.id}`),
        },
      ],
    );
  }

  function shouldTrainOnDay(dayIndex: number, totalDays: number): boolean {
    const patterns: Record<number, number[]> = {
      3: [0, 2, 4],
      4: [0, 1, 3, 4],
      5: [0, 1, 2, 4, 5],
      6: [0, 1, 2, 3, 4, 5],
    };
    return patterns[totalDays]?.includes(dayIndex) ?? false;
  }

  function getDayName(index: number): string {
    return [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ][index];
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#FF3B30" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color="#FAFAFA" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>AI Program Generator</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.badgeIcon}>
            <Ionicons name="sparkles" size={16} color="#FF3B30" />
          </View>
          <Text style={styles.headerText}>
            {displayName
              ? `LET'S BUILD YOUR PROGRAM, ${displayName}.`
              : "LET'S BUILD YOUR PROGRAM."}
          </Text>
        </View>
        <Text style={styles.headerSub}>
          Answer the questions below and we&apos;ll generate a science-based training
          program tailored to you.
        </Text>

        {questions.map((q, qi) => (
          <View key={q.id} style={styles.questionBlock}>
            <View style={styles.questionHeaderRow}>
              <View style={styles.numberBadge}>
                <Text style={styles.questionNumber}>0{qi + 1}</Text>
              </View>
              <Text style={styles.questionText}>{q.question}</Text>
            </View>

            <View style={styles.chipsRow}>
              {q.suggestions.map((s, si) => {
                const isSelected = answers[q.field_key] === s;
                return (
                  <TouchableOpacity
                    key={si}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                    onPress={() => selectAnswer(q.field_key, s)}
                    disabled={generating}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        isSelected && styles.chipTextSelected,
                      ]}
                    >
                      {s}
                    </Text>
                    <View
                      style={[
                        styles.radioOuter,
                        isSelected && styles.radioOuterSelected,
                      ]}
                    >
                      {isSelected && <View style={styles.radioInner} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}

        <TouchableOpacity
          style={[
            styles.generateBtn,
            (!isComplete() || generating) && styles.generateBtnDisabled,
          ]}
          onPress={handleGenerate}
          disabled={!isComplete() || generating}
          activeOpacity={0.85}
        >
          {generating ? (
            <View style={styles.btnRow}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.generateBtnText}>
                Engineering Your Program...
              </Text>
            </View>
          ) : (
            <View style={styles.btnRow}>
              <Ionicons name="flash" size={18} color="#fff" />
              <Text style={styles.generateBtnText}>Generate Program</Text>
            </View>
          )}
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          Program is generated based on evidence-based training principles.
          Always consult a professional before starting a new training regimen.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#09090B" },
  centered: {
    flex: 1,
    backgroundColor: "#09090B",
    justifyContent: "center",
    alignItems: "center",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: "#18181B",
  },
  backBtn: {
    width: 38,
    height: 38,
    backgroundColor: "#141417",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#27272A",
  },
  topBarTitle: {
    color: "#FAFAFA",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  scroll: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 60 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  badgeIcon: {
    padding: 8,
    backgroundColor: "rgba(255, 59, 48, 0.1)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 59, 48, 0.2)",
  },
  headerText: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    flex: 1,
    letterSpacing: -0.5,
  },
  headerSub: {
    color: "#71717A",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 32,
    fontWeight: "500",
  },
  questionBlock: { marginBottom: 32 },
  questionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  numberBadge: {
    backgroundColor: "#18181B",
    borderWidth: 1,
    borderColor: "#27272A",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  questionNumber: {
    color: "#FF3B30",
    fontSize: 11,
    fontWeight: "700",
  },
  questionText: {
    color: "#F4F4F5",
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
    letterSpacing: -0.2,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#141417",
    borderWidth: 1,
    borderColor: "#202024",
    minWidth: "48%", // Allows 2 items per row smoothly on standard screens
    flexGrow: 1,
  },
  chipSelected: {
    backgroundColor: "rgba(255, 59, 48, 0.08)",
    borderColor: "#FF3B30",
  },
  chipText: { color: "#A1A1AA", fontSize: 14, fontWeight: "600" },
  chipTextSelected: { color: "#FFFFFF", fontWeight: "700" },
  radioOuter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#3F3F46",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
  radioOuterSelected: {
    borderColor: "#FF3B30",
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF3B30",
  },
  generateBtn: {
    backgroundColor: "#f40c00",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 12,
    marginBottom: 20,
    shadowColor: "#FF3B30",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 5,
  },
  generateBtnDisabled: {
    backgroundColor: "#27272A",
    opacity: 0.4,
    shadowOpacity: 0,
    elevation: 0,
  },
  generateBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  btnRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  disclaimer: {
    color: "#52525B",
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    paddingHorizontal: 10,
    fontWeight: "500",
  },
});
