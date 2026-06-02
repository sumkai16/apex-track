import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
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

interface Program {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export default function ProgramsScreen() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      fetchPrograms();
    }, []),
  );

  async function fetchPrograms() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("programs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setPrograms(data);
    setLoading(false);
  }

  async function deleteProgram(id: string) {
    await supabase.from("programs").delete().eq("id", id);
    setPrograms((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>YOUR TRAINING</Text>
            <Text style={styles.title}>Programs</Text>
          </View>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push("/programs/create")}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color="#800000" style={{ marginTop: 40 }} />
        ) : programs.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="barbell-outline" size={32} color="#333" />
            </View>
            <Text style={styles.emptyTitle}>No programs yet</Text>
            <Text style={styles.emptyText}>
              Create your first training program to get started
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => router.push("/programs/create")}
              activeOpacity={0.8}
            >
              <Text style={styles.emptyButtonText}>Create Program</Text>
            </TouchableOpacity>
          </View>
        ) : (
          programs.map((program) => (
            <TouchableOpacity
              key={program.id}
              style={styles.programCard}
              onPress={() => router.push(`/programs/${program.id}`)}
              activeOpacity={0.8}
            >
              <View style={styles.cardTop}>
                {program.is_active && (
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>ACTIVE</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => deleteProgram(program.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={16} color="#444" />
                </TouchableOpacity>
              </View>
              <Text style={styles.programName}>{program.name}</Text>
              {program.description ? (
                <Text style={styles.programDesc} numberOfLines={2}>
                  {program.description}
                </Text>
              ) : null}
              <View style={styles.cardFooter}>
                <Text style={styles.cardFooterText}>VIEW PROGRAM →</Text>
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
  scroll: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 32 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 28,
  },
  eyebrow: {
    color: "#555",
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  title: { color: "#fff", fontSize: 26, fontWeight: "700" },
  addButton: {
    width: 42,
    height: 42,
    backgroundColor: "#800000",
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    alignItems: "center",
    marginTop: 60,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    backgroundColor: "#111",
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 6,
  },
  emptyText: {
    color: "#444",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: "#800000",
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 28,
  },
  emptyButtonText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  programCard: {
    backgroundColor: "#111",
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#1a1a1a",
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  activeBadge: {
    backgroundColor: "rgba(128,0,0,0.2)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "rgba(128,0,0,0.4)",
  },
  activeBadgeText: {
    color: "#800000",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
  },
  deleteBtn: {
    marginLeft: "auto",
    padding: 4,
  },
  programName: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 6,
  },
  programDesc: {
    color: "#555",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  cardFooter: { marginTop: 4 },
  cardFooterText: {
    color: "#800000",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
});
