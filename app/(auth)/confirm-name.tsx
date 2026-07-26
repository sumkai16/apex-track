// app/(auth)/confirm-name.tsx
import { supabase } from '@/lib/supabase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { registeringFlag } from '../_layout';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function ConfirmNameScreen() {
    const router = useRouter();
    const { suggestedName, avatarUrl } = useLocalSearchParams<{ suggestedName?: string; avatarUrl?: string }>();
    const [name, setName] = useState(suggestedName ?? '');
    const [saving, setSaving] = useState(false);

    async function handleContinue() {
        if (!name.trim()) {
            Alert.alert('Name required', 'Please enter a display name.');
            return;
        }
        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('No active session');

            const { error } = await supabase.from('profiles').insert({
                id: user.id,
                display_name: name.trim(),
                avatar_url: avatarUrl || null,
            });
            if (error) throw error;

            registeringFlag.value = false;
            router.replace('/(tabs)/home');
        } catch (err: any) {
            Alert.alert("Couldn't save profile", err.message ?? 'Please try again.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <View style={styles.container}>
            {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatar} /> : null}
            <Text style={styles.title}>Welcome to Apex Track</Text>
            <Text style={styles.subtitle}>Confirm your display name</Text>
            <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Display name"
                placeholderTextColor="#666"
                autoFocus
            />
            <TouchableOpacity style={styles.button} onPress={handleContinue} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Continue</Text>}
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#050505', alignItems: 'center', justifyContent: 'center', padding: 24 },
    avatar: { width: 96, height: 96, borderRadius: 48, marginBottom: 24 },
    title: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 8 },
    subtitle: { color: '#999', fontSize: 14, marginBottom: 24 },
    input: { width: '100%', backgroundColor: '#333333', color: '#fff', borderRadius: 8, padding: 14, fontSize: 16, marginBottom: 24 },
    button: { backgroundColor: '#800000', borderRadius: 8, paddingVertical: 14, paddingHorizontal: 32, width: '100%', alignItems: 'center' },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});