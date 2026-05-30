import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native'
import { supabase } from '../../lib/supabase'

interface RecentSession {
    id: string
    program_day_id: string
    started_at: string
    status: string
    program_days: { name: string } | null
}

export default function HomeScreen() {
    const [displayName, setDisplayName] = useState('')
    const [recentSessions, setRecentSessions] = useState<RecentSession[]>([])

    useEffect(() => {
        fetchProfile()
        fetchRecentSessions()
    }, [])

    async function fetchProfile() {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('id', user.id)
            .single()
        if (data) setDisplayName(data.display_name)
    }

    async function fetchRecentSessions() {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data } = await supabase
            .from('sessions')
            .select('id, program_day_id, started_at, status, program_days(name)')
            .eq('user_id', user.id)
            .eq('status', 'completed')
            .order('started_at', { ascending: false })
            .limit(3)
        if (data) setRecentSessions(data as RecentSession[])
    }

    function getGreeting() {
        const hour = new Date().getHours()
        if (hour < 12) return 'Good morning'
        if (hour < 17) return 'Good afternoon'
        return 'Good evening'
    }

    function formatDate(dateStr: string) {
        const date = new Date(dateStr)
        const now = new Date()
        const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
        if (diff === 0) return 'Today'
        if (diff === 1) return 'Yesterday'
        return `${diff} days ago`
    }

    async function handleLogout() {
        await supabase.auth.signOut()
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                <View style={styles.header}>
                    <View>
                        <Text style={styles.greeting}>{getGreeting()}</Text>
                        <Text style={styles.name}>{displayName || 'Athlete'} 👊</Text>
                    </View>
                    <TouchableOpacity style={styles.settingsButton} onPress={handleLogout}>
                        <Text style={styles.settingsIcon}>⚙</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity
                    style={styles.heroCard}
                    onPress={() => router.push('/(tabs)/log')}
                    activeOpacity={0.85}
                >
                    <Text style={styles.heroLabel}>TODAY'S WORKOUT</Text>
                    <Text style={styles.heroTitle}>Ready to train?</Text>
                    <Text style={styles.heroSub}>Tap to start a session</Text>
                    <View style={styles.startButton}>
                        <Text style={styles.startText}>Start Session</Text>
                        <Text style={styles.startIcon}>▶</Text>
                    </View>
                </TouchableOpacity>

                <Text style={styles.sectionTitle}>RECENT SESSIONS</Text>

                {recentSessions.length === 0 ? (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyText}>No sessions yet. Start your first workout!</Text>
                    </View>
                ) : (
                    recentSessions.map((session) => (
                        <View key={session.id} style={styles.sessionCard}>
                            <View style={styles.sessionRow}>
                                <Text style={styles.sessionName}>
                                    {session.program_days?.name || 'Workout'}
                                </Text>
                                <Text style={styles.sessionDate}>{formatDate(session.started_at)}</Text>
                            </View>
                            <View style={styles.sessionMeta}>
                                <Text style={styles.sessionCheck}>✓</Text>
                                <Text style={styles.sessionInfo}>Completed</Text>
                            </View>
                        </View>
                    ))
                )}

            </ScrollView>
        </View>
    )
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#050505' },
    scroll: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 24 },
    header: {
        flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 24,
    },
    greeting: { color: '#555', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 },
    name: { color: '#fff', fontSize: 22, fontWeight: '700' },
    settingsButton: {
        width: 36, height: 36, backgroundColor: '#111',
        borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    },
    settingsIcon: { color: '#800000', fontSize: 16 },
    heroCard: {
        backgroundColor: '#800000', borderRadius: 16,
        padding: 20, marginBottom: 24,
    },
    heroLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 10, letterSpacing: 1, marginBottom: 6 },
    heroTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 4 },
    heroSub: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 16 },
    startButton: {
        backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 10,
        padding: 14, flexDirection: 'row',
        alignItems: 'center', justifyContent: 'space-between',
    },
    startText: { color: '#fff', fontSize: 14, fontWeight: '600' },
    startIcon: { color: '#fff', fontSize: 16 },
    sectionTitle: {
        color: '#555', fontSize: 11, letterSpacing: 1,
        marginBottom: 12, textTransform: 'uppercase',
    },
    emptyCard: {
        backgroundColor: '#111', borderRadius: 14,
        padding: 20, alignItems: 'center',
    },
    emptyText: { color: '#444', fontSize: 13, textAlign: 'center' },
    sessionCard: {
        backgroundColor: '#111', borderRadius: 14,
        padding: 16, marginBottom: 10,
    },
    sessionRow: {
        flexDirection: 'row', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 8,
    },
    sessionName: { color: '#fff', fontSize: 14, fontWeight: '600' },
    sessionDate: { color: '#555', fontSize: 11 },
    sessionMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    sessionCheck: { color: '#800000', fontSize: 11 },
    sessionInfo: { color: '#555', fontSize: 12 },
})