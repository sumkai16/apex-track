import { Link, router } from 'expo-router'
import React, { useState } from 'react'
import {
    Alert, Image, KeyboardAvoidingView, Platform,
    ScrollView, StyleSheet, Text, TextInput,
    TouchableOpacity, View
} from 'react-native'
import { supabase } from '../../lib/supabase'
import { registeringFlag } from '../_layout'
export default function RegisterScreen() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [displayName, setDisplayName] = useState('')
    const [loading, setLoading] = useState(false)

    async function handleRegister() {
        if (!email || !password || !displayName) {
            Alert.alert('Error', 'Please fill in all fields')
            return
        }
        if (password.length < 6) {
            Alert.alert('Error', 'Password must be at least 6 characters')
            return
        }

        registeringFlag.value = true
        setLoading(true)

        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) {
            registeringFlag.value = false
            setLoading(false)
            Alert.alert('Registration failed', error.message)
            return
        }

        if (data.user) {
            await supabase.from('profiles').insert({
                id: data.user.id,
                display_name: displayName,
            })
            await supabase.auth.signOut()
        }

        setLoading(false)
        registeringFlag.value = false
        Alert.alert('Success', 'Account created! You can now log in.', [
            { text: 'OK', onPress: () => router.replace('/(auth)/login') }
        ])
    }

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
                <View style={styles.logoContainer}>
                    <Image
                        source={require('../../assets/images/logo.png')}
                        style={styles.logo}
                        resizeMode="contain"
                    />
                    <Text style={styles.title}>Create account</Text>
                    <Text style={styles.subtitle}>Start tracking your gains</Text>
                </View>

                <View style={styles.form}>
                    <Text style={styles.label}>DISPLAY NAME</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="e.g. Axcee"
                        placeholderTextColor="#444"
                        value={displayName}
                        onChangeText={setDisplayName}
                    />

                    <Text style={styles.label}>EMAIL</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="you@email.com"
                        placeholderTextColor="#444"
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        keyboardType="email-address"
                    />

                    <Text style={styles.label}>PASSWORD</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="••••••••"
                        placeholderTextColor="#444"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                    />
                </View>

                <TouchableOpacity
                    style={[styles.button, loading && styles.buttonDisabled]}
                    onPress={handleRegister}
                    disabled={loading}
                >
                    <Text style={styles.buttonText}>
                        {loading ? 'Creating account...' : 'CREATE ACCOUNT'}
                    </Text>
                </TouchableOpacity>

                <View style={styles.dividerRow}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>or continue with</Text>
                    <View style={styles.dividerLine} />
                </View>

                <View style={styles.socialRow}>
                    <TouchableOpacity style={styles.socialButton}>
                        <Image
                            source={require('../../assets/images/fb.png')}
                            style={styles.socialIcon}
                            resizeMode="contain"
                        />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.socialButton}>
                        <Image
                            source={require('../../assets/images/gmail.png')}
                            style={styles.socialIcon}
                            resizeMode="contain"
                        />
                    </TouchableOpacity>
                </View>

                <Link href="/(auth)/login" asChild>
                    <TouchableOpacity style={styles.linkButton}>
                        <Text style={styles.linkText}>
                            Have an account? <Text style={styles.linkAccent}>Log in</Text>
                        </Text>
                    </TouchableOpacity>
                </Link>
            </ScrollView>
        </KeyboardAvoidingView>
    )
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#050505' },
    inner: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
    logoContainer: { alignItems: 'center', marginBottom: 36 },
    logo: { width: 340, height: 180, marginBottom: 16 },
    title: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 4 },
    subtitle: { color: '#555', fontSize: 13 },
    form: { marginBottom: 20 },
    label: {
        color: '#888', fontSize: 11, letterSpacing: 1,
        marginBottom: 6, marginTop: 14,
    },
    input: {
        backgroundColor: '#111', color: '#fff',
        borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14,
        fontSize: 14,
    },
    button: {
        backgroundColor: '#800000', borderRadius: 12,
        paddingVertical: 16, alignItems: 'center', marginBottom: 20,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 1 },
    dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    dividerLine: { flex: 1, height: 1, backgroundColor: '#222' },
    dividerText: { color: '#444', fontSize: 12, marginHorizontal: 10 },
    socialRow: { flexDirection: 'row', gap: 12, marginBottom: 28 },

    socialButton: {
        flex: 1, backgroundColor: '#111',
        borderRadius: 10, paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
    },
    socialIcon: { width: 24, height: 24 },
    linkButton: { alignItems: 'center' },
    linkText: { color: '#555', fontSize: 13 },
    linkAccent: { color: '#800000', fontWeight: '600' },
})