import { signOutGoogle } from "@/lib/auth/google";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  Image,
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
  avatar_url: string | null;
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
          "display_name, avatar_url, weight_unit, height_unit, age, height_cm, weight_kg, gender, fitness_goal",
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
          await signOutGoogle();
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Call Edge Function FIRST before deleting any data
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        "https://vaqivrymjwlnlrxsducb.supabase.co/functions/v1/delete-account",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (!response.ok) {
        const body = await response.text();
        console.log("Edge function error:", body);
        throw new Error("Failed to delete auth account");
      }

      // Then clean up table data
      const { error: setsError } = await supabase
        .from("session_sets")
        .delete()
        .in(
          "session_id",
          (await supabase.from("sessions").select("id").eq("user_id", user.id))
            .data?.map((s) => s.id) ?? [],
        );
      if (setsError) throw setsError;
      await supabase.from("sessions").delete().eq("user_id", user.id);
      const programIds =
        (await supabase.from("programs").select("id").eq("user_id", user.id))
          .data?.map((p) => p.id) ?? [];
      if (programIds.length > 0) {
        const dayIds =
          (await supabase.from("program_days").select("id").in("program_id", programIds))
            .data?.map((d) => d.id) ?? [];
        if (dayIds.length > 0)
          await supabase.from("program_exercises").delete().in("program_day_id", dayIds);
        await supabase.from("program_days").delete().in("program_id", programIds);
      }
      await supabase.from("programs").delete().eq("user_id", user.id);
      await supabase.from("profiles").delete().eq("id", user.id);

      await supabase.auth.signOut();
      router.replace("/(auth)/login");
    } catch (err) {
      console.log("Delete account error:", err);
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
    <View style={styles.container}>
      {/* Dynamic Crimson Ambient Background Glow */}
      <LinearGradient
        colors={["rgba(140, 0, 0, 0.22)", "rgba(15, 5, 5, 0.4)", "#050505"]}
        locations={[0.0, 0.4, 0.85]}
        style={styles.absoluteGradient}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Avatar */}
        <View style={styles.headerSection}>
          <LinearGradient
            colors={["#b30000", "#550000", "#111111"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatarGradientBorder}
          >
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {getInitials(profile?.display_name ?? "U")}
                </Text>
              </View>
            )}
          </LinearGradient>
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
              <View style={styles.rowIcon}>
                <Ionicons name="person-outline" size={15} color="#b30000" />
              </View>
              <Text style={styles.rowLabel}>Display name</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>{profile?.display_name}</Text>
              <Ionicons name="chevron-forward" size={14} color="#444" />
            </View>
          </TouchableOpacity>
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <View style={styles.rowLeft}>
              <View style={styles.rowIcon}>
                <Ionicons name="mail-outline" size={15} color="#b30000" />
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
              <View style={styles.rowIcon}>
                <Ionicons name="barbell-outline" size={15} color="#b30000" />
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
              <Ionicons name="chevron-forward" size={14} color="#444" />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.row}
            onPress={openStatsModal}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <View style={styles.rowIcon}>
                <Ionicons name="resize-outline" size={15} color="#b30000" />
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
              <Ionicons name="chevron-forward" size={14} color="#444" />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.row}
            onPress={openStatsModal}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <View style={styles.rowIcon}>
                <Ionicons name="trophy-outline" size={15} color="#b30000" />
              </View>
              <Text style={styles.rowLabel}>Goal</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>{profile?.fitness_goal ?? "—"}</Text>
              <Ionicons name="chevron-forward" size={14} color="#444" />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.row, { borderBottomWidth: 0 }]}
            onPress={openStatsModal}
            activeOpacity={0.7}
          >
            <View style={styles.rowLeft}>
              <View style={styles.rowIcon}>
                <Ionicons name="calendar-clear-outline" size={15} color="#b30000" />
              </View>
              <Text style={styles.rowLabel}>Age</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>
                {profile?.age ? `${profile.age} yrs` : "—"}
              </Text>
              <Ionicons name="chevron-forward" size={14} color="#444" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Preferences */}
        <Text style={styles.sectionLabel}>Preferences</Text>
        <View style={styles.card}>
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <View style={styles.rowLeft}>
              <View style={styles.rowIcon}>
                <Ionicons name="options-outline" size={15} color="#b30000" />
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
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={16} color="#b30000" style={{ marginRight: 6 }} />
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => {
            setDeleteConfirmText("");
            setDeleteVisible(true);
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="trash-outline" size={14} color="#555" style={{ marginRight: 6 }} />
          <Text style={styles.deleteText}>Delete account</Text>
        </TouchableOpacity>
        <Text style={styles.versionText}>Apex Track v1.1.1</Text>
      </ScrollView>

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
              <Ionicons name="close" size={18} color="#fff" />
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
              placeholderTextColor="#555"
              value={editAge}
              onChangeText={setEditAge}
              keyboardType="number-pad"
            />

            <Text style={styles.sheetLabel}>WEIGHT</Text>
            <View style={styles.inputWithToggle}>
              <TextInput
                style={styles.sheetInputFlex}
                placeholder={editWeightUnit === "kg" ? "e.g. 75" : "e.g. 165"}
                placeholderTextColor="#555"
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
                placeholderTextColor="#555"
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
    bottom: 0,
  },
  content: { paddingBottom: 40 },
  centered: {
    flex: 1,
    backgroundColor: "#050505",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 38,
  },
  headerSection: {
    alignItems: "center",
    paddingTop: 32,
    paddingBottom: 24,
    gap: 8,
  },
  avatarGradientBorder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    padding: 2, // Spacing for gradient border
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#b30000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
    marginBottom: 8,
  },
  avatar: {
    width: "100%",
    height: "100%",
    borderRadius: 38,
    backgroundColor: "#121212",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 26, fontWeight: "600" },
  displayName: { color: "#fff", fontSize: 20, fontWeight: "600" },
  emailText: { color: "#666", fontSize: 13 },
  sectionLabel: {
    color: "#444",
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
    fontWeight: "700",
  },
  card: {
    marginHorizontal: 16,
    backgroundColor: "#0d0d0d",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#161616",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: "#181818",
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(179, 0, 0, 0.08)",
  },
  rowLabel: { color: "#e0e0e0", fontSize: 14, fontWeight: "500" },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowValue: { color: "#888", fontSize: 13 },
  chevron: { color: "#444", fontSize: 18 },
  unitToggle: {
    flexDirection: "row",
    backgroundColor: "#111",
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: "#222",
    overflow: "hidden",
  },
  unitBtn: { paddingVertical: 5, paddingHorizontal: 14 },
  unitBtnActive: { backgroundColor: "#b30000" },
  unitBtnTextActive: { color: "#fff", fontSize: 13, fontWeight: "600" },
  unitBtnTextInactive: { color: "#555", fontSize: 13 },
  logoutBtn: {
    marginHorizontal: 16,
    marginTop: 24,
    backgroundColor: "transparent",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#b30000",
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  logoutText: { color: "#b30000", fontSize: 15, fontWeight: "600" },
  deleteBtn: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteText: { color: "#555", fontSize: 13, fontWeight: "500" },
  versionText: {
    textAlign: "center",
    color: "#2a2a2a",
    fontSize: 11,
    marginTop: 28,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#0d0d0d",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1a1a1a",
    padding: 24,
    gap: 16,
  },
  modalTitle: { color: "#fff", fontSize: 17, fontWeight: "600" },
  modalInput: {
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#222",
    borderRadius: 10,
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
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#222",
  },
  modalCancelText: { color: "#888", fontSize: 14 },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: 13,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#b30000",
  },
  modalSaveText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  deleteModalBody: { color: "#888", fontSize: 14, lineHeight: 20 },
  deleteModalPrompt: { color: "#aaa", fontSize: 13 },
  deleteConfirmBtn: {
    flex: 1,
    paddingVertical: 13,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#b30000",
  },

  // Body stats sheet
  sheetContainer: { flex: 1, backgroundColor: "#070707" },
  sheetTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#161616",
  },
  sheetCloseBtn: {
    width: 36,
    height: 36,
    backgroundColor: "#121212",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#222",
  },
  sheetTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },
  sheetScroll: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48 },
  sheetLabel: {
    color: "#555",
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 10,
    marginTop: 4,
    fontWeight: "700",
  },
  sheetInput: {
    backgroundColor: "#121212",
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
    backgroundColor: "#121212",
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
    marginBottom: 24,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#222",
  },
  chipSelected: {
    backgroundColor: "rgba(179, 0, 0, 0.12)",
    borderColor: "#b30000",
  },
  chipText: { color: "#888", fontSize: 13, fontWeight: "500" },
  chipTextSelected: { color: "#fff", fontWeight: "600" },
  saveStatsBtn: {
    backgroundColor: "#b30000",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  saveStatsBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
