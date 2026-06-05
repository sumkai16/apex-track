import { LinearGradient } from "expo-linear-gradient"; // Added for premium dark-crimson styling
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";

interface RecentSession {
  id: string;
  program_day_id: string;
  started_at: string;
  status: string;
  program_days: { name: string }[] | null;
}

interface GridDay {
  dayNum: number | null;
  dateString: string | null;
  isToday: boolean;
}

export default function HomeScreen() {
  const [displayName, setDisplayName] = useState("");
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [monthDays, setMonthDays] = useState<GridDay[]>([]);
  const [completedDates, setCompletedDates] = useState<string[]>([]);
  const [currentMonthName, setCurrentMonthName] = useState("");
  const [sessionsThisMonthCount, setSessionsThisMonthCount] = useState(0);
  const [hasActiveProgram, setHasActiveProgram] = useState(false);

  useEffect(() => {
    fetchProfile();
    fetchRecentSessions();
    generateCurrentMonthGrid();
  }, []);

  async function fetchProfile() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();
    if (data) setDisplayName(data.display_name);
    const { data: activeProgram } = await supabase
      .from('programs')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    setHasActiveProgram(!!activeProgram);
  }

  async function fetchRecentSessions() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("sessions")
      .select("id, program_day_id, started_at, status, program_days(name)")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .order("started_at", { ascending: false });

    if (data) {
      setRecentSessions(data.slice(0, 3) as unknown as RecentSession[]);

      const dates = data.map(
        (s) => new Date(s.started_at).toISOString().split("T")[0],
      );
      setCompletedDates(dates);

      const currentYearMonth = new Date().toISOString().slice(0, 7);
      const currentMonthSessions = dates.filter((d) =>
        d.startsWith(currentYearMonth),
      );
      setSessionsThisMonthCount(currentMonthSessions.length);
    }
  }

  function generateCurrentMonthGrid() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    const monthNames = [
      "JANUARY",
      "FEBRUARY",
      "MARCH",
      "APRIL",
      "MAY",
      "JUNE",
      "JULY",
      "AUGUST",
      "SEPTEMBER",
      "OCTOBER",
      "NOVEMBER",
      "DECEMBER",
    ];
    setCurrentMonthName(monthNames[month]);

    const firstDayOfMonth = new Date(year, month, 1);
    let startDayIndex = firstDayOfMonth.getDay();
    startDayIndex = startDayIndex === 0 ? 6 : startDayIndex - 1;

    const totalDays = new Date(year, month + 1, 0).getDate();
    const gridDays: GridDay[] = [];

    for (let i = 0; i < startDayIndex; i++) {
      gridDays.push({ dayNum: null, dateString: null, isToday: false });
    }

    for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
      const dateObj = new Date(year, month, dayNum);
      const yyyy = dateObj.getFullYear();
      const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
      const dd = String(dateObj.getDate()).padStart(2, "0");
      const dateString = `${yyyy}-${mm}-${dd}`;

      const isToday = new Date().toDateString() === dateObj.toDateString();

      gridDays.push({ dayNum, dateString, isToday });
    }

    setMonthDays(gridDays);
  }

  function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return `${diff} days ago`;
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Dynamic Crimson Ambient Background Glow */}
      <LinearGradient
        colors={["rgba(128, 0, 0, 0.22)", "rgba(15, 5, 5, 0.4)", "#050505"]}
        locations={[0.0, 0.4, 0.7]}
        style={styles.absoluteGradient}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Modern Profile Header */}
        <View style={styles.header}>
          <View>
            <View style={styles.greetingBadge}>
              <Text style={styles.greeting}>{getGreeting()}</Text>
            </View>
            <Text style={styles.name}>{displayName || "Athlete"} 👊</Text>
          </View>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <Text style={styles.settingsIcon}>⚙</Text>
          </TouchableOpacity>
        </View>

        {/* Premium Hero Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroContent}>
            <Text style={styles.heroLabel}>TODAY'S WORKOUT</Text>
            <Text style={styles.heroTitle}>
              {hasActiveProgram ? 'Ready to train?' : 'No program set'}
            </Text>
            <Text style={styles.heroSub}>
              {hasActiveProgram
                ? 'Tap to start your daily session'
                : 'Set up a program to start tracking'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.startButton}
            onPress={() => router.push(hasActiveProgram ? '/(tabs)/log' : '/(tabs)/programs')}
            activeOpacity={0.8}
          >
            <Text style={styles.startText}>
              {hasActiveProgram ? 'Start Session' : 'Set up Program'}
            </Text>
            <View style={styles.startIconCircle}>
              <Text style={styles.startIcon}>▶</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Grid Month Calendar Section */}
        <Text style={styles.sectionTitle}>THIS MONTH - {currentMonthName}</Text>
        <View style={styles.calendarCard}>
          <View style={styles.weekLabelsRow}>
            {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
              <Text key={index} style={styles.weekLabel}>
                {day}
              </Text>
            ))}
          </View>

          <View style={styles.daysGrid}>
            {monthDays.map((day, index) => {
              const isTrained = day.dateString
                ? completedDates.includes(day.dateString)
                : false;

              if (day.dayNum === null) {
                return (
                  <View key={`empty-${index}`} style={styles.gridDayBoxEmpty} />
                );
              }

              return (
                <View
                  key={`day-${day.dayNum}`}
                  style={[
                    styles.gridDayBox,
                    isTrained && styles.trainedDayBox,
                    day.isToday && !isTrained && styles.todayBorderBox,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayBoxText,
                      isTrained && styles.trainedDayBoxText,
                      day.isToday && styles.todayText,
                    ]}
                  >
                    {day.dayNum}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={styles.calendarFooter}>
            <View style={styles.legendRow}>
              <View style={styles.legendSquare} />
              <Text style={styles.legendText}>Trained</Text>
            </View>
            <Text style={styles.footerCountText}>
              {sessionsThisMonthCount} session
              {sessionsThisMonthCount !== 1 ? "s" : ""} this month
            </Text>
          </View>
        </View>

        {/* Recent Sessions List */}
        <Text style={styles.sectionTitle}>RECENT SESSIONS</Text>

        {recentSessions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              No sessions yet. Start your first workout!
            </Text>
          </View>
        ) : (
          recentSessions.map((session) => (
            <View key={session.id} style={styles.sessionCard}>
              <View style={styles.sessionRow}>
                <Text style={styles.sessionName}>
                  {session.program_days?.[0]?.name || "Workout"}
                </Text>
                <Text style={styles.sessionDate}>
                  {formatDate(session.started_at)}
                </Text>
              </View>
              <View style={styles.sessionMeta}>
                <Text style={styles.sessionCheck}>✓</Text>
                <Text style={styles.sessionInfo}>Completed</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050505" },
  absoluteGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 480, // Fades perfectly before hitting content-heavy bottom panels
  },
  scroll: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 24 },

  // Header Component Styling
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 28,
  },
  greetingBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  greeting: {
    color: "#aaa",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  name: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  settingsButton: {
    width: 40,
    height: 40,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  settingsIcon: { color: "#b30000", fontSize: 18 },

  // Crimson Modernized Hero Card
  heroCard: {
    backgroundColor: "#800000",
    borderRadius: 20,
    padding: 24,
    marginBottom: 28,
    shadowColor: "#800000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8,
  },
  heroContent: {
    marginBottom: 20,
  },
  heroLabel: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  heroTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  heroSub: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 13,
    fontWeight: "500",
  },
  startButton: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  startText: {
    color: "#000",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  startIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 2,
  },
  startIcon: {
    color: "#fff",
    fontSize: 10,
  },

  sectionTitle: {
    color: "#666",
    fontSize: 11,
    letterSpacing: 1.2,
    marginBottom: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },

  // Calendar Components Setup
  calendarCard: {
    backgroundColor: "rgba(18, 18, 18, 0.6)",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.04)",
    marginBottom: 24,
  },
  weekLabelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  weekLabel: {
    color: "#444",
    fontSize: 11,
    fontWeight: "600",
    width: 34,
    textAlign: "center",
  },
  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
  },
  gridDayBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.03)",
  },
  gridDayBoxEmpty: {
    width: 34,
    height: 34,
    backgroundColor: "transparent",
  },
  trainedDayBox: {
    backgroundColor: "#800000",
    borderColor: "#a30000",
  },
  todayBorderBox: {
    borderColor: "rgba(128,0,0,0.8)",
    backgroundColor: "rgba(128,0,0,0.15)",
  },
  dayBoxText: {
    color: "#555",
    fontSize: 12,
    fontWeight: "600",
  },
  trainedDayBoxText: {
    color: "#fff",
    fontWeight: "700",
  },
  todayText: {
    color: "#fff",
  },
  calendarFooter: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.04)",
    gap: 16,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendSquare: {
    width: 10,
    height: 10,
    borderRadius: 3,
    backgroundColor: "#800000",
  },
  legendText: {
    color: "#555",
    fontSize: 11,
    fontWeight: "500",
  },
  footerCountText: {
    color: "#555",
    fontSize: 11,
    fontWeight: "500",
    flex: 1,
    textAlign: "left",
  },

  // Info Logs Elements
  emptyCard: {
    backgroundColor: "rgba(18, 18, 18, 0.4)",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.03)",
  },
  emptyText: { color: "#444", fontSize: 13, textAlign: "center" },
  sessionCard: {
    backgroundColor: "rgba(18, 18, 18, 0.4)",
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.03)",
  },
  sessionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sessionName: { color: "#fff", fontSize: 14, fontWeight: "600" },
  sessionDate: { color: "#666", fontSize: 11 },
  sessionMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  sessionCheck: { color: "#800000", fontSize: 11 },
  sessionInfo: { color: "#666", fontSize: 12 },
});
