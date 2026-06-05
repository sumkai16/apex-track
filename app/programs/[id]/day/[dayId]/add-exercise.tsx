import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface Exercise {
  id: string;
  name: string;
  category: string | null;
  equipment_type: string | null;
}

const CATEGORIES = [
  "Chest",
  "Back",
  "Shoulders",
  "Arms",
  "Legs",
  "Core",
  "Cardio",
  "Full Body",
  "Other",
];

const EQUIPMENT_TYPES = [
  "Barbell",
  "Dumbbell",
  "Cable",
  "Machine",
  "Bodyweight",
  "Kettlebell",
  "Resistance Band",
  "Other",
];

// Production-ready predefined standard exercise matrix
const SEED_EXERCISES = [
  { name: "Barbell Bench Press", category: "Chest", equipment_type: "Barbell" },
  {
    name: "Incline Dumbbell Press",
    category: "Chest",
    equipment_type: "Dumbbell",
  },
  { name: "Cable Crossover", category: "Chest", equipment_type: "Cable" },
  { name: "Chest Fly", category: "Chest", equipment_type: "Machine" },
  { name: "Push-Up", category: "Chest", equipment_type: "Bodyweight" },

  {
    name: "Conventional Deadlift",
    category: "Back",
    equipment_type: "Barbell",
  },
  { name: "Pull-Up", category: "Back", equipment_type: "Bodyweight" },
  { name: "Lat Pulldown", category: "Back", equipment_type: "Machine" },
  {
    name: "Bent-Over Barbell Row",
    category: "Back",
    equipment_type: "Barbell",
  },
  {
    name: "One-Arm Dumbbell Row",
    category: "Back",
    equipment_type: "Dumbbell",
  },

  { name: "Barbell Back Squat", category: "Legs", equipment_type: "Barbell" },
  { name: "Romanian Deadlift", category: "Legs", equipment_type: "Barbell" },
  { name: "Leg Press", category: "Legs", equipment_type: "Machine" },
  {
    name: "Bulgarian Split Squat",
    category: "Legs",
    equipment_type: "Dumbbell",
  },
  {
    name: "Kettlebell Goblet Squat",
    category: "Legs",
    equipment_type: "Kettlebell",
  },
  { name: "Lying Leg Curl", category: "Legs", equipment_type: "Machine" },

  {
    name: "Overhead Barbell Press",
    category: "Shoulders",
    equipment_type: "Barbell",
  },
  {
    name: "Dumbbell Lateral Raise",
    category: "Shoulders",
    equipment_type: "Dumbbell",
  },
  { name: "Cable Face Pull", category: "Shoulders", equipment_type: "Cable" },
  {
    name: "Dumbbell Shoulder Press",
    category: "Shoulders",
    equipment_type: "Dumbbell",
  },

  { name: "Dumbbell Bicep Curl", category: "Arms", equipment_type: "Dumbbell" },
  { name: "Tricep Rope Pushdown", category: "Arms", equipment_type: "Cable" },
  {
    name: "Dumbbell Hammer Curl",
    category: "Arms",
    equipment_type: "Dumbbell",
  },
  {
    name: "Incline Dumbbell Curl",
    category: "Arms",
    equipment_type: "Dumbbell",
  },
  {
    name: "Barbell Skull Crusher",
    category: "Arms",
    equipment_type: "Barbell",
  },

  { name: "Hanging Leg Raise", category: "Core", equipment_type: "Bodyweight" },
  { name: "Plank", category: "Core", equipment_type: "Bodyweight" },
  { name: "Ab Wheel Rollout", category: "Core", equipment_type: "Other" },
  { name: "Cable Crunch", category: "Core", equipment_type: "Cable" },

  { name: "Treadmill Run", category: "Cardio", equipment_type: "Machine" },
  { name: "Rowing Machine", category: "Cardio", equipment_type: "Machine" },
  { name: "Burpee", category: "Full Body", equipment_type: "Bodyweight" },
];

