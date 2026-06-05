import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useState } from "react";
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

interface Exercise {
  id: string;
  name: string;
}

interface ProgramExercise {
  id: string;
  order_index: number;
  target_sets: number | null;
  target_reps: number | null;
  exercises: Exercise | null;
}

interface ProgramDay {
  id: string;
  name: string;
  day_order: number;
  is_rest_day: boolean;
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
        id, name, day_order, is_rest_day,
        program_exercises (
          id, order_index, target_sets, target_reps,
          exercises ( id, name )
        )
      `,
      )
      .eq("program_id", id)
      .order("day_order", { ascending: true });

    if (daysData) setDays(daysData as unknown as ProgramDay[]);
    setLoading(false);
  }

  async function setActive() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("programs")
      .update({ is_active: false })
      .eq("user_id", user.id);
    await supabase.from("programs").update({ is_active: true }).eq("id", id);
    setProgram((prev) => (prev ? { ...prev, is_active: true } : prev));
  }

  async function toggleRestDay(dayId: string, currentValue: boolean) {
    const newValue = !currentValue;

    // Optimistic update
    setDays((prev) =>
      prev.map((d) => (d.id === dayId ? { ...d, is_rest_day: newValue } : d)),
    );

    const { error } = await supabase
      .from("program_days")
      .update({ is_rest_day: newValue })
      .eq("id", dayId);

    if (error) {
      // Revert on failure
      setDays((prev) =>
        prev.map((d) =>
          d.id === dayId ? { ...d, is_rest_day: currentValue } : d,
        ),
      );
      Alert.alert("Error", "Failed to update rest day.");
    }
  }

  async function handleDeleteExercise(
    programExerciseId: string,
    dayId: string,
  ) {
    const { error } = await supabase
      .from("program_exercises")
      .delete()
      .eq("id", programExerciseId);

    if (error) {
      Alert.alert("Error", "Failed to delete exercise.");
      return;
    }

    setDays((prevDays) =>
      prevDays.map((day) => {
        if (day.id !== dayId) return day;
        return {
          ...day,
          program_exercises: day.program_exercises.filter(
            (pe) => pe.id !== programExerciseId,
          ),
        };
      }),
    );
  }

  async function handleMoveExercise(
    dayId: string,
    exerciseId: string,
    direction: "up" | "down",
  ) {
    const day = days.find((d) => d.id === dayId);
    if (!day) return;

    const sorted = [...day.program_exercises].sort(
      (a, b) => a.order_index - b.order_index,
    );
    const currentIdx = sorted.findIndex((pe) => pe.id === exerciseId);

    const swapIdx = direction === "up" ? currentIdx - 1 : currentIdx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const current = sorted[currentIdx];
    const swap = sorted[swapIdx];

    // Swap order_index values locally first
    const newOrderCurrent = swap.order_index;
    const newOrderSwap = current.order_index;

    setDays((prev) =>
      prev.map((d) => {
        if (d.id !== dayId) return d;
        return {
          ...d,
          program_exercises: d.program_exercises.map((pe) => {
            if (pe.id === current.id)
              return { ...pe, order_index: newOrderCurrent };
            if (pe.id === swap.id) return { ...pe, order_index: newOrderSwap };
            return pe;
          }),
        };
      }),
    );

    // Persist both updates to Supabase
    await Promise.all([
      supabase
        .from("program_exercises")
        .update({ order_index: newOrderCurrent })
        .eq("id", current.id),
      supabase
        .from("program_exercises")
        .update({ order_index: newOrderSwap })
        .eq("id", swap.id),
    ]);
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

          {program?.is_active ? (
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>✓ CURRENTLY ACTIVE</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.setActiveBtn}
              onPress={setActive}
              activeOpacity={0.8}
            >
              <Text style={styles.setActiveBtnText}>Set as Active</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.sectionLabel}>WEEKLY SCHEDULE</Text>

          {days.map((day) => {
            const isOpen = expandedDay === day.id;
            const isRest = day.is_rest_day;
            const exCount = day.program_exercises?.length ?? 0;
            const sorted = [...(day.program_exercises ?? [])].sort(
              (a, b) => a.order_index - b.order_index,
            );

            return (
              <View
                key={day.id}
                style={[styles.dayCard, isRest && styles.dayCardRest]}
              >
                {/* Day Header — tap to expand, long-press to toggle rest */}
                <TouchableOpacity
                  style={styles.dayHeader}
                  onPress={() => !isRest && toggleDay(day.id)}
                  onLongPress={() => toggleRestDay(day.id, isRest)}
                  delayLongPress={400}
                  activeOpacity={0.8}
                >
                  <View style={styles.dayHeaderLeft}>
                    <View
                      style={[styles.dayBadge, isRest && styles.dayBadgeRest]}
                    >
                      {isRest ? (
                        <Ionicons name="moon" size={14} color="#555" />
                      ) : (
                        <Text style={styles.dayBadgeText}>
                          {day.day_order + 1}
                        </Text>
                      )}
                    </View>
                    <View>
                      <Text
                        style={[styles.dayName, isRest && styles.dayNameRest]}
                      >
                        {day.name}
                      </Text>
                      <Text style={styles.dayMeta}>
                        {isRest
                          ? "Rest day · long-press to change"
                          : exCount === 0
                            ? "No exercises · tap to add"
                            : `${exCount} exercise${exCount !== 1 ? "s" : ""}`}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.dayHeaderRight}>
                    {/* Rest toggle pill */}
                    <TouchableOpacity
                      style={[
                        styles.restToggle,
                        isRest && styles.restToggleActive,
                      ]}
                      onPress={() => toggleRestDay(day.id, isRest)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name="moon-outline"
                        size={12}
                        color={isRest ? "#fff" : "#444"}
                      />
                    </TouchableOpacity>

                    {!isRest && (
                      <Ionicons
                        name={isOpen ? "chevron-up" : "chevron-down"}
                        size={18}
                        color="#444"
                      />
                    )}
                  </View>
                </TouchableOpacity>

                {/* Rest day visual */}
                {isRest && (
                  <View style={styles.restDayBody}>
                    <Ionicons name="moon" size={22} color="#2a2a2a" />
                    <Text style={styles.restDayText}>Rest & Recovery</Text>
                  </View>
                )}

                {/* Exercise list — only when not rest and expanded */}
                {!isRest && isOpen && (
                  <View style={styles.dayBody}>
                    {sorted.length === 0 ? (
                      <Text style={styles.emptyDayText}>
                        No exercises yet. Add some below.
                      </Text>
                    ) : (
                      sorted.map((pe, index) => (
                        <View key={pe.id} style={styles.exerciseRow}>
                          {/* Reorder arrows */}
                          <View style={styles.reorderBtns}>
                            <TouchableOpacity
                              onPress={() =>
                                handleMoveExercise(day.id, pe.id, "up")
                              }
                              disabled={index === 0}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                              <Ionicons
                                name="chevron-up"
                                size={14}
                                color={index === 0 ? "#222" : "#555"}
                              />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() =>
                                handleMoveExercise(day.id, pe.id, "down")
                              }
                              disabled={index === sorted.length - 1}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                              <Ionicons
                                name="chevron-down"
                                size={14}
                                color={
                                  index === sorted.length - 1 ? "#222" : "#555"
                                }
                              />
                            </TouchableOpacity>
                          </View>

                          <View style={styles.exerciseRowLeft}>
                            <View style={styles.exerciseDot} />
                            <Text style={styles.exerciseName}>
                              {pe.exercises?.name || "Unknown Exercise"}
                            </Text>
                          </View>

                          <TouchableOpacity
                            onPress={() => handleDeleteExercise(pe.id, day.id)}
                            hitSlop={{
                              top: 10,
                              bottom: 10,
                              left: 10,
                              right: 10,
                            }}
                            activeOpacity={0.7}
                          >
                            <Ionicons
                              name="close-circle-outline"
                              size={16}
                              color="#444"
                            />
                          </TouchableOpacity>
                        </View>
                      ))
                    )}

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
  setActiveBtn: {
    backgroundColor: "#800000",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    marginBottom: 20,
  },
  setActiveBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  activeBadge: {
    backgroundColor: "rgba(128,0,0,0.1)",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(128,0,0,0.3)",
  },
  activeBadgeText: {
    color: "#800000",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
  },
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

  // Day card
  dayCard: {
    backgroundColor: "#111",
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#1a1a1a",
    overflow: "hidden",
  },
  dayCardRest: {
    backgroundColor: "#0c0c0c",
    borderColor: "#161616",
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  dayHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  dayHeaderRight: { flexDirection: "row", alignItems: "center", gap: 10 },
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
  dayBadgeRest: {
    backgroundColor: "#1a1a1a",
    borderColor: "#222",
  },
  dayBadgeText: { color: "#800000", fontSize: 12, fontWeight: "700" },
  dayName: { color: "#fff", fontSize: 14, fontWeight: "600" },
  dayNameRest: { color: "#333" },
  dayMeta: { color: "#444", fontSize: 11, marginTop: 2 },

  // Rest toggle button
  restToggle: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#222",
    alignItems: "center",
    justifyContent: "center",
  },
  restToggleActive: {
    backgroundColor: "#2a2a2a",
    borderColor: "#333",
  },

  // Rest day body
  restDayBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
  },
  restDayText: {
    color: "#2a2a2a",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.5,
  },

  // Day body
  dayBody: {
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
    padding: 14,
    gap: 2,
  },
  emptyDayText: {
    color: "#333",
    fontSize: 12,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },

  // Exercise row
  exerciseRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
    gap: 8,
  },
  reorderBtns: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingRight: 2,
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
  exerciseSetsReps: { color: "#555", fontSize: 12, fontWeight: "600" },

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
