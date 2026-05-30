import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { supabase } from '../lib/supabase'

export default function HomeScreen() {
    async function handleLogout() {
        await supabase.auth.signOut()
    }

    return (
        <View style={styles.container}>
            <Text style={styles.text}>You're logged in!</Text>
            <TouchableOpacity style={styles.button} onPress={handleLogout}>
                <Text style={styles.buttonText}>Log Out</Text>
            </TouchableOpacity>
        </View>
    )
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#050505', justifyContent: 'center', alignItems: 'center' },
    text: { color: '#fff', fontSize: 20, marginBottom: 24 },
    button: { backgroundColor: '#800000', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
    buttonText: { color: '#fff', fontWeight: 'bold' },
})