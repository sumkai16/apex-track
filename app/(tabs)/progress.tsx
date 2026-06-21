import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { useWeightUnit } from "../../lib/WeightUnitContext";

interface ExerciseSummary {
  exercise_id: string;
  exercise_name: string;
  session_count: number;
  pr_weight: number;
}

interface SessionSummary {
  session_id: string;
  started_at: string;
  day_name: string;
  program_name: string;
}

type TabType = "exercises" | "sessions";

export default function ProgressScreen() {
  const [activeTab, setActiveTab] = useState<TabType>("exercises");

  // Exercises state
  const [exercises, setExercises] = useState<ExerciseSummary[]>([]);
  const [filtered, setFiltered] = useState<ExerciseSummary[]>([]);
  const [search, setSearch] = useState("");

  // Sessions state
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  const [loading, setLoading] = useState(true);
  const { formatWeight } = useWeightUnit();

  const requestIdRef = useRef(0);

  const fetchAll = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      await Promise.all([fetchExercises(user.id), fetchSessions(user.id)]);
    } catch (e) {
      console.error("ProgressScreen fetchAll error:", e);
    } finally {
      // Only update state for the latest request to avoid UI "glitches"
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll]),
  );

  async function fetchExercises(userId: string) {
    const { data: userSessions } = await supabase
      .from("sessions")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "completed");

    if (!userSessions || userSessions.length === 0) return;

    const sessionIds = userSessions.map((s) => s.id);

    const { data } = await supabase
      .from("session_sets")
      .select(
        `
                weight_used,
                session_id,
                program_exercises!inner (
                    exercise_id,
                    exercises!inner ( id, name )
                )
            `,
      )
      .in("session_id", sessionIds);

    if (!data) return;

    const map = new Map<string, ExerciseSummary>();
    const sessionsByExercise = new Map<string, Set<string>>();

    data.forEach((row: any) => {
      const ex = row.program_exercises?.exercises;
      if (!ex) return;

      const exId = ex.id;
      const weight = row.weight_used || 0;
      const sessionId = row.session_id;

      if (!map.has(exId)) {
        map.set(exId, {
          exercise_id: exId,
          exercise_name: ex.name,
          session_count: 0,
          pr_weight: 0,
        });
        sessionsByExercise.set(exId, new Set());
      }

      const entry = map.get(exId)!;
      if (weight > entry.pr_weight) entry.pr_weight = weight;
      if (sessionId) sessionsByExercise.get(exId)!.add(sessionId);
    });

    sessionsByExercise.forEach((sessionSet, exId) => {
      const entry = map.get(exId);
      if (entry) entry.session_count = sessionSet.size;
    });

    const result = Array.from(map.values()).sort((a, b) =>
      a.exercise_name.localeCompare(b.exercise_name),
    );

    setExercises(result);
    setFiltered(result);
  }

  async function fetchSessions(userId: string) {
    // Step 1: get completed sessions
    const { data: userSessions } = await supabase
      .from("sessions")
      .select("id, started_at, program_day_id")
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("started_at", { ascending: false });

    if (!userSessions || userSessions.length === 0) return;

    const dayIds = [
      ...new Set(userSessions.map((s) => s.program_day_id).filter(Boolean)),
    ];

    // Step 2: fetch program day names + program names
    const { data: days } = await supabase
      .from("program_days")
      .select("id, name, program_id, programs(name)")
      .in("id", dayIds);

    const dayMap = new Map<
      string,
      { day_name: string; program_name: string }
    >();
    days?.forEach((d: any) => {
      dayMap.set(d.id, {
        day_name: d.name,
        program_name: d.programs?.name ?? "Unknown Program",
      });
    });

    const result: SessionSummary[] = userSessions.map((s) => ({
      session_id: s.id,
      started_at: s.started_at,
      day_name: dayMap.get(s.program_day_id)?.day_name ?? "Unknown Day",
      program_name:
        dayMap.get(s.program_day_id)?.program_name ?? "Unknown Program",
    }));

    setSessions(result);
  }

  function handleSearch(text: string) {
    setSearch(text);
    if (!text.trim()) {
      setFiltered(exercises);
      return;
    }
    setFiltered(
      exercises.filter((e) =>
        e.exercise_name.toLowerCase().includes(text.toLowerCase()),
      ),
    );
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#800000" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.eyebrow}>YOUR LIFTS</Text>
        <Text style={styles.title}>Progress</Text>

        {/* Tab Toggle */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "exercises" && styles.tabActive]}
            onPress={() => setActiveTab("exercises")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "exercises" && styles.tabTextActive,
              ]}
            >
              Exercises
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "sessions" && styles.tabActive]}
            onPress={() => setActiveTab("sessions")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "sessions" && styles.tabTextActive,
              ]}
            >
              Sessions
            </Text>
          </TouchableOpacity>
        </View>

        {/* Exercises Tab */}
        {activeTab === "exercises" && (
          <>
            <View style={styles.searchBox}>
              <Text style={styles.searchIcon}>⌕</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search exercises..."
                placeholderTextColor="#444"
                value={search}
                onChangeText={handleSearch}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => handleSearch("")}>
                  <Text style={styles.clearBtn}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {filtered.length === 0 ? (
              <View style={styles.empty}>
                {search.trim().length > 0 ? (
                  <>
                    <Text style={styles.emptyTitle}>No results</Text>
                    <Text style={styles.emptyText}>
                      No exercises match {String(search)}.
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.emptyTitle}>No exercises yet</Text>
                    <Text style={styles.emptyText}>
                      Complete a session to see your lifts here.
                    </Text>
                  </>
                )}
              </View>
            ) : (
              filtered.map((ex) => (
                <TouchableOpacity
                  key={ex.exercise_id}
                  style={styles.card}
                  onPress={() =>
                    router.push({
                      pathname: "/exercise/[id]",
                      params: { id: ex.exercise_id },
                    })
                  }
                  activeOpacity={0.8}
                >
                  <View style={styles.cardTop}>
                    <Text style={styles.exName}>{ex.exercise_name}</Text>
                    {ex.pr_weight > 0 && (
                      <View style={styles.prBadge}>
                        <Text style={styles.prText}>
                          PR {formatWeight(ex.pr_weight)}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.sessionCount}>
                    {ex.session_count}{" "}
                    {ex.session_count === 1 ? "session" : "sessions"} logged
                  </Text>
                  <Text style={styles.arrow}>›</Text>
                </TouchableOpacity>
              ))
            )}
          </>
        )}

        {/* Sessions Tab */}
        {activeTab === "sessions" && (
          <>
            {sessions.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>No sessions yet</Text>
                <Text style={styles.emptyText}>
                  Complete a session to see your history here.
                </Text>
              </View>
            ) : (
              sessions.map((s) => (
                <TouchableOpacity
                  key={s.session_id}
                  style={styles.card}
                  onPress={() =>
                    router.push({
                      pathname: "/session-detail/[id]",
                      params: { id: s.session_id },
                    })
                  }
                  activeOpacity={0.8}
                >
                  <View style={styles.cardTop}>
                    <Text style={styles.exName}>{s.day_name}</Text>
                    <Text style={styles.sessionDate}>
                      {formatDate(s.started_at)}
                    </Text>
                  </View>
                  <Text style={styles.sessionCount}>{s.program_name}</Text>
                  <Text style={styles.arrow}>›</Text>
                </TouchableOpacity>
              ))
            )}
          </>
        )}
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
  },
  scroll: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 32 },
  eyebrow: {
    color: "#555",
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  title: { color: "#fff", fontSize: 26, fontWeight: "700", marginBottom: 20 },

  tabRow: {
    flexDirection: "row",
    backgroundColor: "#111",
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#1a1a1a",
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 9,
  },
  tabActive: { backgroundColor: "#800000" },
  tabText: { color: "#555", fontSize: 13, fontWeight: "600" },
  tabTextActive: { color: "#fff" },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111",
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#1a1a1a",
  },
  searchIcon: { color: "#444", fontSize: 18, marginRight: 8 },
  searchInput: { flex: 1, color: "#fff", fontSize: 14, paddingVertical: 13 },
  clearBtn: { color: "#444", fontSize: 13, paddingLeft: 8 },

  card: {
    backgroundColor: "#111",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#1a1a1a",
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  exName: { color: "#fff", fontSize: 16, fontWeight: "700", flex: 1 },
  prBadge: {
    backgroundColor: "rgba(128,0,0,0.15)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(128,0,0,0.3)",
  },
  prText: { color: "#800000", fontSize: 10, fontWeight: "700" },
  sessionCount: { color: "#555", fontSize: 12 },
  sessionDate: { color: "#555", fontSize: 12 },
  arrow: {
    color: "#800000",
    fontSize: 20,
    position: "absolute",
    right: 16,
    top: "70%",
  },

  empty: { alignItems: "center", marginTop: 60 },
  emptyTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 8,
  },
  emptyText: { color: "#444", fontSize: 13, textAlign: "center" },
});
