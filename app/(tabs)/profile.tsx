import { supabase } from '@/lib/supabase';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
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
} from 'react-native';

type WeightUnit = 'kg' | 'lbs';

interface Profile {
    display_name: string;
    weight_unit: WeightUnit;
}

export default function ProfileScreen() {
    const router = useRouter();

    const [profile, setProfile] = useState<Profile | null>(null);
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(true);
    const [savingUnit, setSavingUnit] = useState(false);

    const [editNameVisible, setEditNameVisible] = useState(false);
    const [editNameValue, setEditNameValue] = useState('');
    const [savingName, setSavingName] = useState(false);

    const [deleteVisible, setDeleteVisible] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [deletingAccount, setDeletingAccount] = useState(false);

    useFocusEffect(
        useCallback(() => {
            fetchProfile();
        }, [])
    );

    async function fetchProfile() {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            setEmail(user.email ?? '');

            const { data, error } = await supabase
                .from('profiles')
                .select('display_name, weight_unit')
                .eq('id', user.id)
                .single();

            if (error) throw error;
            setProfile(data);
        } catch (err) {
            Alert.alert('Error', 'Could not load profile.');
        } finally {
            setLoading(false);
        }
    }

    async function handleWeightUnitToggle(unit: WeightUnit) {
        if (unit === profile?.weight_unit) return;

        // Optimistic update first — UI feels instant
        const previous = profile?.weight_unit;
        setProfile(prev => prev ? { ...prev, weight_unit: unit } : prev);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setProfile(prev => prev ? { ...prev, weight_unit: previous! } : prev);
                return;
            }

            const { error } = await supabase
                .from('profiles')
                .update({ weight_unit: unit })
                .eq('id', user.id);

            if (error) {
                setProfile(prev => prev ? { ...prev, weight_unit: previous! } : prev);
                Alert.alert('Error', 'Could not update weight unit.');
            }
        } catch {
            setProfile(prev => prev ? { ...prev, weight_unit: previous! } : prev);
            Alert.alert('Error', 'Could not update weight unit.');
        }
    }

    function openEditName() {
        setEditNameValue(profile?.display_name ?? '');
        setEditNameVisible(true);
    }

    async function handleSaveName() {
        const trimmed = editNameValue.trim();
        if (!trimmed) {
            Alert.alert('Invalid name', 'Display name cannot be empty.');
            return;
        }
        setSavingName(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { error } = await supabase
                .from('profiles')
                .update({ display_name: trimmed })
                .eq('id', user.id);

            if (error) throw error;
            setProfile(prev => prev ? { ...prev, display_name: trimmed } : prev);
            setEditNameVisible(false);
        } catch {
            Alert.alert('Error', 'Could not update display name.');
        } finally {
            setSavingName(false);
        }
    }

    async function handleLogout() {
        Alert.alert('Log out', 'Are you sure you want to log out?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Log out',
                style: 'destructive',
                onPress: async () => {
                    await supabase.auth.signOut();
                    router.replace('/(auth)/login');
                },
            },
        ]);
    }

    async function handleDeleteAccount() {
        if (deleteConfirmText !== 'DELETE') return;
        setDeletingAccount(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Delete all user data — RLS cascades handle the rest
            // Order matters: sets → sessions → program_exercises → program_days → programs → profile
            const { error: setsError } = await supabase
                .from('session_sets')
                .delete()
                .in(
                    'session_id',
                    (await supabase.from('sessions').select('id').eq('user_id', user.id)).data?.map(s => s.id) ?? []
                );
            if (setsError) throw setsError;

            await supabase.from('sessions').delete().eq('user_id', user.id);

            const programIds = (
                await supabase.from('programs').select('id').eq('user_id', user.id)
            ).data?.map(p => p.id) ?? [];

            if (programIds.length > 0) {
                const dayIds = (
                    await supabase.from('program_days').select('id').in('program_id', programIds)
                ).data?.map(d => d.id) ?? [];

                if (dayIds.length > 0) {
                    await supabase.from('program_exercises').delete().in('program_day_id', dayIds);
                }
                await supabase.from('program_days').delete().in('program_id', programIds);
            }

            await supabase.from('programs').delete().eq('user_id', user.id);
            await supabase.from('profiles').delete().eq('id', user.id);

            // Sign out — Supabase doesn't expose client-side user deletion,
            // so the auth record cleanup should be handled by a Supabase edge function or admin API.
            // For now, sign out and let the account become orphaned in auth.users.
            // TODO: wire up a Supabase Edge Function to call admin.deleteUser(user.id)
            await supabase.auth.signOut();
            router.replace('/(auth)/login');
        } catch (err) {
            Alert.alert('Error', 'Could not delete account. Please try again.');
        } finally {
            setDeletingAccount(false);
        }
    }

    function getInitials(name: string) {
        return name
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
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

            {/* Avatar + name + email */}
            <View style={styles.headerSection}>
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                        {getInitials(profile?.display_name ?? 'U')}
                    </Text>
                </View>
                <Text style={styles.displayName}>{profile?.display_name}</Text>
                <Text style={styles.emailText}>{email}</Text>
            </View>

            {/* Account section */}
            <Text style={styles.sectionLabel}>Account</Text>
            <View style={styles.card}>
                <TouchableOpacity style={styles.row} onPress={openEditName} activeOpacity={0.7}>
                    <View style={styles.rowLeft}>
                        <View style={[styles.rowIcon, { backgroundColor: '#1f1a1a' }]}>
                            <Text style={{ color: '#800000', fontSize: 16 }}>✎</Text>
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
                        <View style={[styles.rowIcon, { backgroundColor: '#1a1a1f' }]}>
                            <Text style={{ color: '#5577aa', fontSize: 14 }}>@</Text>
                        </View>
                        <Text style={styles.rowLabel}>Email</Text>
                    </View>
                    <Text style={styles.rowValue}>{email}</Text>
                </View>
            </View>

            {/* Preferences section */}
            <Text style={styles.sectionLabel}>Preferences</Text>
            <View style={styles.card}>
                <View style={[styles.row, { borderBottomWidth: 0 }]}>
                    <View style={styles.rowLeft}>
                        <View style={[styles.rowIcon, { backgroundColor: '#1a1f1a' }]}>
                            <Text style={{ color: '#448844', fontSize: 15 }}>⚖</Text>
                        </View>
                        <Text style={styles.rowLabel}>Weight unit</Text>
                    </View>
                    <View style={styles.unitToggle}>
                        <TouchableOpacity
                            style={[
                                styles.unitBtn,
                                profile?.weight_unit === 'kg' && styles.unitBtnActive,
                            ]}
                            onPress={() => handleWeightUnitToggle('kg')}
                        >
                            <Text
                                style={
                                    profile?.weight_unit === 'kg'
                                        ? styles.unitBtnTextActive
                                        : styles.unitBtnTextInactive
                                }
                            >
                                kg
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.unitBtn,
                                profile?.weight_unit === 'lbs' && styles.unitBtnActive,
                            ]}
                            onPress={() => handleWeightUnitToggle('lbs')}
                        >
                            <Text
                                style={
                                    profile?.weight_unit === 'lbs'
                                        ? styles.unitBtnTextActive
                                        : styles.unitBtnTextInactive
                                }
                            >
                                lbs
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>

            {/* Actions */}
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
                <Text style={styles.logoutText}>Log out</Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => { setDeleteConfirmText(''); setDeleteVisible(true); }}
                activeOpacity={0.8}
            >
                <Text style={styles.deleteText}>Delete account</Text>
            </TouchableOpacity>

            <Text style={styles.versionText}>Apex Track v1.0.0</Text>

            {/* Edit name modal */}
            <Modal visible={editNameVisible} transparent animationType="fade">
                <KeyboardAvoidingView
                    style={styles.modalOverlay}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
                                {savingName
                                    ? <ActivityIndicator color="#fff" size="small" />
                                    : <Text style={styles.modalSaveText}>Save</Text>
                                }
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* Delete account modal */}
            <Modal visible={deleteVisible} transparent animationType="fade">
                <KeyboardAvoidingView
                    style={styles.modalOverlay}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Delete account</Text>
                        <Text style={styles.deleteModalBody}>
                            This will permanently delete your account and all your data — programs, sessions, and progress. This cannot be undone.
                        </Text>
                        <Text style={styles.deleteModalPrompt}>
                            Type <Text style={{ color: '#cc3333', fontWeight: '500' }}>DELETE</Text> to confirm.
                        </Text>
                        <TextInput
                            style={[styles.modalInput, { borderColor: '#3a1a1a' }]}
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
                                    (deleteConfirmText !== 'DELETE' || deletingAccount) && { opacity: 0.4 },
                                ]}
                                onPress={handleDeleteAccount}
                                disabled={deleteConfirmText !== 'DELETE' || deletingAccount}
                            >
                                {deletingAccount
                                    ? <ActivityIndicator color="#fff" size="small" />
                                    : <Text style={styles.modalSaveText}>Delete</Text>
                                }
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#050505',
    },
    content: {
        paddingBottom: 40,
    },
    centered: {
        flex: 1,
        backgroundColor: '#050505',
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Header
    headerSection: {
        alignItems: 'center',
        paddingTop: 32,
        paddingBottom: 24,
        gap: 8,
    },
    avatar: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: '#800000',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    avatarText: {
        color: '#fff',
        fontSize: 26,
        fontWeight: '500',
    },
    displayName: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '500',
    },
    emailText: {
        color: '#666',
        fontSize: 13,
    },

    // Section label
    sectionLabel: {
        color: '#555',
        fontSize: 11,
        letterSpacing: 1,
        textTransform: 'uppercase',
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 6,
    },

    // Card
    card: {
        marginHorizontal: 16,
        backgroundColor: '#1a1a1a',
        borderRadius: 12,
        overflow: 'hidden',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: 0.5,
        borderBottomColor: '#2a2a2a',
    },
    rowLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    rowIcon: {
        width: 30,
        height: 30,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rowLabel: {
        color: '#e0e0e0',
        fontSize: 14,
    },
    rowRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    rowValue: {
        color: '#555',
        fontSize: 13,
    },
    chevron: {
        color: '#444',
        fontSize: 18,
    },

    // Unit toggle
    unitToggle: {
        flexDirection: 'row',
        backgroundColor: '#111',
        borderRadius: 8,
        borderWidth: 0.5,
        borderColor: '#333',
        overflow: 'hidden',
    },
    unitBtn: {
        paddingVertical: 5,
        paddingHorizontal: 14,
    },
    unitBtnActive: {
        backgroundColor: '#800000',
    },
    unitBtnTextActive: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '500',
    },
    unitBtnTextInactive: {
        color: '#555',
        fontSize: 13,
    },

    // Buttons
    logoutBtn: {
        marginHorizontal: 16,
        marginTop: 24,
        backgroundColor: '#800000',
        borderRadius: 12,
        paddingVertical: 15,
        alignItems: 'center',
    },
    logoutText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '500',
    },
    deleteBtn: {
        marginHorizontal: 16,
        marginTop: 10,
        borderRadius: 12,
        borderWidth: 0.5,
        borderColor: '#3a1a1a',
        paddingVertical: 15,
        alignItems: 'center',
    },
    deleteText: {
        color: '#8B1A1A',
        fontSize: 14,
    },
    versionText: {
        textAlign: 'center',
        color: '#333',
        fontSize: 11,
        marginTop: 24,
    },

    // Modals
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        padding: 24,
    },
    modalCard: {
        backgroundColor: '#1a1a1a',
        borderRadius: 16,
        padding: 24,
        gap: 16,
    },
    modalTitle: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '500',
    },
    modalInput: {
        backgroundColor: '#111',
        borderWidth: 0.5,
        borderColor: '#333',
        borderRadius: 8,
        color: '#fff',
        fontSize: 15,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    modalActions: {
        flexDirection: 'row',
        gap: 12,
    },
    modalCancelBtn: {
        flex: 1,
        paddingVertical: 13,
        alignItems: 'center',
        borderRadius: 8,
        borderWidth: 0.5,
        borderColor: '#333',
    },
    modalCancelText: {
        color: '#888',
        fontSize: 14,
    },
    modalSaveBtn: {
        flex: 1,
        paddingVertical: 13,
        alignItems: 'center',
        borderRadius: 8,
        backgroundColor: '#800000',
    },
    modalSaveText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '500',
    },
    deleteModalBody: {
        color: '#888',
        fontSize: 14,
        lineHeight: 20,
    },
    deleteModalPrompt: {
        color: '#aaa',
        fontSize: 13,
    },
    deleteConfirmBtn: {
        flex: 1,
        paddingVertical: 13,
        alignItems: 'center',
        borderRadius: 8,
        backgroundColor: '#8B1A1A',
    },
});