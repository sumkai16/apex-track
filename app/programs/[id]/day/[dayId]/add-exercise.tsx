import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
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

export default function AddExerciseScreen() {
  const { id: programId, dayId } = useLocalSearchParams<{
    id: string;
    dayId: string;
  }>();

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [filtered, setFiltered] = useState<Exercise[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Exercise | null>(null);
  const [sets, setSets] = useState("");
  const [reps, setReps] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

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
    const { data } = await supabase
      .from("exercises")
      .select("id, name, category, equipment_type")
      .order("name", { ascending: true });
    if (data) {
      setExercises(data);
      setFiltered(data);
    }
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

    // Add to list and auto-select it
    const newEx = data as Exercise;
    setExercises((prev) =>
      [...prev, newEx].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setSelected(newEx);
    setCreating(false);
    setShowCreateModal(false);
    setNewName("");
    setNewCategory("");
    setNewEquipment("");
  }

  async function handleAdd() {
    if (!selected) {
      Alert.alert("Required", "Please select an exercise.");
      return;
    }
    setSaving(true);

    const { data: existing } = await supabase
      .from("program_exercises")
      .select("order_index")
      .eq("program_day_id", dayId)
      .order("order_index", { ascending: false })
      .limit(1);

    const nextIndex =
      existing && existing.length > 0 ? existing[0].order_index + 1 : 0;

    const { error } = await supabase.from("program_exercises").insert({
      program_day_id: dayId,
      exercise_id: selected.id,
      order_index: nextIndex,
      target_sets: sets ? parseInt(sets) : null,
      target_reps: reps ? parseInt(reps) : null,
      notes: notes.trim() || null,
    });

    if (error) {
      Alert.alert("Error", "Failed to add exercise.");
      setSaving(false);
      return;
    }

    setSaving(false);
    router.back();
  }

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
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => setShowCreateModal(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
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

        {/* Create new hint */}
        {search.length > 0 && filtered.length === 0 && (
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

        {/* Exercise list */}
        {filtered.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>SELECT EXERCISE</Text>
            {filtered.map((ex) => (
              <TouchableOpacity
                key={ex.id}
                style={[
                  styles.exerciseItem,
                  selected?.id === ex.id && styles.exerciseItemSelected,
                ]}
                onPress={() => setSelected(ex)}
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
                {selected?.id === ex.id && (
                  <Ionicons name="checkmark-circle" size={20} color="#800000" />
                )}
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* Sets, Reps & Notes */}
        {selected && (
          <View style={styles.detailSection}>
            <View style={styles.selectedBanner}>
              <View style={styles.selectedBannerLeft}>
                <Text style={styles.selectedBannerLabel}>SELECTED</Text>
                <Text style={styles.selectedBannerName}>{selected.name}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Ionicons name="close-circle-outline" size={20} color="#555" />
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionLabel}>SETS & REPS</Text>
            <View style={styles.setsRepsRow}>
              <View style={styles.setsRepsField}>
                <Text style={styles.inputLabel}>Sets</Text>
                <TextInput
                  style={styles.numInput}
                  placeholder="3"
                  placeholderTextColor="#333"
                  value={sets}
                  onChangeText={setSets}
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.setsRepsDivider}>
                <Text style={styles.dividerText}>×</Text>
              </View>
              <View style={styles.setsRepsField}>
                <Text style={styles.inputLabel}>Reps</Text>
                <TextInput
                  style={styles.numInput}
                  placeholder="10"
                  placeholderTextColor="#333"
                  value={reps}
                  onChangeText={setReps}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <Text style={styles.sectionLabel}>
              NOTES <Text style={styles.optional}>(OPTIONAL)</Text>
            </Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="e.g. Keep back straight, slow on the eccentric…"
              placeholderTextColor="#333"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.addBtn, saving && styles.addBtnDisabled]}
              onPress={handleAdd}
              disabled={saving}
              activeOpacity={0.85}
            >
              <Text style={styles.addBtnText}>
                {saving ? "Adding…" : `Add ${selected.name}`}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* ── Create Exercise Modal ── */}
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
            {/* Name */}
            <Text style={styles.modalSectionLabel}>EXERCISE NAME</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Bulgarian Split Squat"
              placeholderTextColor="#333"
              value={newName}
              onChangeText={setNewName}
              autoFocus
            />

            {/* Category */}
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

            {/* Equipment */}
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
  sectionLabel: {
    color: "#555",
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  optional: { color: "#333", fontWeight: "400" },
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
  detailSection: {
    marginTop: 8,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
  },
  selectedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(128,0,0,0.1)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(128,0,0,0.3)",
  },
  selectedBannerLeft: {},
  selectedBannerLabel: {
    color: "#800000",
    fontSize: 9,
    letterSpacing: 1.5,
    marginBottom: 3,
  },
  selectedBannerName: { color: "#fff", fontSize: 15, fontWeight: "700" },
  setsRepsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    marginBottom: 24,
  },
  setsRepsField: { flex: 1 },
  setsRepsDivider: { paddingBottom: 14, alignItems: "center" },
  dividerText: { color: "#444", fontSize: 20, fontWeight: "300" },
  inputLabel: {
    color: "#888",
    fontSize: 11,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  numInput: {
    backgroundColor: "#111",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    borderWidth: 1,
    borderColor: "#1a1a1a",
  },
  input: {
    backgroundColor: "#111",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#fff",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#1a1a1a",
    marginBottom: 24,
  },
  textArea: { height: 90, paddingTop: 14 },
  addBtn: {
    backgroundColor: "#800000",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  // Modal styles
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
