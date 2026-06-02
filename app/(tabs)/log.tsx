import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
    Alert,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native'
import { supabase } from '../../lib/supabase'

interface Program {
    id: string
    name: string
    description: string
}

interface ProgramDay {
    id: string
    name: string
    day_order: number
    program_id: string
    exercise_count: number
}

export default function LogScreen() {
    const [program, setProgram] = useState<Program | null>(null)
    const [days, setDays] = useState<ProgramDay[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchActiveProgram()
    }, [])

    async function fetchActiveProgram() {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: programData } = await supabase
            .from('programs')
            .select('id, name, description')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .single()

        if (!programData) {
            setLoading(false)
            return
        }

        setProgram(programData)

        const { data: daysData } = await supabase
            .from('program_days')
            .select('id, name, day_order, program_id')
            .eq('program_id', programData.id)
            .order('day_order')

        if (daysData) {
            const daysWithCount = await Promise.all(
                daysData.map(async (day) => {
                    const { count } = await supabase
                        .from('program_exercises')
                        .select('id', { count: 'exact', head: true })
                        .eq('program_day_id', day.id)
                    return { ...day, exercise_count: count || 0 }
                })
            )
            setDays(daysWithCount)
        }

        setLoading(false)
    }

    async function startSession(day: ProgramDay) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || !program) return

        const { data: existing } = await supabase
            .from('sessions')
            .select('id')
            .eq('user_id', user.id)
            .eq('status', 'in_progress')
            .single()

        if (existing) {
            Alert.alert(
                'Session in progress',
                'You have an unfinished session. Resume it?',
                [
                    { text: 'Resume', onPress: () => router.push({ pathname: '/session/[id]', params: { id: existing.id } }) },
                    { text: 'Cancel', style: 'cancel' },
                ]
            )
            return
        }

        const { data: session, error } = await supabase
            .from('sessions')
            .insert({
                user_id: user.id,
                program_id: program.id,
                program_day_id: day.id,
                status: 'in_progress',
                started_at: new Date().toISOString(),
            })
            .select()
            .single()

        if (error || !session) {
            Alert.alert('Error', 'Could not start session.')
            return
        }

        router.push({ pathname: '/session/[id]', params: { id: session.id } })
    }

    if (loading) {
        return (
            <View style={styles.centered}>
                <Text style={styles.loadingText}>Loading...</Text>
            </View>
        )
    }

    if (!program) {
        return (
            <View style={styles.centered}>
                <Text style={styles.emptyTitle}>No active program</Text>
                <Text style={styles.emptyText}>Set up a program first in the Programs tab.</Text>
            </View>
        )
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" />
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                <Text style={styles.label}>START SESSION</Text>
                <Text style={styles.title}>Choose day</Text>
                <Text style={styles.sub}>{program.name}</Text>

                {days.map((day) => (
                    <TouchableOpacity
                        key={day.id}
                        style={styles.card}
                        onPress={() => startSession(day)}
                        activeOpacity={0.8}
                    >
                        <View style={styles.cardContent}>
                            <View>
                                <Text style={styles.dayName}>{day.name}</Text>
                                <Text style={styles.dayMeta}>{day.exercise_count} exercises</Text>
                            </View>
                            <Text style={styles.arrow}>›</Text>
                        </View>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    )
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#050505' },
    centered: { flex: 1, backgroundColor: '#050505', justifyContent: 'center', alignItems: 'center', padding: 24 },
    scroll: { paddingHorizontal: 20, paddingTop: 56, paddingBottom: 24 },
    label: { color: '#555', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
    title: { color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 4 },
    sub: { color: '#555', fontSize: 13, marginBottom: 28 },
    card: { backgroundColor: '#111', borderRadius: 12, marginBottom: 10 },
    cardContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
    dayName: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 4 },
    dayMeta: { color: '#555', fontSize: 12 },
    arrow: { color: '#800000', fontSize: 20 },
    loadingText: { color: '#555', fontSize: 14 },
    emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 },
    emptyText: { color: '#555', fontSize: 13, textAlign: 'center' },
})