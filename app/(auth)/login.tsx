import { Link, router } from 'expo-router'
import React, { useState } from 'react'
import {
    Alert, Image, KeyboardAvoidingView, Platform,
    StyleSheet, Text, TextInput, TouchableOpacity,
    View
} from 'react-native'
import { supabase } from '../../lib/supabase'
export default function LoginScreen() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)

    async function handleLogin() {
        if (!email || !password) {
            Alert.alert('Error', 'Please fill in all fields')
            return
        }
        setLoading(true)
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        setLoading(false)
        if (error) {
            Alert.alert('Login failed', error.message)
        } else {
            router.replace('/')
        }
    }

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <View style={styles.inner}>
                <Image source={require('../../assets/images/logo2.png')} style={styles.logo} />
                <Text style={styles.subtitle}>Welcome back</Text>

                <TextInput
                    style={styles.input}
                    placeholder="Email"
                    placeholderTextColor="#666"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                />
                <TextInput
                    style={styles.input}
                    placeholder="Password"
                    placeholderTextColor="#666"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                />

                <TouchableOpacity
                    style={[styles.button, loading && styles.buttonDisabled]}
                    onPress={handleLogin}
                    disabled={loading}
                >
                    <Text style={styles.buttonText}>
                        {loading ? 'Logging in...' : 'Log In'}
                    </Text>
                </TouchableOpacity>

                <Link href="/(auth)/register" asChild>
                    <TouchableOpacity style={styles.linkButton}>
                        <Text style={styles.linkText}>
                            Don't have an account? <Text style={styles.linkAccent}>Register</Text>
                        </Text>
                    </TouchableOpacity>
                </Link>
            </View>
        </KeyboardAvoidingView>
    )
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#050505' },
    inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
    logo: {
        width: 340,
        height: 140,
        alignSelf: 'center',
        marginBottom: 24,
    },
    subtitle: {
        fontSize: 16, color: '#666',
        textAlign: 'center', marginBottom: 40
    },
    input: {
        backgroundColor: '#333333', color: '#fff',
        borderRadius: 8, paddingHorizontal: 16, paddingVertical: 14,
        fontSize: 16, marginBottom: 12
    },
    button: {
        backgroundColor: '#800000', borderRadius: 8,
        paddingVertical: 16, alignItems: 'center', marginTop: 8
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
    linkButton: { marginTop: 24, alignItems: 'center' },
    linkText: { color: '#666', fontSize: 14 },
    linkAccent: { color: '#800000', fontWeight: 'bold' },
})