export default function AddExerciseScreen() {
  const { id: programId, dayId } = useLocalSearchParams<{
    id: string;
    dayId: string;
  }>();

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [filtered, setFiltered] = useState<Exercise[]>([]);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  // Create exercise modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newEquipment, setNewEquipment] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchExercises();
  }, []);

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(exercises);
    } else {
      setFiltered(
        exercises.filter((e) =>
          e.name.toLowerCase().includes(search.toLowerCase()),
        ),
      );
    }
  }, [search, exercises]);

  async function fetchExercises() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("exercises")
        .select("id, name, category, equipment_type")
        .order("name", { ascending: true });
      if (data) {
        setExercises(data);
        setFiltered(data);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  // Seeding engine execution workflow
  async function handleSeedLibrary() {
    setSeeding(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      Alert.alert("Authentication Required", "Please log back into the app.");
      setSeeding(false);
      return;
    }

    // Isolate exercises already present in your database by matching lowercase titles
    const currentNames = new Set(exercises.map((e) => e.name.toLowerCase()));
    const missingExercises = SEED_EXERCISES.filter(
      (item) => !currentNames.has(item.name.toLowerCase()),
    );

    if (missingExercises.length === 0) {
      Alert.alert(
        "Library Complete",
        "Your database already has all core foundation movements populated.",
      );
      setSeeding(false);
      return;
    }

    // Attach configuration details to the batch transaction mapping payload
    const payload = missingExercises.map((item) => ({
      ...item,
      is_system: true,
      created_by: user.id,
    }));

    const { error } = await supabase.from("exercises").insert(payload);

    if (error) {
      Alert.alert(
        "Seeding Failed",
        error.message || "Could not insert template library data.",
      );
      setSeeding(false);
      return;
    }

    Alert.alert(
      "Success 🎉",
      `Successfully synced and appended ${missingExercises.length} missing foundation exercises!`,
      [{ text: "Awesome", onPress: () => fetchExercises() }],
    );
    setSeeding(false);
  }

  function toggleExercise(ex: Exercise) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(ex.id)) {
        next.delete(ex.id);
      } else {
        next.add(ex.id);
      }
      return next;
    });
  }

  async function handleCreateExercise() {
    if (!newName.trim()) {
      Alert.alert("Required", "Please enter an exercise name.");
      return;
    }
    setCreating(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("exercises")
      .insert({
        name: newName.trim(),
        category: newCategory || null,
        equipment_type: newEquipment || null,
        is_system: false,
        created_by: user.id,
      })
      .select()
      .single();

    if (error || !data) {
      Alert.alert("Error", "Failed to create exercise.");
      setCreating(false);
      return;
    }

    const newEx = data as Exercise;
    setExercises((prev) =>
      [...prev, newEx].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setSelectedIds((prev) => new Set(prev).add(newEx.id));
    setCreating(false);
    setShowCreateModal(false);
    setNewName("");
    setNewCategory("");
    setNewEquipment("");
  }

  async function handleAdd() {
    if (selectedIds.size === 0) {
      Alert.alert("Required", "Please select at least one exercise.");
      return;
    }
    setSaving(true);

    const { data: existing } = await supabase
      .from("program_exercises")
      .select("order_index")
      .eq("program_day_id", dayId)
      .order("order_index", { ascending: false })
      .limit(1);

    let nextIndex =
      existing && existing.length > 0 ? existing[0].order_index + 1 : 0;

    const payload = Array.from(selectedIds).map((exerciseId, i) => ({
      program_day_id: dayId,
      exercise_id: exerciseId,
      order_index: nextIndex + i,
    }));

    const { error } = await supabase.from("program_exercises").insert(payload);

    if (error) {
      Alert.alert("Error", "Failed to add exercises.");
      setSaving(false);
      return;
    }

    setSaving(false);
    router.back();
  }

  const selectedCount = selectedIds.size;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar barStyle="light-content" />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Add Exercise</Text>

        {/* Actions row container */}
        <View style={styles.topBarActions}>
          <TouchableOpacity
            style={styles.seedIconBtn}
            onPress={handleSeedLibrary}
            disabled={seeding}
            activeOpacity={0.7}
          >
            {seeding ? (
              <ActivityIndicator size="small" color="#800000" />
            ) : (
              <Ionicons
                name="cloud-download-outline"
                size={20}
                color="#800000"
              />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => setShowCreateModal(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          selectedCount > 0 && styles.scrollWithFooter,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Search */}
        <View style={styles.searchRow}>
          <Ionicons
            name="search-outline"
            size={16}
            color="#444"
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search exercises…"
            placeholderTextColor="#333"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color="#444" />
            </TouchableOpacity>
          )}
        </View>

        {/* Loading Indicator */}
        {loading && (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="small" color="#800000" />
          </View>
        )}

        {/* Empty State Seed Engine Prompt Callout Banner */}
        {!loading && exercises.length === 0 && (
          <View style={styles.seedContainerCard}>
            <Ionicons
              name="flash"
              size={26}
              color="#800000"
              style={{ marginBottom: 10 }}
            />
            <Text style={styles.seedTitleText}>Exercise Library is Empty</Text>
            <Text style={styles.seedDescriptionText}>
              Populate your workspace with a complete collection of 32
              foundation exercises across all splits to run the training
              generator.
            </Text>
            <TouchableOpacity
              style={[styles.seedActionBtn, seeding && styles.addBtnDisabled]}
              onPress={handleSeedLibrary}
              disabled={seeding}
              activeOpacity={0.8}
            >
              <Text style={styles.seedActionBtnText}>
                {seeding
                  ? "Populating Database..."
                  : "Seed Core Exercise Library"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Create new hint from custom search input */}
        {search.length > 0 && filtered.length === 0 && !loading && (
          <TouchableOpacity
            style={styles.noResultsCard}
            onPress={() => {
              setNewName(search);
              setShowCreateModal(true);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="add-circle-outline" size={20} color="#800000" />
            <View style={styles.noResultsText}>
              <Text style={styles.noResultsTitle}>
                No results for "{search}"
              </Text>
              <Text style={styles.noResultsSub}>
                Tap to create this exercise
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Exercise list rendering */}
        {filtered.length > 0 && !loading && (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionLabel}>SELECT EXERCISES</Text>
              {selectedCount > 0 && (
                <TouchableOpacity onPress={() => setSelectedIds(new Set())}>
                  <Text style={styles.clearText}>CLEAR ALL</Text>
                </TouchableOpacity>
              )}
            </View>

            {filtered.map((ex) => {
              const isSelected = selectedIds.has(ex.id);
              return (
                <TouchableOpacity
                  key={ex.id}
                  style={[
                    styles.exerciseItem,
                    isSelected && styles.exerciseItemSelected,
                  ]}
                  onPress={() => toggleExercise(ex)}
                  activeOpacity={0.75}
                >
                  <View style={styles.exerciseItemLeft}>
                    {ex.category ? (
                      <Text style={styles.exerciseCategory}>
                        {ex.category.toUpperCase()}
                      </Text>
                    ) : null}
                    <Text style={styles.exerciseItemName}>{ex.name}</Text>
                    {ex.equipment_type ? (
                      <Text style={styles.exerciseEquipment}>
                        {ex.equipment_type}
                      </Text>
                    ) : null}
                  </View>
                  <View
                    style={[
                      styles.checkbox,
                      isSelected && styles.checkboxSelected,
                    ]}
                  >
                    {isSelected && (
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* Sticky footer UI elements */}
      {selectedCount > 0 && (
        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            <Text style={styles.footerCount}>{selectedCount}</Text>
            <Text style={styles.footerLabel}>
              {selectedCount === 1 ? "exercise" : "exercises"} selected
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.addBtn, saving && styles.addBtnDisabled]}
            onPress={handleAdd}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Text style={styles.addBtnText}>
              {saving ? "Adding…" : "Add to Day"}
            </Text>
            {!saving && (
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ── Create Custom Single Exercise Modal ── */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalTopBar}>
            <TouchableOpacity
              onPress={() => setShowCreateModal(false)}
              style={styles.modalCloseBtn}
            >
              <Ionicons name="close" size={20} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Exercise</Text>
            <View style={{ width: 36 }} />
          </View>

          <ScrollView
            contentContainerStyle={styles.modalScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.modalSectionLabel}>EXERCISE NAME</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Bulgarian Split Squat"
              placeholderTextColor="#333"
              value={newName}
              onChangeText={setNewName}
              autoFocus
            />

            <Text style={styles.modalSectionLabel}>CATEGORY</Text>
            <View style={styles.chipGrid}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.chip,
                    newCategory === cat && styles.chipSelected,
                  ]}
                  onPress={() =>
                    setNewCategory((prev) => (prev === cat ? "" : cat))
                  }
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.chipText,
                      newCategory === cat && styles.chipTextSelected,
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalSectionLabel}>EQUIPMENT TYPE</Text>
            <View style={styles.chipGrid}>
              {EQUIPMENT_TYPES.map((eq) => (
                <TouchableOpacity
                  key={eq}
                  style={[
                    styles.chip,
                    newEquipment === eq && styles.chipSelected,
                  ]}
                  onPress={() =>
                    setNewEquipment((prev) => (prev === eq ? "" : eq))
                  }
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.chipText,
                      newEquipment === eq && styles.chipTextSelected,
                    ]}
                  >
                    {eq}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.modalSaveBtn, creating && styles.addBtnDisabled]}
              onPress={handleCreateExercise}
              disabled={creating}
              activeOpacity={0.85}
            >
              <Text style={styles.modalSaveBtnText}>
                {creating ? "Creating…" : "Create Exercise"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
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
  topBarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  seedIconBtn: {
    width: 36,
    height: 36,
    backgroundColor: "#111",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#1a1a1a",
  },
  createBtn: {
    width: 36,
    height: 36,
    backgroundColor: "#800000",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  scroll: { paddingHorizontal: 20, paddingBottom: 48, paddingTop: 4 },
  scrollWithFooter: { paddingBottom: 100 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1a1a1a",
    paddingHorizontal: 12,
    marginBottom: 20,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, color: "#fff", fontSize: 14, paddingVertical: 13 },
  centerContainer: { marginVertical: 30, alignItems: "center" },

  // Seed Premium Crimson Feature Styles
  seedContainerCard: {
    backgroundColor: "rgba(128,0,0,0.05)",
    borderWidth: 1,
    borderColor: "rgba(128,0,0,0.15)",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginVertical: 12,
  },
  seedTitleText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6,
  },
  seedDescriptionText: {
    color: "#777",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 20,
  },
  seedActionBtn: {
    backgroundColor: "#800000",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    width: "100%",
    alignItems: "center",
  },
  seedActionBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },

  noResultsCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(128,0,0,0.08)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(128,0,0,0.25)",
  },
  noResultsText: { flex: 1 },
  noResultsTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  noResultsSub: { color: "#800000", fontSize: 12 },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionLabel: {
    color: "#555",
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  clearText: {
    color: "#800000",
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: "600",
  },
  exerciseItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#111",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#1a1a1a",
  },
  exerciseItemSelected: {
    borderColor: "rgba(128,0,0,0.5)",
    backgroundColor: "rgba(128,0,0,0.08)",
  },
  exerciseItemLeft: { flex: 1 },
  exerciseCategory: {
    color: "#444",
    fontSize: 9,
    letterSpacing: 1,
    marginBottom: 3,
  },
  exerciseItemName: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 2,
  },
  exerciseEquipment: { color: "#333", fontSize: 11, marginTop: 1 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#333",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
  checkboxSelected: {
    backgroundColor: "#800000",
    borderColor: "#800000",
  },

  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#0d0d0d",
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
    paddingHorizontal: 20,
    paddingVertical: 14,
    paddingBottom: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  footerLeft: { flex: 1 },
  footerCount: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 24,
  },
  footerLabel: { color: "#555", fontSize: 12 },
  addBtn: {
    backgroundColor: "#800000",
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  modalContainer: { flex: 1, backgroundColor: "#0a0a0a" },
  modalTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    backgroundColor: "#161616",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  modalScroll: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48 },
  modalSectionLabel: {
    color: "#555",
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 12,
    marginTop: 4,
  },
  modalInput: {
    backgroundColor: "#161616",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#fff",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#222",
    marginBottom: 24,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 24,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#161616",
    borderWidth: 1,
    borderColor: "#222",
  },
  chipSelected: {
    backgroundColor: "rgba(128,0,0,0.15)",
    borderColor: "rgba(128,0,0,0.5)",
  },
  chipText: { color: "#555", fontSize: 13 },
  chipTextSelected: { color: "#fff", fontWeight: "600" },
  modalSaveBtn: {
    backgroundColor: "#800000",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  modalSaveBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
