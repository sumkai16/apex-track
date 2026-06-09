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
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface Program {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  day_count: number;
  exercise_count: number;
}

type VolumeFilterType = "ALL" | "LIGHTWEIGHT" | "MODERATE" | "HIGH_VOLUME";

export default function ProgramsScreen() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);

  // Search, Sort, and Volume Filter Tracking matrix
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnlyActive, setShowOnlyActive] = useState(false);
  const [sortNewestFirst, setSortNewestFirst] = useState(true);
  const [volumeFilter, setVolumeFilter] = useState<VolumeFilterType>("ALL");

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

    const { data, error } = await supabase
      .from("programs")
      .select(
        `
        id, name, description, is_active, created_at,
        program_days (
          id,
          program_exercises (id)
        )
      `,
      )
      .eq("user_id", user.id);

    if (error) {
      console.error("Error pulling program schema metrics:", error);
      setLoading(false);
      return;
    }

    if (data) {
      const localizedStats: Program[] = data.map((p: any) => {
        const days = p.program_days || [];
        const totalExercises = days.reduce(
          (acc: number, d: any) => acc + (d.program_exercises?.length || 0),
          0,
        );

        return {
          id: p.id,
          name: p.name,
          description: p.description,
          is_active: p.is_active,
          created_at: p.created_at,
          day_count: days.length,
          exercise_count: totalExercises,
        };
      });

      setPrograms(localizedStats);
    }
    setLoading(false);
  }

  async function deleteProgram(id: string) {
    await supabase.from("programs").delete().eq("id", id);
    setPrograms((prev) => prev.filter((p) => p.id !== id));
  }

  // Combined Filtering and Sorting processing block
  const processedPrograms = programs
    .filter((program) => {
      const matchesSearch =
        program.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (program.description &&
          program.description
            .toLowerCase()
            .includes(searchQuery.toLowerCase()));

      const matchesActiveFilter = !showOnlyActive || program.is_active;

      // Weekly Exercise Load Filter Logic
      let matchesVolume = true;
      if (volumeFilter === "LIGHTWEIGHT") {
        matchesVolume = program.exercise_count < 10;
      } else if (volumeFilter === "MODERATE") {
        matchesVolume =
          program.exercise_count >= 10 && program.exercise_count < 20;
      } else if (volumeFilter === "HIGH_VOLUME") {
        matchesVolume = program.exercise_count >= 20;
      }

      return matchesSearch && matchesActiveFilter && matchesVolume;
    })
    .sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortNewestFirst ? dateB - dateA : dateA - dateB;
    });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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

        {/* Search & Filter Controls Panel Layout Block */}
        {programs.length > 0 && (
          <View style={styles.filterSection}>
            <View style={styles.filterContainer}>
              <View style={styles.searchBarContainer}>
                <Ionicons
                  name="search-outline"
                  size={18}
                  color="#555"
                  style={styles.searchIcon}
                />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search programs..."
                  placeholderTextColor="#555"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCorrect={false}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setSearchQuery("")}
                    style={styles.clearButton}
                  >
                    <Ionicons name="close-circle" size={16} color="#555" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Dynamic Creation Date Flip Arrow Toggle */}
              <TouchableOpacity
                style={[
                  styles.sortButton,
                  !sortNewestFirst && styles.filterPillActive,
                ]}
                onPress={() => setSortNewestFirst(!sortNewestFirst)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={
                    sortNewestFirst
                      ? "trending-down-outline"
                      : "trending-up-outline"
                  }
                  size={18}
                  color={sortNewestFirst ? "#555" : "#800000"}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.filterPill,
                  showOnlyActive && styles.filterPillActive,
                ]}
                onPress={() => setShowOnlyActive(!showOnlyActive)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    showOnlyActive && styles.filterPillTextActive,
                  ]}
                >
                  Active
                </Text>
              </TouchableOpacity>
            </View>

            {/* Quick Exercise Volume Filter Matrix */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.volumeScrollTrack}
            >
              {(
                [
                  { id: "ALL", label: "All Layouts" },
                  { id: "LIGHTWEIGHT", label: "Lightweight (<10 Ex.)" },
                  { id: "MODERATE", label: "Moderate (10-20 Ex.)" },
                  { id: "HIGH_VOLUME", label: "High Volume (20+ Ex.)" },
                ] as const
              ).map((chip) => {
                const isSelected = volumeFilter === chip.id;
                return (
                  <TouchableOpacity
                    key={chip.id}
                    style={[
                      styles.volumeChip,
                      isSelected && styles.volumeChipActive,
                    ]}
                    onPress={() => setVolumeFilter(chip.id)}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.volumeChipText,
                        isSelected && styles.volumeChipTextActive,
                      ]}
                    >
                      {chip.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

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
        ) : processedPrograms.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="filter-outline" size={32} color="#333" />
            </View>
            <Text style={styles.emptyTitle}>No matching templates</Text>
            <Text style={styles.emptyText}>
              We couldn't track down any programs matching your dynamic volume
              or search bounds.
            </Text>
            <TouchableOpacity
              onPress={() => {
                setSearchQuery("");
                setShowOnlyActive(false);
                setVolumeFilter("ALL");
              }}
              style={{ marginTop: 8 }}
            >
              <Text
                style={{ color: "#800000", fontSize: 13, fontWeight: "600" }}
              >
                Reset All Filters
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          processedPrograms.map((program) => (
            <TouchableOpacity
              key={program.id}
              style={styles.programCard}
              onPress={() => router.push(`/programs/${program.id}`)}
              activeOpacity={0.8}
            >
              <View style={styles.cardTop}>
                <View style={styles.badgeCluster}>
                  {program.is_active && (
                    <View style={styles.activeBadge}>
                      <Text style={styles.activeBadgeText}>ACTIVE</Text>
                    </View>
                  )}

                  {/* Keep metadata context intact */}
                  <View style={styles.metaBadge}>
                    <Text style={styles.metaBadgeText}>7 DAYS</Text>
                  </View>
                  <View style={styles.metaBadge}>
                    <Text style={styles.metaBadgeText}>
                      {program.exercise_count}{" "}
                      {program.exercise_count === 1 ? "MOVE" : "MOVES"}
                    </Text>
                  </View>
                </View>

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
    marginBottom: 20,
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

  // Filtering Panel Elements
  filterSection: {
    marginBottom: 24,
  },
  filterContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchBarContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1a1a1a",
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, color: "#fff", fontSize: 14, height: "100%" },
  clearButton: { padding: 4 },
  sortButton: {
    width: 44,
    height: 44,
    backgroundColor: "#111",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
  },
  filterPill: {
    height: 44,
    paddingHorizontal: 16,
    backgroundColor: "#111",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1a1a1a",
    alignItems: "center",
    justifyContent: "center",
  },
  filterPillActive: {
    backgroundColor: "rgba(128,0,0,0.15)",
    borderColor: "#800000",
  },
  filterPillText: { color: "#555", fontSize: 13, fontWeight: "600" },
  filterPillTextActive: { color: "#800000" },

  // Horizontal Exercise Volume Track Slider
  volumeScrollTrack: {
    paddingTop: 10,
    gap: 6,
  },
  volumeChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#0d0d0d",
    borderWidth: 1,
    borderColor: "#161616",
  },
  volumeChipActive: {
    backgroundColor: "rgba(128,0,0,0.08)",
    borderColor: "rgba(128,0,0,0.3)",
  },
  volumeChipText: {
    color: "#444",
    fontSize: 12,
    fontWeight: "500",
  },
  volumeChipTextActive: {
    color: "#fff",
    fontWeight: "600",
  },

  emptyState: { alignItems: "center", marginTop: 40, paddingHorizontal: 20 },
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
    marginBottom: 12,
  },
  badgeCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
  metaBadge: {
    backgroundColor: "#161616",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#222",
  },
  metaBadgeText: {
    color: "#666",
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  deleteBtn: { padding: 4 },
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
