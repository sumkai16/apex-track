import { useFocusEffect } from '@react-navigation/native'
import { router } from 'expo-router'
import { useCallback, useState } from 'react'
import {
    ActivityIndicator,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native'
import { supabase } from '../../lib/supabase'

interface ExerciseSummary {
    exercise_id: string
    exercise_name: string
    session_count: number
    pr_weight: number
}


export default function ProgressScreen() {
    const [exercises, setExercises] = useState<ExerciseSummary[]>([])
    const [filtered, setFiltered] = useState<ExerciseSummary[]>([])
    const [search, setSearch] = useState('')
    const [loading, setLoading] = useState(true)

    useFocusEffect(
        useCallback(() => {
            fetchExercises()
        }, [])
    )

    async function fetchExercises() {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // First get all completed session IDs for this user
        const { data: userSessions } = await supabase
            .from('sessions')
            .select('id')
            .eq('user_id', user.id)
            .eq('status', 'completed')

        if (!userSessions || userSessions.length === 0) {
            setLoading(false)
            return
        }

        const sessionIds = userSessions.map(s => s.id)

        // Get all sets from those sessions
        const { data } = await supabase
            .from('session_sets')
            .select(`
            weight_used,
            session_id,
            program_exercises!inner (
                exercise_id,
                exercises!inner ( id, name )
            )
        `)
            .in('session_id', sessionIds)

        if (!data) {
            setLoading(false)
            return
        }

        const map = new Map<string, ExerciseSummary>()
        const sessionsByExercise = new Map<string, Set<string>>()

        data.forEach((row: any) => {
            const ex = row.program_exercises?.exercises
            if (!ex) return

            const exId = ex.id
            const weight = row.weight_used || 0
            const sessionId = row.session_id

            if (!map.has(exId)) {
                map.set(exId, {
                    exercise_id: exId,
                    exercise_name: ex.name,
                    session_count: 0,
                    pr_weight: 0,
                })
                sessionsByExercise.set(exId, new Set())
            }

            const entry = map.get(exId)!
            if (weight > entry.pr_weight) entry.pr_weight = weight
            if (sessionId) sessionsByExercise.get(exId)!.add(sessionId)
        })

        sessionsByExercise.forEach((sessions, exId) => {
            const entry = map.get(exId)
            if (entry) entry.session_count = sessions.size
        })

        const result = Array.from(map.values()).sort((a, b) =>
            a.exercise_name.localeCompare(b.exercise_name)
        )

        setExercises(result)
        setFiltered(result)
        setLoading(false)
    }
    function handleSearch(text: string) {
        setSearch(text)
        if (!text.trim()) {
            setFiltered(exercises)
            return
        }
        setFiltered(
            exercises.filter(e =>
                e.exercise_name.toLowerCase().includes(text.toLowerCase())
            )
        )
    }

    if (loading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator color="#800000" />
            </View>
        )
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />
            <ScrollView
                contentContainerStyle={styles.scroll}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                <Text style={styles.eyebrow}>YOUR LIFTS</Text>
                <Text style={styles.title}>Progress</Text>

                <View style={styles.searchBox}>
                    <Text style={styles.searchIcon}>⌕</Text>
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search exercises..."
                        placeholderTextColor="#444"
                        value={search}
                        onChangeText={handleSearch}
                    />
                    {search.length > 0 && (
                        <TouchableOpacity onPress={() => handleSearch('')}>
                            <Text style={styles.clearBtn}>✕</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {filtered.length === 0 ? (
                    <View style={styles.empty}>
                        <Text style={styles.emptyTitle}>No exercises found</Text>
                        <Text style={styles.emptyText}>
                            Complete a session to see your progress here.
                        </Text>
                    </View>
                ) : (
                    filtered.map(ex => (
                        <TouchableOpacity
                            key={ex.exercise_id}
                            style={styles.card}
                            onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: ex.exercise_id } })}
                            activeOpacity={0.8}
                        >
                            <View style={styles.cardTop}>
                                <Text style={styles.exName}>{ex.exercise_name}</Text>
                                {ex.pr_weight > 0 && (
                                    <View style={styles.prBadge}>
                                        <Text style={styles.prText}>PR {ex.pr_weight}kg</Text>
                                    </View>
                                )}
                            </View>
                            <Text style={styles.sessionCount}>
                                {ex.session_count} {ex.session_count === 1 ? 'session' : 'sessions'} logged
                            </Text>
                            <Text style={styles.arrow}>›</Text>
                        </TouchableOpacity>
                    ))
                )}
            </ScrollView>
        </View>
    )
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#050505' },
    centered: { flex: 1, backgroundColor: '#050505', justifyContent: 'center', alignItems: 'center' },
    scroll: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 32 },
    eyebrow: { color: '#555', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2 },
    title: { color: '#fff', fontSize: 26, fontWeight: '700', marginBottom: 20 },
    searchBox: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#111', borderRadius: 12,
        paddingHorizontal: 14, marginBottom: 20,
        borderWidth: 1, borderColor: '#1a1a1a',
    },
    searchIcon: { color: '#444', fontSize: 18, marginRight: 8 },
    searchInput: { flex: 1, color: '#fff', fontSize: 14, paddingVertical: 13 },
    clearBtn: { color: '#444', fontSize: 13, paddingLeft: 8 },
    card: {
        backgroundColor: '#111', borderRadius: 14,
        padding: 16, marginBottom: 10,
        borderWidth: 1, borderColor: '#1a1a1a',
    },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    exName: { color: '#fff', fontSize: 16, fontWeight: '700', flex: 1 },
    prBadge: {
        backgroundColor: 'rgba(128,0,0,0.15)',
        borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
        borderWidth: 1, borderColor: 'rgba(128,0,0,0.3)',
    },
    prText: { color: '#800000', fontSize: 10, fontWeight: '700' },
    sessionCount: { color: '#555', fontSize: 12 },
    arrow: { color: '#800000', fontSize: 20, position: 'absolute', right: 16, top: '50%' },
    empty: { alignItems: 'center', marginTop: 60 },
    emptyTitle: { color: '#fff', fontSize: 17, fontWeight: '600', marginBottom: 8 },
    emptyText: { color: '#444', fontSize: 13, textAlign: 'center' },
})