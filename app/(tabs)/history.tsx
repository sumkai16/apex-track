import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";

interface SessionItem {
  id: string;
  started_at: string;
  status: string;
  program_days: { name: string }[] | null;
}

export default function HistoryScreen() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllSessions();
  }, []);

  async function fetchAllSessions() {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("sessions")
        .select("id, started_at, status, program_days(name)")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      setSessions((data as SessionItem[]) || []);
    } catch (err) {
      console.log("fetchAllSessions error:", err);
      Alert.alert("Error", "Could not load session history.");
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleString();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Session History</Text>
      <ScrollView contentContainerStyle={styles.list}>
        {sessions.length === 0 && !loading ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No past sessions found.</Text>
          </View>
        ) : (
          sessions.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={styles.item}
              onPress={() => router.push(`/session/${s.id}`)}
              activeOpacity={0.8}
            >
              <View style={styles.itemRow}>
                <Text style={styles.itemTitle}>
                  {s.program_days?.[0]?.name ?? "Workout"}
                </Text>
                <Text style={styles.itemDate}>{formatDate(s.started_at)}</Text>
              </View>
              <Text style={styles.itemStatus}>
                {s.status?.toUpperCase() ?? ""}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#050505" },
  title: { color: "#fff", fontSize: 20, fontWeight: "800", marginBottom: 12 },
  list: { paddingBottom: 40 },
  emptyCard: {
    backgroundColor: "#0d0d0d",
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: "#141414",
    alignItems: "center",
  },
  emptyText: { color: "#888" },
  item: {
    backgroundColor: "#0d0d0d",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#141414",
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  itemTitle: { color: "#fff", fontWeight: "800" },
  itemDate: { color: "#999", fontSize: 12 },
  itemStatus: { color: "#b30000", fontWeight: "700", fontSize: 12 },
});
