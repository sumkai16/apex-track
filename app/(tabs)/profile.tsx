import { supabase } from "@/lib/supabase";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useWeightUnit } from '../../lib/WeightUnitContext';
type WeightUnit = "kg" | "lbs";
type HeightUnit = "cm" | "ft";

const GENDERS = ["Male", "Female", "Other"];
const GOALS = [
  "Build Muscle",
  "Lose Weight",
  "Improve Endurance",
  "Stay Active",
];

interface Profile {
  display_name: string;
  weight_unit: WeightUnit;
  height_unit: HeightUnit;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  gender: string | null;
  fitness_goal: string | null;
}

export default function ProfileScreen() {
  const router = useRouter();
  const { setUnit } = useWeightUnit()
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);

  const [editNameVisible, setEditNameVisible] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Body stats modal
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [editAge, setEditAge] = useState("");
  const [editHeight, setEditHeight] = useState("");
  const [editWeight, setEditWeight] = useState("");
  const [editGender, setEditGender] = useState("");
  const [editGoal, setEditGoal] = useState("");
  const [editWeightUnit, setEditWeightUnit] = useState<WeightUnit>("kg");
  const [editHeightUnit, setEditHeightUnit] = useState<HeightUnit>("cm");
  const [savingStats, setSavingStats] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchProfile();
    }, []),
  );

  async function fetchProfile() {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? "");
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "display_name, weight_unit, height_unit, age, height_cm, weight_kg, gender, fitness_goal",
        )
        .eq("id", user.id)
        .single();
      if (error) throw error;
      setProfile(data);
    } catch (err) {
      Alert.alert("Error", "Could not load profile.");
    } finally {
      setLoading(false);
    }
  }

  async function handleWeightUnitToggle(unit: WeightUnit) {
    if (unit === profile?.weight_unit) return;
    const previous = profile?.weight_unit;
    setProfile((prev) => (prev ? { ...prev, weight_unit: unit } : prev));
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setProfile((prev) =>
          prev ? { ...prev, weight_unit: previous! } : prev,
        );
        return;
      }
      const { error } = await supabase
        .from("profiles")
        .update({ weight_unit: unit })
        .eq("id", user.id);
      if (error) {
        setProfile((prev) =>
          prev ? { ...prev, weight_unit: previous! } : prev,
        );
        Alert.alert("Error", "Could not update weight unit.");
      } else {
        setUnit(unit) // Update global context
      }
    } catch {
      setProfile((prev) => (prev ? { ...prev, weight_unit: previous! } : prev));
      Alert.alert("Error", "Could not update weight unit.");
    }
  }

  function openEditName() {
    setEditNameValue(profile?.display_name ?? "");
    setEditNameVisible(true);
  }

  async function handleSaveName() {
    const trimmed = editNameValue.trim();
    if (!trimmed) {
      Alert.alert("Invalid name", "Display name cannot be empty.");
      return;
    }
    setSavingName(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: trimmed })
        .eq("id", user.id);
      if (error) throw error;
      setProfile((prev) => (prev ? { ...prev, display_name: trimmed } : prev));
      setEditNameVisible(false);
    } catch {
      Alert.alert("Error", "Could not update display name.");
    } finally {
      setSavingName(false);
    }
  }

  function openStatsModal() {
    const wu = profile?.weight_unit ?? "kg";
    const hu = profile?.height_unit ?? "cm";
    setEditWeightUnit(wu);
    setEditHeightUnit(hu);
    setEditAge(profile?.age?.toString() ?? "");
    setEditGender(profile?.gender ?? "");
    setEditGoal(profile?.fitness_goal ?? "");

    // Display stored kg/cm in user's preferred unit
    if (profile?.weight_kg) {
      setEditWeight(
        wu === "lbs"
          ? (profile.weight_kg * 2.20462).toFixed(1)
          : profile.weight_kg.toString(),
      );
    } else setEditWeight("");

    if (profile?.height_cm) {
      if (hu === "ft") {
        const totalInches = profile.height_cm / 2.54;
        const feet = Math.floor(totalInches / 12);
        const inches = Math.round(totalInches % 12);
        setEditHeight(`${feet}.${inches}`);
      } else {
        setEditHeight(profile.height_cm.toString());
      }
    } else setEditHeight("");

    setShowStatsModal(true);
  }

  async function handleSaveStats() {
    setSavingStats(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    let heightToStore = editHeight ? parseFloat(editHeight) : null;
    let weightToStore = editWeight ? parseFloat(editWeight) : null;

    if (editHeightUnit === "ft" && heightToStore) {
      heightToStore = parseFloat((heightToStore * 30.48).toFixed(1));
    }
    if (editWeightUnit === "lbs" && weightToStore) {
      weightToStore = parseFloat((weightToStore * 0.453592).toFixed(1));
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        age: editAge ? parseInt(editAge) : null,
        height_cm: heightToStore,
        weight_kg: weightToStore,
        gender: editGender || null,
        fitness_goal: editGoal || null,
        weight_unit: editWeightUnit,
        height_unit: editHeightUnit,
      })
      .eq("id", user.id);

    if (error) {
      Alert.alert("Error", "Failed to save stats.");
      setSavingStats(false);
      return;
    }

    setProfile((prev) =>
      prev
        ? {
          ...prev,
          age: editAge ? parseInt(editAge) : null,
          height_cm: heightToStore,
          weight_kg: weightToStore,
          gender: editGender || null,
          fitness_goal: editGoal || null,
          weight_unit: editWeightUnit,
          height_unit: editHeightUnit,
        }
        : prev,
    );

    setSavingStats(false);
    setShowStatsModal(false);
  }

  async function handleLogout() {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText !== "DELETE") return;
    setDeletingAccount(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { error: setsError } = await supabase
        .from("session_sets")
        .delete()
        .in(
          "session_id",
          (
            await supabase.from("sessions").select("id").eq("user_id", user.id)
          ).data?.map((s) => s.id) ?? [],
        );
      if (setsError) throw setsError;
      await supabase.from("sessions").delete().eq("user_id", user.id);
      const programIds =
        (
          await supabase.from("programs").select("id").eq("user_id", user.id)
        ).data?.map((p) => p.id) ?? [];
      if (programIds.length > 0) {
        const dayIds =
          (
            await supabase
              .from("program_days")
              .select("id")
              .in("program_id", programIds)
          ).data?.map((d) => d.id) ?? [];
        if (dayIds.length > 0)
          await supabase
            .from("program_exercises")
            .delete()
            .in("program_day_id", dayIds);
        await supabase
          .from("program_days")
          .delete()
          .in("program_id", programIds);
      }
      await supabase.from("programs").delete().eq("user_id", user.id);
      await supabase.from("profiles").delete().eq("id", user.id);
      await supabase.auth.signOut();
      router.replace("/(auth)/login");
    } catch (err) {
      Alert.alert("Error", "Could not delete account. Please try again.");
    } finally {
      setDeletingAccount(false);
    }
  }

  function getInitials(name: string) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  function displayWeight(kg: number | null, unit: WeightUnit) {
    if (!kg) return "—";
    if (unit === "lbs") return `${(kg * 2.20462).toFixed(1)} lbs`;
    return `${kg} kg`;
  }

  function displayHeight(cm: number | null, unit: HeightUnit) {
    if (!cm) return "—";
    if (unit === "ft") {
      const totalInches = cm / 2.54;
      const feet = Math.floor(totalInches / 12);
      const inches = Math.round(totalInches % 12);
      return `${feet}'${inches}"`;
    }
    return `${cm} cm`;
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#800000" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Avatar */}
      <View style={styles.headerSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {getInitials(profile?.display_name ?? "U")}
          </Text>
        </View>
        <Text style={styles.displayName}>{profile?.display_name}</Text>
        <Text style={styles.emailText}>{email}</Text>
      </View>

      {/* Account */}
      <Text style={styles.sectionLabel}>Account</Text>
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.row}
          onPress={openEditName}
          activeOpacity={0.7}
        >
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: "#1f1a1a" }]}>
              <Text style={{ color: "#800000", fontSize: 16 }}>✎</Text>
            </View>
            <Text style={styles.rowLabel}>Display name</Text>
          </View>
          <View style={styles.rowRight}>
            <Text style={styles.rowValue}>{profile?.display_name}</Text>
            <Text style={styles.chevron}>›</Text>
          </View>
        </TouchableOpacity>
        <View style={[styles.row, { borderBottomWidth: 0 }]}>
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: "#1a1a1f" }]}>
              <Text style={{ color: "#5577aa", fontSize: 14 }}>@</Text>
            </View>
            <Text style={styles.rowLabel}>Email</Text>
          </View>
          <Text style={styles.rowValue}>{email}</Text>
        </View>
      </View>

      {/* Body Stats */}
      <Text style={styles.sectionLabel}>Body Stats</Text>
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.row}
          onPress={openStatsModal}
          activeOpacity={0.7}
        >
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: "#1a1f1a" }]}>
              <Text style={{ fontSize: 15 }}>📋</Text>
            </View>
            <Text style={styles.rowLabel}>Weight</Text>
          </View>
          <View style={styles.rowRight}>
            <Text style={styles.rowValue}>
              {displayWeight(
                profile?.weight_kg ?? null,
                profile?.weight_unit ?? "kg",
              )}
            </Text>
            <Text style={styles.chevron}>›</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.row}
          onPress={openStatsModal}
          activeOpacity={0.7}
        >
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: "#1a1a1f" }]}>
              <Text style={{ fontSize: 15 }}>📏</Text>
            </View>
            <Text style={styles.rowLabel}>Height</Text>
          </View>
          <View style={styles.rowRight}>
            <Text style={styles.rowValue}>
              {displayHeight(
                profile?.height_cm ?? null,
                profile?.height_unit ?? "cm",
              )}
            </Text>
            <Text style={styles.chevron}>›</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.row}
          onPress={openStatsModal}
          activeOpacity={0.7}
        >
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: "#1f1f1a" }]}>
              <Text style={{ fontSize: 15 }}>🎯</Text>
            </View>
            <Text style={styles.rowLabel}>Goal</Text>
          </View>
          <View style={styles.rowRight}>
            <Text style={styles.rowValue}>{profile?.fitness_goal ?? "—"}</Text>
            <Text style={styles.chevron}>›</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.row, { borderBottomWidth: 0 }]}
          onPress={openStatsModal}
          activeOpacity={0.7}
        >
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: "#1a1f1f" }]}>
              <Text style={{ fontSize: 15 }}>🎂</Text>
            </View>
            <Text style={styles.rowLabel}>Age</Text>
          </View>
          <View style={styles.rowRight}>
            <Text style={styles.rowValue}>
              {profile?.age ? `${profile.age} yrs` : "—"}
            </Text>
            <Text style={styles.chevron}>›</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Preferences */}
      <Text style={styles.sectionLabel}>Preferences</Text>
      <View style={styles.card}>
        <View style={[styles.row, { borderBottomWidth: 0 }]}>
          <View style={styles.rowLeft}>
            <View style={[styles.rowIcon, { backgroundColor: "#1a1f1a" }]}>
              <Text style={{ color: "#448844", fontSize: 15 }}>⚖</Text>
            </View>
            <Text style={styles.rowLabel}>Weight unit</Text>
          </View>
          <View style={styles.unitToggle}>
            {(["kg", "lbs"] as WeightUnit[]).map((u) => (
              <TouchableOpacity
                key={u}
                style={[
                  styles.unitBtn,
                  profile?.weight_unit === u && styles.unitBtnActive,
                ]}
                onPress={() => handleWeightUnitToggle(u)}
              >
                <Text
                  style={
                    profile?.weight_unit === u
                      ? styles.unitBtnTextActive
                      : styles.unitBtnTextInactive
                  }
                >
                  {u}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={styles.logoutBtn}
        onPress={handleLogout}
        activeOpacity={0.8}
      >
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => {
          setDeleteConfirmText("");
          setDeleteVisible(true);
        }}
        activeOpacity={0.8}
      >
        <Text style={styles.deleteText}>Delete account</Text>
      </TouchableOpacity>
      <Text style={styles.versionText}>Apex Track v1.0.0</Text>

      {/* Edit name modal */}
      <Modal visible={editNameVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit display name</Text>
            <TextInput
              style={styles.modalInput}
              value={editNameValue}
              onChangeText={setEditNameValue}
              placeholder="Your name"
              placeholderTextColor="#555"
              maxLength={40}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setEditNameVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, savingName && { opacity: 0.6 }]}
                onPress={handleSaveName}
                disabled={savingName}
              >
                {savingName ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSaveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Body Stats modal */}
      <Modal
        visible={showStatsModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowStatsModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.sheetContainer}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.sheetTopBar}>
            <TouchableOpacity
              onPress={() => setShowStatsModal(false)}
              style={styles.sheetCloseBtn}
            >
              <Text style={styles.sheetCloseBtnText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.sheetTitle}>Body Stats</Text>
            <View style={{ width: 36 }} />
          </View>
          <ScrollView
            contentContainerStyle={styles.sheetScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sheetLabel}>AGE</Text>
            <TextInput
              style={styles.sheetInput}
              placeholder="e.g. 25"
              placeholderTextColor="#333"
              value={editAge}
              onChangeText={setEditAge}
              keyboardType="number-pad"
            />

            <Text style={styles.sheetLabel}>WEIGHT</Text>
            <View style={styles.inputWithToggle}>
              <TextInput
                style={styles.sheetInputFlex}
                placeholder={editWeightUnit === "kg" ? "e.g. 75" : "e.g. 165"}
                placeholderTextColor="#333"
                value={editWeight}
                onChangeText={setEditWeight}
                keyboardType="decimal-pad"
              />
              <View style={styles.unitToggle}>
                {(["kg", "lbs"] as WeightUnit[]).map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[
                      styles.unitBtn,
                      editWeightUnit === u && styles.unitBtnActive,
                    ]}
                    onPress={() => setEditWeightUnit(u)}
                  >
                    <Text
                      style={[
                        styles.unitBtnTextInactive,
                        editWeightUnit === u && styles.unitBtnTextActive,
                      ]}
                    >
                      {u}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <Text style={styles.sheetLabel}>HEIGHT</Text>
            <View style={styles.inputWithToggle}>
              <TextInput
                style={styles.sheetInputFlex}
                placeholder={editHeightUnit === "cm" ? "e.g. 175" : "e.g. 5.9"}
                placeholderTextColor="#333"
                value={editHeight}
                onChangeText={setEditHeight}
                keyboardType="decimal-pad"
              />
              <View style={styles.unitToggle}>
                {(["cm", "ft"] as HeightUnit[]).map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[
                      styles.unitBtn,
                      editHeightUnit === u && styles.unitBtnActive,
                    ]}
                    onPress={() => setEditHeightUnit(u)}
                  >
                    <Text
                      style={[
                        styles.unitBtnTextInactive,
                        editHeightUnit === u && styles.unitBtnTextActive,
                      ]}
                    >
                      {u}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <Text style={styles.sheetLabel}>GENDER</Text>
            <View style={styles.chipGrid}>
              {GENDERS.map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[styles.chip, editGender === g && styles.chipSelected]}
                  onPress={() => setEditGender((prev) => (prev === g ? "" : g))}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.chipText,
                      editGender === g && styles.chipTextSelected,
                    ]}
                  >
                    {g}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sheetLabel}>FITNESS GOAL</Text>
            <View style={styles.chipGrid}>
              {GOALS.map((goal) => (
                <TouchableOpacity
                  key={goal}
                  style={[
                    styles.chip,
                    editGoal === goal && styles.chipSelected,
                  ]}
                  onPress={() =>
                    setEditGoal((prev) => (prev === goal ? "" : goal))
                  }
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.chipText,
                      editGoal === goal && styles.chipTextSelected,
                    ]}
                  >
                    {goal}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.saveStatsBtn, savingStats && { opacity: 0.5 }]}
              onPress={handleSaveStats}
              disabled={savingStats}
              activeOpacity={0.85}
            >
              <Text style={styles.saveStatsBtnText}>
                {savingStats ? "Saving…" : "Save Stats"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete account modal */}
      <Modal visible={deleteVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete account</Text>
            <Text style={styles.deleteModalBody}>
              This will permanently delete your account and all your data. This
              cannot be undone.
            </Text>
            <Text style={styles.deleteModalPrompt}>
              Type{" "}
              <Text style={{ color: "#cc3333", fontWeight: "500" }}>
                DELETE
              </Text>{" "}
              to confirm.
            </Text>
            <TextInput
              style={[styles.modalInput, { borderColor: "#3a1a1a" }]}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder="DELETE"
              placeholderTextColor="#555"
              autoCapitalize="characters"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setDeleteVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.deleteConfirmBtn,
                  (deleteConfirmText !== "DELETE" || deletingAccount) && {
                    opacity: 0.4,
                  },
                ]}
                onPress={handleDeleteAccount}
                disabled={deleteConfirmText !== "DELETE" || deletingAccount}
              >
                {deletingAccount ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSaveText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050505" },
  content: { paddingBottom: 40 },
  centered: {
    flex: 1,
    backgroundColor: "#050505",
    alignItems: "center",
    justifyContent: "center",
  },
  headerSection: {
    alignItems: "center",
    paddingTop: 32,
    paddingBottom: 24,
    gap: 8,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#800000",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  avatarText: { color: "#fff", fontSize: 26, fontWeight: "500" },
  displayName: { color: "#fff", fontSize: 20, fontWeight: "500" },
  emailText: { color: "#666", fontSize: 13 },
  sectionLabel: {
    color: "#555",
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
  },
  card: {
    marginHorizontal: 16,
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: "#2a2a2a",
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { color: "#e0e0e0", fontSize: 14 },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowValue: { color: "#555", fontSize: 13 },
  chevron: { color: "#444", fontSize: 18 },
  unitToggle: {
    flexDirection: "row",
    backgroundColor: "#111",
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: "#333",
    overflow: "hidden",
  },
  unitBtn: { paddingVertical: 5, paddingHorizontal: 14 },
  unitBtnActive: { backgroundColor: "#800000" },
  unitBtnTextActive: { color: "#fff", fontSize: 13, fontWeight: "500" },
  unitBtnTextInactive: { color: "#555", fontSize: 13 },
  logoutBtn: {
    marginHorizontal: 16,
    marginTop: 24,
    backgroundColor: "#800000",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  logoutText: { color: "#fff", fontSize: 15, fontWeight: "500" },
  deleteBtn: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: "#3a1a1a",
    paddingVertical: 15,
    alignItems: "center",
  },
  deleteText: { color: "#8B1A1A", fontSize: 14 },
  versionText: {
    textAlign: "center",
    color: "#333",
    fontSize: 11,
    marginTop: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    padding: 24,
    gap: 16,
  },
  modalTitle: { color: "#fff", fontSize: 17, fontWeight: "500" },
  modalInput: {
    backgroundColor: "#111",
    borderWidth: 0.5,
    borderColor: "#333",
    borderRadius: 8,
    color: "#fff",
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  modalActions: { flexDirection: "row", gap: 12 },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: "#333",
  },
  modalCancelText: { color: "#888", fontSize: 14 },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: 13,
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: "#800000",
  },
  modalSaveText: { color: "#fff", fontSize: 14, fontWeight: "500" },
  deleteModalBody: { color: "#888", fontSize: 14, lineHeight: 20 },
  deleteModalPrompt: { color: "#aaa", fontSize: 13 },
  deleteConfirmBtn: {
    flex: 1,
    paddingVertical: 13,
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: "#8B1A1A",
  },

  // Body stats sheet
  sheetContainer: { flex: 1, backgroundColor: "#0a0a0a" },
  sheetTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
  },
  sheetCloseBtn: {
    width: 36,
    height: 36,
    backgroundColor: "#161616",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetCloseBtnText: { color: "#fff", fontSize: 14 },
  sheetTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  sheetScroll: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48 },
  sheetLabel: {
    color: "#555",
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 10,
    marginTop: 4,
  },
  sheetInput: {
    backgroundColor: "#161616",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#fff",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#222",
    marginBottom: 20,
  },
  inputWithToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  sheetInputFlex: {
    flex: 1,
    backgroundColor: "#161616",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#fff",
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#222",
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
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
  saveStatsBtn: {
    backgroundColor: "#800000",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  saveStatsBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
