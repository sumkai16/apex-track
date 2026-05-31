import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface Exercise {
  id: string;
  name: string;
}

interface ProgramExercise {
  id: string;
  order_index: number;
  target_sets: number | null;
  target_reps: number | null;
  exercises: Exercise;
}

interface ProgramDay {
  id: string;
  name: string;
  day_order: number;
  program_exercises: ProgramExercise[];
}

interface Program {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export default function ProgramDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [program, setProgram] = useState<Program | null>(null);
  const [days, setDays] = useState<ProgramDay[]>([]);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      fetchProgram();
    }, [id]),
  );

  async function fetchProgram() {
    setLoading(true);
    const { data: prog } = await supabase
      .from("programs")
      .select("*")
      .eq("id", id)
      .single();
    if (prog) setProgram(prog);

    const { data: daysData } = await supabase
      .from("program_days")
      .select(
        `
        id, name, day_order,
        program_exercises (
          id, order_index, target_sets, target_reps,
          exercises ( id, name )
        )
      `,
      )
      .eq("program_id", id)
      .order("day_order", { ascending: true });

    if (daysData) setDays(daysData as ProgramDay[]);
    setLoading(false);
  }

  function toggleDay(dayId: string) {
    setExpandedDay((prev) => (prev === dayId ? null : dayId));
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1}>
          {program?.name || "Program"}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <ActivityIndicator color="#800000" style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {program?.description ? (
            <Text style={styles.desc}>{program.description}</Text>
          ) : null}

          <Text style={styles.sectionLabel}>WEEKLY SCHEDULE</Text>

          {days.map((day) => {
            const isOpen = expandedDay === day.id;
            const exCount = day.program_exercises?.length ?? 0;
            return (
              <View key={day.id} style={styles.dayCard}>
                <TouchableOpacity
                  style={styles.dayHeader}
                  onPress={() => toggleDay(day.id)}
                  activeOpacity={0.8}
                >
                  <View style={styles.dayHeaderLeft}>
                    <View style={styles.dayBadge}>
                      <Text style={styles.dayBadgeText}>
                        {day.day_order + 1}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.dayName}>{day.name}</Text>
                      <Text style={styles.dayMeta}>
                        {exCount === 0
                          ? "Rest day · tap to add exercises"
                          : `${exCount} exercise${exCount !== 1 ? "s" : ""}`}
                      </Text>
                    </View>
                  </View>
                  <Ionicons
                    name={isOpen ? "chevron-up" : "chevron-down"}
                    size={18}
                    color="#444"
                  />
                </TouchableOpacity>

                {isOpen && (
                  <View style={styles.dayBody}>
                    {day.program_exercises
                      ?.sort((a, b) => a.order_index - b.order_index)
                      .map((pe) => (
                        <View key={pe.id} style={styles.exerciseRow}>
                          <View style={styles.exerciseRowLeft}>
                            <View style={styles.exerciseDot} />
                            <Text style={styles.exerciseName}>
                              {pe.exercises?.name}
                            </Text>
                          </View>
                          <View style={styles.exerciseMeta}>
                            {pe.target_sets && pe.target_reps ? (
                              <Text style={styles.exerciseSetsReps}>
                                {pe.target_sets}×{pe.target_reps}
                              </Text>
                            ) : null}
                            <TouchableOpacity
                              onPress={() =>
                                router.push(
                                  `/programs/${id}/day/${day.id}/exercise/${pe.id}/edit`,
                                )
                              }
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons
                                name="pencil-outline"
                                size={14}
                                color="#444"
                              />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}

                    <TouchableOpacity
                      style={styles.addExerciseBtn}
                      onPress={() =>
                        router.push(
                          `/programs/${id}/day/${day.id}/add-exercise`,
                        )
                      }
                      activeOpacity={0.8}
                    >
                      <Ionicons name="add" size={16} color="#800000" />
                      <Text style={styles.addExerciseBtnText}>
                        Add Exercise
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
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
  topBarTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
    marginHorizontal: 8,
  },
  scroll: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 4 },
  desc: { color: "#555", fontSize: 13, lineHeight: 19, marginBottom: 20 },
  sectionLabel: {
    color: "#555",
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 14,
  },
  dayCard: {
    backgroundColor: "#111",
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#1a1a1a",
    overflow: "hidden",
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  dayHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  dayBadge: {
    width: 30,
    height: 30,
    backgroundColor: "rgba(128,0,0,0.15)",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(128,0,0,0.3)",
  },
  dayBadgeText: { color: "#800000", fontSize: 12, fontWeight: "700" },
  dayName: { color: "#fff", fontSize: 14, fontWeight: "600" },
  dayMeta: { color: "#444", fontSize: 11, marginTop: 2 },
  dayBody: {
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
    padding: 14,
    gap: 2,
  },
  exerciseRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
  },
  exerciseRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  exerciseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#800000",
  },
  exerciseName: { color: "#ccc", fontSize: 13, flex: 1 },
  exerciseMeta: { flexDirection: "row", alignItems: "center", gap: 10 },
  exerciseSetsReps: {
    color: "#555",
    fontSize: 12,
    fontWeight: "600",
  },
  addExerciseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  addExerciseBtnText: { color: "#800000", fontSize: 13, fontWeight: "600" },
});
