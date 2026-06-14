import { LinearGradient } from "expo-linear-gradient";
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
  id: string
  program_day_id: string
  started_at: string
  status: string
  program_days: {
    name: string
    programs: {
      name: string
    } | null
  } | null
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
  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);

  useEffect(() => {
    fetchProfile();
    fetchRecentSessions();
    generateCurrentMonthGrid();
  }, []);
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

    while (gridDays.length % 7 !== 0) {
      gridDays.push({ dayNum: null, dateString: null, isToday: false });
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

  async function fetchProfile() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      setDisplayName(data?.display_name ?? "");
    } catch (err) {
      console.log("fetchProfile error:", err);
    }
  }

  async function fetchRecentSessions() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("sessions")
        .select("id, program_day_id, started_at, status, program_days(name, programs(name))")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
        .limit(6);

      if (error) throw error;
      setRecentSessions((data as unknown as RecentSession[]) || []);

      const monthsCount = (data || []).filter((s: any) => {
        const d = new Date(s.started_at);
        const now = new Date();
        return (
          d.getMonth() === now.getMonth() &&
          d.getFullYear() === now.getFullYear()
        );
      }).length;
      setSessionsThisMonthCount(monthsCount);

      const dates = (data || [])
        .map((s: any) => s.started_at?.split("T")[0])
        .filter(Boolean);
      setCompletedDates(dates as string[]);
    } catch (err) {
      console.log("fetchRecentSessions error:", err);
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Dynamic Crimson Ambient Background Glow */}
      <LinearGradient
        colors={["rgba(140, 0, 0, 0.24)", "rgba(15, 5, 5, 0.5)", "#050505"]}
        locations={[0.0, 0.35, 0.75]}
        style={styles.absoluteGradient}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Modern Profile Header with Absolute Centered App Branding */}
        <View style={styles.headerContainer}>
          {/* Left Block: Profile Info */}
          <View style={styles.leftHeaderBlock}>
            <View style={styles.greetingBadge}>
              <Text style={styles.greeting}>{getGreeting()}</Text>
            </View>
            <View style={styles.nameContainer}>
              <Text style={styles.name}>{displayName || "Athlete"}</Text>
              <Text style={styles.nameAccent}> </Text>
            </View>
          </View>

          {/* Absolute Center Block: APEX TRACK Branded Gradient Badge */}
          <View style={styles.absoluteCenterContainer} pointerEvents="none">
            <LinearGradient
              colors={["rgba(20, 20, 20, 0.85)", "rgba(179, 0, 0, 0.15)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.brandGradientBadge}
            >
              <Text style={styles.brandTextPrimary}>
                APEX <Text style={styles.brandTextSecondary}>TRACK</Text>
              </Text>
            </LinearGradient>
          </View>

          {/* Right Block: Dedicated Logout Action Button (Replaced image_68a29e.png) */}
          <View style={styles.rightHeaderBlock}>
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
              activeOpacity={0.7}
            >
              <Text style={styles.logoutIcon}>➔</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Professional Hero Card */}
        <View style={styles.heroContainer}>
          <LinearGradient
            colors={[
              "rgba(163, 0, 0, 0.18)",
              "rgba(13, 13, 13, 0.5)",
              "#0d0d0d",
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradientStyle}
          />
          <View style={styles.heroInnerRow}>
            <View style={styles.heroTextLayout}>
              <Text style={styles.heroLabelText}>PERFORMANCE BRIEF</Text>
              <Text style={styles.heroTitleText}>CHASE THE APEX</Text>
              <Text style={styles.heroSubText}>
                Execute your scheduled session
              </Text>
            </View>

            <TouchableOpacity
              style={styles.modernActionPill}
              onPress={() => router.push("/(tabs)/log")}
              activeOpacity={0.85}
            >
              <Text style={styles.modernActionText}>Start</Text>
              <View style={styles.modernActionCircle}>
                <Text style={styles.modernActionArrow}>▶</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Calendar Section */}
        <Text style={styles.sectionTitle}>THIS MONTH — {currentMonthName}</Text>
        <View style={styles.calendarCardContainer}>
          <LinearGradient
            colors={[
              "rgba(128, 0, 0, 0.12)",
              "rgba(13, 13, 13, 0.3)",
              "#0a0a0a",
            ]}
            locations={[0.0, 0.5, 1.0]}
            style={styles.calendarCardGradient}
          />
          <View style={styles.calendarInnerContent}>
            {/* Weekday Labels Row */}
            <View style={styles.weekLabelsRow}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                (day, index) => (
                  <View key={index} style={styles.gridCellWrapper}>
                    <Text style={styles.weekLabel}>{day}</Text>
                  </View>
                ),
              )}
            </View>

            {/* 7-Column Days Matrix Layout */}
            <View style={styles.daysGrid}>
              {monthDays.map((day, index) => {
                const isTrained = day.dateString
                  ? completedDates.includes(day.dateString)
                  : false;

                return (
                  <View key={index} style={styles.gridCellWrapper}>
                    {day.dayNum !== null ? (
                      <View
                        style={[
                          styles.gridDayBox,
                          day.isToday && styles.todayActiveBox,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayBoxText,
                            day.isToday && styles.todayActiveText,
                          ]}
                        >
                          {day.dayNum}
                        </Text>

                        {/* Premium Dot Indicator */}
                        {isTrained && (
                          <View
                            style={[
                              styles.trainedIndicatorDot,
                              day.isToday && styles.trainedIndicatorDotToday,
                            ]}
                          />
                        )}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>

            {/* Calendar Footer */}
            <View style={styles.calendarFooter}>
              <View style={styles.legendRow}>
                <View style={styles.legendCircle} />
                <Text style={styles.legendText}>Trained Session</Text>
              </View>
              <Text style={styles.footerCountText}>
                {sessionsThisMonthCount} completion
                {sessionsThisMonthCount !== 1 ? "s" : ""}
              </Text>
            </View>
          </View>
        </View>
        {/* Recent Sessions List */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>RECENT SESSIONS</Text>
          {recentSessions.length > 0 && (
            <TouchableOpacity onPress={() => router.push('/(tabs)/progress?tab=sessions')}>
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
          )}
        </View>

        {recentSessions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              No sessions yet. Start your first workout!
            </Text>
          </View>
        ) : (
          recentSessions.slice(0, 5).map((session) => (
            <TouchableOpacity
              key={session.id}
              style={styles.sessionCard}
              activeOpacity={0.8}
              onPress={() => router.push({ pathname: '/session-detail/[id]', params: { id: session.id } })}
            >
              <View style={styles.sessionRow}>
                <Text style={styles.sessionName}>
                  {session.program_days?.programs?.name
                    ? `${session.program_days.programs.name} — ${session.program_days.name}`
                    : session.program_days?.name || "Workout"}
                </Text>
                <Text style={styles.sessionDate}>{formatDate(session.started_at)}</Text>
              </View>
              <View style={styles.sessionMeta}>
                <View style={styles.statusBadge}>
                  <Text style={styles.sessionCheck}>✓</Text>
                  <Text style={styles.sessionInfo}>COMPLETED</Text>
                </View>
              </View>
            </TouchableOpacity>
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
    height: 520,
  },
  scroll: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 24 },
  seeAllBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1a1a1a',
    marginTop: 4,
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  seeAllText: { color: '#800000', fontSize: 12, fontWeight: '600' },
  // Precise Grid Row System for Header Elements
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 28,
    width: "100%",
    position: "relative",
    height: 56,
  },
  leftHeaderBlock: {
    flexDirection: "column",
    justifyContent: "center",
    zIndex: 2,
  },
  rightHeaderBlock: {
    zIndex: 2,
  },
  greetingBadge: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  greeting: {
    color: "#666",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  nameContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  name: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  nameAccent: {
    color: "#b30000",
    fontSize: 18,
    fontWeight: "900",
  },

  // Absolute Centering Layout Layer for App Identity Branding
  absoluteCenterContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  brandGradientBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(179, 0, 0, 0.25)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  brandTextPrimary: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 2.0,
    textTransform: "uppercase",
  },
  brandTextSecondary: {
    color: "#e60000",
    fontWeight: "900",
  },

  // Semantic Logout Action Button (Replaced style template from image_68a29e.png)
  logoutButton: {
    width: 42,
    height: 42,
    backgroundColor: "rgba(179, 0, 0, 0.03)",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(179, 0, 0, 0.15)",
  },
  logoutIcon: {
    color: "#e60000",
    fontSize: 15,
    fontWeight: "900",
  },

  // Hero Card
  heroContainer: {
    backgroundColor: "#0d0d0d",
    borderRadius: 20,
    marginBottom: 32,
    overflow: "hidden",
    position: "relative",
    borderWidth: 1,
    borderColor: "#1a1a1a",
  },
  heroGradientStyle: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  heroInnerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  heroTextLayout: {
    flex: 1,
    marginRight: 16,
  },
  heroLabelText: {
    color: "#b30000",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  heroTitleText: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  heroSubText: {
    color: "#888",
    fontSize: 13,
    fontWeight: "500",
  },
  modernActionPill: {
    backgroundColor: "#fff",
    paddingVertical: 10,
    paddingLeft: 18,
    paddingRight: 10,
    borderRadius: 100,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  modernActionText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "700",
  },
  modernActionCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 2,
  },
  modernActionArrow: {
    color: "#fff",
    fontSize: 9,
  },

  sectionTitle: {
    color: "#444",
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: 14,
    fontWeight: "700",
  },

  // Calendar Components
  calendarCardContainer: {
    backgroundColor: "#080808",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#141414",
    marginBottom: 32,
    overflow: "hidden",
  },
  calendarCardGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  calendarInnerContent: {
    padding: 16,
  },
  weekLabelsRow: {
    flexDirection: "row",
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#141414",
    paddingBottom: 10,
  },
  gridCellWrapper: {
    width: "14.28%",
    alignItems: "center",
    justifyContent: "center",
  },
  weekLabel: {
    color: "#444",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 10,
  },
  gridDayBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.01)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.02)",
  },
  todayActiveBox: {
    backgroundColor: "#800000",
    borderColor: "#b30000",
  },
  dayBoxText: {
    color: "#777",
    fontSize: 12,
    fontWeight: "600",
  },
  todayActiveText: {
    color: "#fff",
    fontWeight: "800",
  },
  trainedIndicatorDot: {
    position: "absolute",
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#b30000",
  },
  trainedIndicatorDotToday: {
    backgroundColor: "#fff",
  },
  calendarFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#141414",
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendCircle: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#b30000",
  },
  legendText: {
    color: "#444",
    fontSize: 11,
    fontWeight: "600",
  },
  footerCountText: {
    color: "#555",
    fontSize: 11,
    fontWeight: "600",
  },

  // Log Cards List
  emptyCard: {
    backgroundColor: "#0d0d0d",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#161616",
  },
  emptyText: { color: "#444", fontSize: 13 },
  sessionCard: {
    backgroundColor: "#0d0d0d",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#161616",
  },
  sessionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sessionName: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  sessionDate: { color: "#555", fontSize: 11, fontWeight: "500" },
  sessionMeta: { flexDirection: "row", alignItems: "center" },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(179, 0, 0, 0.06)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 5,
    borderWidth: 1,
    borderColor: "rgba(179, 0, 0, 0.15)",
  },
  sessionCheck: { color: "#b30000", fontSize: 10, fontWeight: "900" },
  sessionInfo: {
    color: "#b30000",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  templateCard: {
    backgroundColor: "#0d0d0d",
    borderRadius: 16,
    padding: 12,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#141414",
    overflow: "hidden",
  },
  templateGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 16,
  },
  templateInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  templateLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  templateIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#800000",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(179,0,0,0.15)",
  },
  templateTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  templateSubtitle: {
    color: "#aaa",
    fontSize: 12,
    marginTop: 2,
  },
  templateButton: {
    backgroundColor: "#b30000",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginLeft: 12,
    minWidth: 92,
    alignItems: "center",
    justifyContent: "center",
  },
  templateButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    backgroundColor: "#0d0d0d",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#141414",
  },
  modalTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  modalSubtitle: { color: "#aaa", marginTop: 6, fontSize: 13 },
  modalDayRow: {
    flexDirection: "row",
    marginTop: 10,
    alignItems: "flex-start",
  },
  modalDayTitle: { color: "#b30000", fontWeight: "800", width: 84 },
  modalExerciseText: { color: "#ddd", fontSize: 13, marginBottom: 4 },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 14,
  },
});
