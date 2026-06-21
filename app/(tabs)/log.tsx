import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";
interface Program {
  id: string;
  name: string;
  description: string;
}

interface ProgramDay {
  id: string;
  name: string;
  day_order: number;
  program_id: string;
  exercise_count: number;
}

export default function LogScreen() {
  const [program, setProgram] = useState<Program | null>(null);
  const [days, setDays] = useState<ProgramDay[]>([]);
  const [suggestedDayId, setSuggestedDayId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      fetchActiveProgram();
    }, []),
  );

  async function fetchActiveProgram() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: programData } = await supabase
      .from("programs")
      .select("id, name, description")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (!programData) {
      setLoading(false);
      return;
    }

    setProgram(programData);

    const { data: daysData } = await supabase
      .from("program_days")
      .select("id, name, day_order, program_id")
      .eq("program_id", programData.id)
      .order("day_order");

    if (!daysData) {
      setLoading(false);
      return;
    }

    const daysWithCount = await Promise.all(
      daysData.map(async (day) => {
        const { count } = await supabase
          .from("program_exercises")
          .select("id", { count: "exact", head: true })
          .eq("program_day_id", day.id);
        return { ...day, exercise_count: count || 0 };
      }),
    );

    setDays(daysWithCount);
    await resolveSuggestedDay(programData.id, daysData);
    setLoading(false);
  }

  async function resolveSuggestedDay(
    programId: string,
    daysData: { id: string; day_order: number }[],
  ) {
    const { data: lastSession } = await supabase
      .from("sessions")
      .select("program_day_id")
      .eq("program_id", programId)
      .eq("status", "completed")
      .order("started_at", { ascending: false })
      .limit(1)
      .single();

    if (!lastSession) {
      // No history — suggest day 1
      setSuggestedDayId(daysData[0]?.id || null);
      return;
    }

    const lastDayIndex = daysData.findIndex(
      (d) => d.id === lastSession.program_day_id,
    );
    const nextIndex = (lastDayIndex + 1) % daysData.length; // wraps to 0 if at end
    setSuggestedDayId(daysData[nextIndex].id);
  }

  async function startSession(day: ProgramDay) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !program) return;

    const { data: existing, error: existingError } = await supabase
      .from("sessions")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "in_progress")
      .maybeSingle();

    if (existingError) {
      Alert.alert(
        "Error",
        existingError.message || "Could not check existing session.",
      );
      return;
    }

    if (existing?.id) {
      Alert.alert(
        "Session in progress",
        "You have an unfinished session. Resume it?",
        [
          {
            text: "Resume",
            onPress: () => router.push(`/session/${existing.id}`),
          },
          { text: "Cancel", style: "cancel" },
        ],
      );
      return;
    }

    const { data: session, error } = await supabase
      .from("sessions")
      .insert({
        user_id: user.id,
        program_id: program.id,
        program_day_id: day.id,
        status: "in_progress",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !session?.id) {
      Alert.alert(
        "Error",
        `Could not start session: ${error?.message || "Unknown error"}`,
      );
      return;
    }

    router.push(`/session/${session.id}`);
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!program) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyIcon}>🏋️</Text>
        <Text style={styles.emptyTitle}>No active program</Text>
        <Text style={styles.emptyText}>
          Set a program as active to start logging sessions.
        </Text>
        <TouchableOpacity
          style={styles.emptyBtn}
          onPress={() => router.push("/(tabs)/programs")}
          activeOpacity={0.8}
        >
          <Text style={styles.emptyBtnText}>Go to Programs</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.label}>START SESSION</Text>
        <Text style={styles.title}>Choose day</Text>
        <Text style={styles.sub}>{program.name}</Text>

        {days.map((day) => {
          const isSuggested = day.id === suggestedDayId;
          return (
            <TouchableOpacity
              key={day.id}
              style={[styles.card, isSuggested && styles.cardSuggested]}
              onPress={() => startSession(day)}
              activeOpacity={0.8}
            >
              <View style={styles.cardContent}>
                <View>
                  <View style={styles.nameRow}>
                    <Text style={styles.dayName}>{day.name}</Text>
                    {isSuggested && (
                      <View style={styles.suggBadge}>
                        <Text style={styles.suggBadgeText}>NEXT UP</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.dayMeta}>
                    {day.exercise_count} exercises
                  </Text>
                </View>
                <Text style={styles.arrow}>›</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050505" },
  centered: {
    flex: 1,
    backgroundColor: "#050505",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  scroll: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 24 },
  label: {
    color: "#555",
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  title: { color: "#fff", fontSize: 24, fontWeight: "700", marginBottom: 4 },
  sub: { color: "#555", fontSize: 13, marginBottom: 28 },
  card: { backgroundColor: "#111", borderRadius: 12, marginBottom: 10 },
  cardSuggested: { borderWidth: 1, borderColor: "#800000" },
  cardContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  dayName: { color: "#fff", fontSize: 16, fontWeight: "600" },
  suggBadge: {
    backgroundColor: "rgba(128,0,0,0.2)",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "rgba(128,0,0,0.4)",
  },
  suggBadgeText: {
    color: "#800000",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
  },
  dayMeta: { color: "#555", fontSize: 12 },
  arrow: { color: "#800000", fontSize: 20 },
  loadingText: { color: "#555", fontSize: 14 },
  emptyTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptyText: { color: "#555", fontSize: 13, textAlign: "center" },
  emptyIcon: { fontSize: 40, marginBottom: 16 },
  emptyBtn: {
    marginTop: 20,
    backgroundColor: "#800000",
    paddingVertical: 13,
    paddingHorizontal: 32,
    borderRadius: 10,
  },
  emptyBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
