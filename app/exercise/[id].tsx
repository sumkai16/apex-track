import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import {
    ActivityIndicator,
    Dimensions,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import { supabase } from '../../lib/supabase'
const RANGES = [
    { label: '1M', months: 1 },
    { label: '3M', months: 3 },
    { label: '6M', months: 6 },
    { label: 'All', months: 0 },
]

interface SetData {
    session_id: string
    session_date: string
    weight_used: number
    reps_done: number
}

interface SessionPoint {
    date: string
    maxWeight: number
    avgReps: number
    setCount: number
}

export default function ExerciseDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>()
    const [exerciseName, setExerciseName] = useState('')
    const [allSets, setAllSets] = useState<SetData[]>([])
    const [selectedRange, setSelectedRange] = useState(1)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchData()
    }, [])

    async function fetchData() {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: exData } = await supabase
            .from('exercises')
            .select('name')
            .eq('id', id)
            .single()

        if (exData) setExerciseName(exData.name)

        const { data } = await supabase
            .from('session_sets')
            .select(`
                weight_used,
                reps_done,
                program_exercises!inner ( exercise_id ),
                sessions!inner ( id, started_at, user_id, status )
            `)
            .eq('program_exercises.exercise_id', id)
            .eq('sessions.user_id', user.id)
            .eq('sessions.status', 'completed')
            .order('sessions.started_at', { ascending: true })

        if (data) {
            const sets: SetData[] = data.map((row: any) => ({
                session_id: row.sessions.id,
                session_date: row.sessions.started_at,
                weight_used: row.weight_used || 0,
                reps_done: row.reps_done || 0,
            }))
            setAllSets(sets)
        }

        setLoading(false)
    }

    function getFilteredPoints(): SessionPoint[] {
        const range = RANGES[selectedRange]
        const cutoff = range.months === 0
            ? new Date(0)
            : new Date(Date.now() - range.months * 30 * 24 * 60 * 60 * 1000)

        const filtered = allSets.filter(s => new Date(s.session_date) >= cutoff)

        const sessionMap = new Map<string, SetData[]>()
        filtered.forEach(s => {
            if (!sessionMap.has(s.session_id)) sessionMap.set(s.session_id, [])
            sessionMap.get(s.session_id)!.push(s)
        })

        return Array.from(sessionMap.entries()).map(([, sets]) => {
            const date = new Date(sets[0].session_date)
            const label = `${date.getDate()}/${date.getMonth() + 1}`
            const maxWeight = Math.max(...sets.map(s => s.weight_used))
            const avgReps = Math.round(sets.reduce((a, s) => a + s.reps_done, 0) / sets.length)
            return { date: label, maxWeight, avgReps, setCount: sets.length }
        })
    }

    function getStats() {
        if (allSets.length === 0) return { pr: 0, sessions: 0, avgReps: 0, avgWeight: 0 }
        const sessionIds = new Set(allSets.map(s => s.session_id))
        const pr = Math.max(...allSets.map(s => s.weight_used))
        const avgReps = Math.round(allSets.reduce((a, s) => a + s.reps_done, 0) / allSets.length)
        const avgWeight = Math.round(allSets.reduce((a, s) => a + s.weight_used, 0) / allSets.length)
        return { pr, sessions: sessionIds.size, avgReps, avgWeight }
    }

    if (loading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator color="#800000" />
            </View>
        )
    }

    const points = getFilteredPoints()
    const stats = getStats()
    const chartWidth = Dimensions.get('window').width - 64
    const chartHeight = 140
    const maxW = Math.max(...points.map(p => p.maxWeight), 1)
    const minW = Math.min(...points.map(p => p.maxWeight), 0)
    const range = maxW - minW || 1

    function toX(i: number) {
        if (points.length === 1) return chartWidth / 2
        return (i / (points.length - 1)) * chartWidth
    }

    function toY(w: number) {
        return chartHeight - ((w - minW) / range) * chartHeight
    }

    const pathD = points.length > 0
        ? points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(p.maxWeight).toFixed(1)}`).join(' ')
        : ''

    const fillD = points.length > 0
        ? `${pathD} L ${toX(points.length - 1).toFixed(1)} ${chartHeight} L ${toX(0).toFixed(1)} ${chartHeight} Z`
        : ''

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />
            <View style={styles.topBar}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Text style={styles.backIcon}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.topBarTitle} numberOfLines={1}>{exerciseName}</Text>
                <View style={{ width: 36 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                <View style={styles.statsRow}>
                    {[
                        { label: 'PR', value: `${stats.pr}kg` },
                        { label: 'Sessions', value: stats.sessions },
                        { label: 'Avg reps', value: stats.avgReps },
                        { label: 'Avg weight', value: `${stats.avgWeight}kg` },
                    ].map(s => (
                        <View key={s.label} style={styles.statCard}>
                            <Text style={styles.statLabel}>{s.label}</Text>
                            <Text style={styles.statValue}>{s.value}</Text>
                        </View>
                    ))}
                </View>

                <View style={styles.chartCard}>
                    <View style={styles.rangeRow}>
                        {RANGES.map((r, i) => (
                            <TouchableOpacity
                                key={r.label}
                                style={[styles.rangeBtn, selectedRange === i && styles.rangeBtnActive]}
                                onPress={() => setSelectedRange(i)}
                            >
                                <Text style={[styles.rangeBtnText, selectedRange === i && styles.rangeBtnTextActive]}>
                                    {r.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {points.length === 0 ? (
                        <View style={styles.noData}>
                            <Text style={styles.noDataText}>No data for this period</Text>
                        </View>
                    ) : (
                        <>
                            <View style={{ height: chartHeight + 20, marginTop: 8 }}>
                                <Svg
                                    width={chartWidth}
                                    height={chartHeight}
                                    style={{ overflow: 'visible' }}
                                >
                                    <Path d={fillD} fill="rgba(128,0,0,0.08)" />
                                    <Path d={pathD} fill="none" stroke="#800000" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                                    {points.map((p, i) => (
                                        <Circle
                                            key={i}
                                            cx={toX(i)}
                                            cy={toY(p.maxWeight)}
                                            r="4"
                                            fill="#800000"
                                        />
                                    ))}
                                </Svg>

                                <View style={[styles.chartLabels, { width: chartWidth }]}>
                                    {points.length > 1 && (
                                        <>
                                            <Text style={styles.chartLabel}>{points[0].date}</Text>
                                            <Text style={styles.chartLabel}>{points[points.length - 1].date}</Text>
                                        </>
                                    )}
                                </View>
                            </View>

                            <View style={styles.yLabels}>
                                <Text style={styles.yLabel}>{maxW}kg</Text>
                                <Text style={styles.yLabel}>{Math.round((maxW + minW) / 2)}kg</Text>
                                <Text style={styles.yLabel}>{minW}kg</Text>
                            </View>
                        </>
                    )}
                </View>

                <Text style={styles.sectionLabel}>SESSION HISTORY</Text>
                {points.map((p, i) => (
                    <View key={i} style={styles.historyRow}>
                        <Text style={styles.historyDate}>{p.date}</Text>
                        <View style={styles.historyRight}>
                            <Text style={styles.historyWeight}>{p.maxWeight}kg</Text>
                            <Text style={styles.historySets}>{p.setCount} sets · {p.avgReps} avg reps</Text>
                        </View>
                    </View>
                ))}

            </ScrollView>
        </View>
    )
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#050505' },
    centered: { flex: 1, backgroundColor: '#050505', justifyContent: 'center', alignItems: 'center' },
    topBar: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16,
    },
    backBtn: {
        width: 36, height: 36, backgroundColor: '#111',
        borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    },
    backIcon: { color: '#fff', fontSize: 22 },
    topBarTitle: { color: '#fff', fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center', marginHorizontal: 8 },
    scroll: { paddingHorizontal: 20, paddingBottom: 40 },
    statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    statCard: {
        flex: 1, backgroundColor: '#111', borderRadius: 12,
        padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#1a1a1a',
    },
    statLabel: { color: '#555', fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
    statValue: { color: '#fff', fontSize: 16, fontWeight: '700' },
    chartCard: {
        backgroundColor: '#111', borderRadius: 14,
        padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#1a1a1a',
    },
    rangeRow: { flexDirection: 'row', gap: 6 },
    rangeBtn: {
        paddingHorizontal: 14, paddingVertical: 6,
        borderRadius: 8, backgroundColor: '#1a1a1a',
    },
    rangeBtnActive: { backgroundColor: '#800000' },
    rangeBtnText: { color: '#555', fontSize: 12, fontWeight: '600' },
    rangeBtnTextActive: { color: '#fff' },
    noData: { height: 100, alignItems: 'center', justifyContent: 'center' },
    noDataText: { color: '#333', fontSize: 13 },
    chartLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
    chartLabel: { color: '#444', fontSize: 10 },
    yLabels: { position: 'absolute', right: 0, top: 48, bottom: 0, justifyContent: 'space-between', alignItems: 'flex-end' },
    yLabel: { color: '#444', fontSize: 10 },
    sectionLabel: { color: '#555', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 },
    historyRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#111',
    },
    historyDate: { color: '#555', fontSize: 13 },
    historyRight: { alignItems: 'flex-end' },
    historyWeight: { color: '#fff', fontSize: 14, fontWeight: '700' },
    historySets: { color: '#555', fontSize: 11, marginTop: 2 },
})