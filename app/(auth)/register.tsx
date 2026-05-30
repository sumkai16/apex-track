import { Link, router } from 'expo-router'
import { useState } from 'react'
import {
    Alert, KeyboardAvoidingView, Platform,
    StyleSheet,
    Text, TextInput, TouchableOpacity,
    View
} from 'react-native'
import { supabase } from '../../lib/supabase'

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
        setLoading(true)
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) {
            setLoading(false)
            Alert.alert('Registration failed', error.message)
            return
        }
        if (data.user) {
            await supabase.from('profiles').insert({
                id: data.user.id,
                display_name: displayName,
            })
        }
        setLoading(false)
        Alert.alert('Success', 'Account created! You can now log in.', [
            { text: 'OK', onPress: () => router.replace('/(auth)/login') }
        ])
    }

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <View style={styles.inner}>
                <Text style={styles.logo}>APEX TRACK</Text>
                <Text style={styles.subtitle}>Create your account</Text>

                <TextInput
                    style={styles.input}
                    placeholder="Display name"
                    placeholderTextColor="#666"
                    value={displayName}
                    onChangeText={setDisplayName}
                />
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
                    onPress={handleRegister}
                    disabled={loading}
                >
                    <Text style={styles.buttonText}>
                        {loading ? 'Creating account...' : 'Register'}
                    </Text>
                </TouchableOpacity>

                <Link href="/(auth)/login" asChild>
                    <TouchableOpacity style={styles.linkButton}>
                        <Text style={styles.linkText}>
                            Already have an account? <Text style={styles.linkAccent}>Log in</Text>
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
        fontSize: 32, fontWeight: 'bold', color: '#800000',
        textAlign: 'center', letterSpacing: 4, marginBottom: 8
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