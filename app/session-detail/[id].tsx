import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import {
    ActivityIndicator,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native'
import { supabase } from '../../lib/supabase'
import { useWeightUnit } from '../../lib/WeightUnitContext'

interface SetRow {
    set_number: number
    weight_used: number
    reps_done: number
    is_pr: boolean
}

interface ExerciseGroup {
    exercise_id: string
    exercise_name: string
    sets: SetRow[]
}

interface SessionInfo {
    started_at: string
    ended_at: string | null
    day_name: string
    program_name: string
}

export default function SessionDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>()
    const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null)
    const [exerciseGroups, setExerciseGroups] = useState<ExerciseGroup[]>([])
    const [loading, setLoading] = useState(true)
    const { formatWeight } = useWeightUnit()

    useEffect(() => {
        if (!id) return
        fetchSessionDetail()
    }, [id])

    async function fetchSessionDetail() {
        setLoading(true)
        try {
            // Step 1: fetch session + day + program
            const { data: session } = await supabase
                .from('sessions')
                .select('started_at, ended_at, program_day_id')
                .eq('id', id)
                .single()

            if (!session) return

            const { data: day } = await supabase
                .from('program_days')
                .select('name, programs(name)')
                .eq('id', session.program_day_id)
                .single()

            setSessionInfo({
                started_at: session.started_at,
                ended_at: session.ended_at,
                day_name: (day as any)?.name ?? 'Unknown Day',
                program_name: (day as any)?.programs?.name ?? 'Unknown Program',
            })

            // Step 2: fetch all sets for this session
            const { data: sets } = await supabase
                .from('session_sets')
                .select(`
                    set_number,
                    weight_used,
                    reps_done,
                    is_pr,
                    program_exercises!inner (
                        exercise_id,
                        exercises!inner ( id, name )
                    )
                `)
                .eq('session_id', id)
                .order('set_number')

            if (!sets) return

            // Step 3: group sets by exercise
            const groupMap = new Map<string, ExerciseGroup>()

            sets.forEach((row: any) => {
                const ex = row.program_exercises?.exercises
                if (!ex) return

                if (!groupMap.has(ex.id)) {
                    groupMap.set(ex.id, {
                        exercise_id: ex.id,
                        exercise_name: ex.name,
                        sets: [],
                    })
                }

                groupMap.get(ex.id)!.sets.push({
                    set_number: row.set_number,
                    weight_used: row.weight_used ?? 0,
                    reps_done: row.reps_done ?? 0,
                    is_pr: row.is_pr ?? false,
                })
            })

            setExerciseGroups(Array.from(groupMap.values()))
        } catch (e) {
            console.error('SessionDetailScreen error:', e)
        } finally {
            setLoading(false)
        }
    }

    function formatDate(iso: string) {
        return new Date(iso).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        })
    }

    function formatDuration(start: string, end: string | null) {
        if (!end) return null
        const diff = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000)
        const h = Math.floor(diff / 3600)
        const m = Math.floor((diff % 3600) / 60)
        if (h > 0) return `${h}h ${m}m`
        return `${m}m`
    }

    if (loading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator color="#800000" />
            </View>
        )
    }

    const duration = sessionInfo ? formatDuration(sessionInfo.started_at, sessionInfo.ended_at) : null

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />

            <View style={styles.topBar}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Text style={styles.backIcon}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.topBarTitle} numberOfLines={1}>
                    {sessionInfo?.day_name ?? 'Session'}
                </Text>
                <View style={{ width: 36 }} />
            </View>

            <ScrollView
                contentContainerStyle={styles.scroll}
                showsVerticalScrollIndicator={false}
            >
                {/* Session meta */}
                <View style={styles.metaCard}>
                    <Text style={styles.metaProgram}>{sessionInfo?.program_name}</Text>
                    <Text style={styles.metaDate}>
                        {sessionInfo ? formatDate(sessionInfo.started_at) : ''}
                    </Text>
                    {duration && (
                        <View style={styles.durationBadge}>
                            <Text style={styles.durationText}>⏱ {duration}</Text>
                        </View>
                    )}
                </View>

                {/* Exercise groups */}
                {exerciseGroups.length === 0 ? (
                    <View style={styles.empty}>
                        <Text style={styles.emptyTitle}>No sets recorded</Text>
                        <Text style={styles.emptyText}>This session has no logged data.</Text>
                    </View>
                ) : (
                    exerciseGroups.map(group => (
                        <View key={group.exercise_id} style={styles.exerciseCard}>
                            <TouchableOpacity
                                onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: group.exercise_id } })}
                                activeOpacity={0.7}
                            >
                                <View style={styles.exerciseHeader}>
                                    <Text style={styles.exerciseName}>{group.exercise_name}</Text>
                                    <Text style={styles.exerciseLink}>View progress ›</Text>
                                </View>
                            </TouchableOpacity>

                            {/* Set table header */}
                            <View style={styles.setHeader}>
                                <Text style={[styles.setCol, { flex: 0.5 }]}>SET</Text>
                                <Text style={styles.setCol}>WEIGHT</Text>
                                <Text style={styles.setCol}>REPS</Text>
                                <Text style={[styles.setCol, { flex: 0.5 }]}></Text>
                            </View>

                            {group.sets.map((set, i) => (
                                <View key={i} style={styles.setRow}>
                                    <Text style={styles.setNumber}>{set.set_number}</Text>
                                    <Text style={styles.setValue}>{formatWeight(set.weight_used)}</Text>
                                    <Text style={styles.setValue}>{set.reps_done}</Text>
                                    <View style={[styles.prSlot, { flex: 0.5 }]}>
                                        {set.is_pr && (
                                            <View style={styles.prBadge}>
                                                <Text style={styles.prText}>PR</Text>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            ))}
                        </View>
                    ))
                )}
            </ScrollView>
        </View>
    )
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#050505' },
    centered: { flex: 1, backgroundColor: '#050505', justifyContent: 'center', alignItems: 'center' },

    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 52,
        paddingBottom: 12,
    },
    backBtn: { width: 36, height: 36, justifyContent: 'center' },
    backIcon: { color: '#800000', fontSize: 28, lineHeight: 32 },
    topBarTitle: { flex: 1, color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center' },

    scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },

    metaCard: {
        backgroundColor: '#111',
        borderRadius: 14,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#1a1a1a',
    },
    metaProgram: { color: '#800000', fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
    metaDate: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 10 },
    durationBadge: {
        alignSelf: 'flex-start',
        backgroundColor: '#1a1a1a',
        borderRadius: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    durationText: { color: '#555', fontSize: 12 },

    exerciseCard: {
        backgroundColor: '#111',
        borderRadius: 14,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#1a1a1a',
    },
    exerciseHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    exerciseName: { color: '#fff', fontSize: 15, fontWeight: '700', flex: 1 },
    exerciseLink: { color: '#800000', fontSize: 11, fontWeight: '600' },

    setHeader: { flexDirection: 'row', marginBottom: 8 },
    setCol: {
        flex: 1,
        color: '#444',
        fontSize: 10,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        textAlign: 'center',
    },
    setRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: '#1a1a1a',
    },
    setNumber: { width: 24, color: '#555', fontSize: 13, textAlign: 'center', flex: 0.5 },
    setValue: { flex: 1, color: '#fff', fontSize: 14, textAlign: 'center' },
    prSlot: { alignItems: 'center', justifyContent: 'center' },
    prBadge: {
        backgroundColor: 'rgba(128,0,0,0.15)',
        borderRadius: 5,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderWidth: 1,
        borderColor: 'rgba(128,0,0,0.3)',
    },
    prText: { color: '#800000', fontSize: 9, fontWeight: '700' },

    empty: { alignItems: 'center', marginTop: 60 },
    emptyTitle: { color: '#fff', fontSize: 17, fontWeight: '600', marginBottom: 8 },
    emptyText: { color: '#444', fontSize: 13, textAlign: 'center' },
})