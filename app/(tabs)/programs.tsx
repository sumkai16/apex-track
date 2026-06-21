import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
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

  const [searchQuery, setSearchQuery] = useState("");
  const [showOnlyActive, setShowOnlyActive] = useState(false);
  const [sortNewestFirst, setSortNewestFirst] = useState(true);
  const [volumeFilter, setVolumeFilter] = useState<VolumeFilterType>("ALL");
  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const TEMPLATE_EXERCISES: Record<string, string[]> = {
    // map to exercise names stored in the DB
    "strength-4wk": ["Squat", "Bench Press", "Deadlift", "Pull-up", "Plank"],
    "hypertrophy-6wk": [
      "Incline Bench",
      "Romanian Deadlift",
      "Barbell Row",
      "Leg Press",
      "Bicep Curl",
    ],
    "conditioning-3wk": [
      "Sprint Intervals",
      "Kettlebell Swing",
      "Bodyweight Circuit",
    ],
  };

  const [templateExercises, setTemplateExercises] = useState<
    {
      id?: string;
      name: string;
      icon?: string | null;
      estimated_duration?: number | null;
    }[]
  >([]);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const animValuesRef = useRef<Animated.Value[]>([]);

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

  const processedPrograms = programs
    .filter((program) => {
      const matchesSearch =
        program.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (program.description &&
          program.description
            .toLowerCase()
            .includes(searchQuery.toLowerCase()));

      const matchesActiveFilter = !showOnlyActive || program.is_active;

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

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return `${Math.floor(diffDays / 7)} weeks ago`;
  }

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

        {/* Recommended Templates - horizontal scroll */}
        <Text style={styles.sectionTitle}>RECOMMENDED TEMPLATES</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.templateScrollContent}
          style={styles.templateScroll}
        >
          {[
            {
              id: "strength-4wk",
              title: "4-Week Strength Builder",
              subtitle: "Progressive full-body strength — Beginner to Intermediate",
            },
            {
              id: "hypertrophy-6wk",
              title: "6-Week Hypertrophy Focus",
              subtitle: "Upper/lower split with volume progression",
            },
            {
              id: "conditioning-3wk",
              title: "3-Week Conditioning Primer",
              subtitle: "Short, intense sessions for aerobic capacity",
            },
          ].map((t) => (
            <TouchableOpacity
              key={t.id}
              style={styles.templateCard}
              activeOpacity={0.92}
              onPress={async () => {
                setSelectedTemplate(t);
                setTemplateModalVisible(true);
                const names = TEMPLATE_EXERCISES[t.id] || [];
                setLoadingTemplate(true);
                try {
                  const { data, error } = await supabase
                    .from("exercises")
                    .select("id, name, icon, estimated_duration")
                    .in("name", names);
                  if (error) throw error;
                  const ordered = names.map(
                    (n) => data?.find((d: any) => d.name === n) || { name: n },
                  );
                  setTemplateExercises(ordered);
                  animValuesRef.current = ordered.map(() => new Animated.Value(20));
                  Animated.stagger(
                    80,
                    animValuesRef.current.map((av) =>
                      Animated.timing(av, {
                        toValue: 0,
                        duration: 300,
                        useNativeDriver: true,
                      }),
                    ),
                  ).start();
                } catch (err) {
                  setTemplateExercises(names.map((n) => ({ name: n })));
                  animValuesRef.current = names.map(() => new Animated.Value(0));
                } finally {
                  setLoadingTemplate(false);
                }
              }}
            >
              <LinearGradient
                colors={["rgba(179,0,0,0.12)", "rgba(13,13,13,0.35)"]}
                style={styles.templateGradient}
              />
              <View style={styles.templateIconCircle}>
                <Ionicons name="barbell" size={18} color="#fff" />
              </View>
              <Text style={styles.templateTitle} numberOfLines={2}>{t.title}</Text>
              <Text style={styles.templateSubtitle} numberOfLines={2}>{t.subtitle}</Text>
              <TouchableOpacity
                style={styles.templateUseBtn}
                onPress={(e) => {
                  e.stopPropagation()
                  router.push(
                    `/programs/create?template=${encodeURIComponent(
                      JSON.stringify({ id: t.id, name: t.title, description: t.subtitle }),
                    )}`,
                  )
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.templateUseBtnText}>Use</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Template Preview Modal */}
        <Modal
          visible={templateModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setTemplateModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{selectedTemplate?.title}</Text>
              <Text style={styles.modalSubtitle} numberOfLines={2}>
                {selectedTemplate?.subtitle}
              </Text>

              <View style={{ marginTop: 12 }}>
                {loadingTemplate ? (
                  <ActivityIndicator color="#800000" />
                ) : (
                  templateExercises.map((ex, i) => {
                    const av =
                      animValuesRef.current[i] || new Animated.Value(0);
                    return (
                      <Animated.View
                        key={i}
                        style={[
                          styles.modalExerciseRow,
                          {
                            transform: [{ translateY: av }],
                            opacity: av.interpolate({
                              inputRange: [0, 20],
                              outputRange: [1, 0],
                            }),
                          },
                        ]}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 12,
                          }}
                        >
                          <View style={{ width: 36, alignItems: "center" }}>
                            <Ionicons
                              name={(ex.icon as any) || "fitness-outline"}
                              size={18}
                              color="#fff"
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.modalExerciseName}>
                              {ex.name}
                            </Text>
                          </View>
                          <View>
                            <Text style={{ color: "#444", fontSize: 12 }}>
                              {ex.estimated_duration
                                ? `${ex.estimated_duration} min`
                                : "10 min"}
                            </Text>
                          </View>
                        </View>
                      </Animated.View>
                    );
                  })
                )}
              </View>

              {/* Estimated session duration */}
              <View style={{ marginTop: 12 }}>
                <Text style={{ color: "#555", fontSize: 12 }}>
                  Est. duration:{" "}
                  {templateExercises.reduce(
                    (sum, e) => sum + (e.estimated_duration || 10),
                    0,
                  )}{" "}
                  minutes
                </Text>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.templateButton, { flex: 1, marginRight: 8 }]}
                  onPress={() => {
                    if (!selectedTemplate) return;
                    setTemplateModalVisible(false);
                    router.push(
                      `/programs/create?template=${encodeURIComponent(
                        JSON.stringify({
                          id: selectedTemplate.id,
                          name: selectedTemplate.title,
                          description: selectedTemplate.subtitle,
                        }),
                      )}`,
                    );
                  }}
                >
                  <Text style={styles.templateButtonText}>Go for it</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.closeButton, { flex: 1 }]}
                  onPress={() => setTemplateModalVisible(false)}
                >
                  <Text style={styles.closeButtonText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

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

            <View style={styles.volumeFilterContainer}>
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
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                    >
                      {chip.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
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
              We couldn{"'"}t track down any programs matching your dynamic volume
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
              activeOpacity={0.85}
            >
              {/* Accent bar at the top */}
              <View
                style={[
                  styles.accentBar,
                  program.is_active && styles.accentBarActive,
                ]}
              />

              {/* Header with title and delete button */}
              <View style={styles.cardHeader}>
                <View style={styles.titleSection}>
                  <Text style={styles.programName}>{program.name}</Text>
                  <Text style={styles.createdDate}>
                    Created {formatDate(program.created_at)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => deleteProgram(program.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="trash-outline" size={18} color="#555" />
                </TouchableOpacity>
              </View>

              {/* Description */}
              {program.description ? (
                <Text style={styles.programDesc} numberOfLines={2}>
                  {program.description}
                </Text>
              ) : null}

              {/* Stats grid */}
              <View style={styles.statsContainer}>
                {program.is_active && (
                  <View style={styles.statItem}>
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color="#800000"
                    />
                    <View>
                      <Text style={styles.statLabel}>Status</Text>
                      <Text style={styles.statValue}>Active</Text>
                    </View>
                  </View>
                )}

                <View style={styles.statItem}>
                  <Ionicons name="calendar-outline" size={16} color="#555" />
                  <View>
                    <Text style={styles.statLabel}>Days</Text>
                    <Text style={styles.statValue}>{program.day_count}</Text>
                  </View>
                </View>

                <View style={styles.statItem}>
                  <Ionicons name="fitness-outline" size={16} color="#555" />
                  <View>
                    <Text style={styles.statLabel}>Exercises</Text>
                    <Text style={styles.statValue}>
                      {program.exercise_count}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Footer action */}
              <View style={styles.cardFooter}>
                <Text style={styles.cardFooterText}>VIEW PROGRAM</Text>
                <Ionicons name="arrow-forward" size={14} color="#800000" />
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

  filterSection: {
    marginBottom: 24,
  },
  filterContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
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

  volumeFilterContainer: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  volumeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#0d0d0d",
    borderWidth: 1,
    borderColor: "#161616",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  volumeChipActive: {
    backgroundColor: "rgba(128,0,0,0.08)",
    borderColor: "rgba(128,0,0,0.3)",
  },
  volumeChipText: {
    color: "#444",
    fontSize: 10,
    fontWeight: "500",
    textAlign: "center",
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

  // NEW CARD DESIGN
  programCard: {
    backgroundColor: "#0d0d0d",
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#161616",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },

  // Accent bar at top
  accentBar: {
    height: 3,
    backgroundColor: "rgba(128,0,0,0.3)",
  },
  accentBarActive: {
    backgroundColor: "#800000",
  },

  // Header section
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  titleSection: { flex: 1, marginRight: 12 },
  programName: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  createdDate: {
    color: "#444",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  deleteBtn: {
    padding: 8,
    marginRight: -8,
    marginTop: -8,
  },

  // Description
  programDesc: {
    color: "#666",
    fontSize: 12,
    lineHeight: 16,
    marginHorizontal: 16,
    marginBottom: 12,
  },

  // Stats grid
  statsContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#161616",
    borderBottomWidth: 1,
    borderBottomColor: "#161616",
    gap: 2,
  },
  statItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "rgba(128,0,0,0.04)",
    borderRadius: 8,
  },
  statLabel: {
    color: "#444",
    fontSize: 9,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  statValue: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },

  // Footer
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  cardFooterText: {
    color: "#800000",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  sectionTitle: {
    color: "#444",
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: 14,
    fontWeight: "700",
  },
  templateScroll: {
    marginHorizontal: -20, // bleed to screen edge
    marginBottom: 24,
  },
  templateScrollContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  templateCard: {
    width: 200,
    backgroundColor: "#0d0d0d",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#141414",
    overflow: "hidden",
  },
  templateGradient: {
    position: "absolute",
    left: 0, right: 0, top: 0, bottom: 0,
    borderRadius: 16,
  },
  templateIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#800000",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  templateTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 4,
    lineHeight: 18,
  },
  templateSubtitle: {
    color: "#666",
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 14,
  },
  templateUseBtn: {
    backgroundColor: "#800000",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  templateUseBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
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
  modalExerciseRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#111",
  },
  modalExerciseName: { color: "#ddd", fontSize: 13 },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 14,
  },
  closeButton: {
    backgroundColor: "#111",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: { color: "#fff", fontSize: 13 },
});
