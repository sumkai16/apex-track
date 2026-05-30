import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

export default function ProfileScreen() {
    return (
        <View style={styles.container}>
            <Text style={styles.text}>Profile</Text>
        </View>
    )
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#050505', justifyContent: 'center', alignItems: 'center' },
    text: { color: '#fff', fontSize: 20 },
})