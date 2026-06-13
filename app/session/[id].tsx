import { useFocusEffect } from '@react-navigation/native'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
    Alert,
    Animated,
    KeyboardAvoidingView, Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from 'react-native'
import { supabase } from '../../lib/supabase'
import { useWeightUnit } from '../../lib/WeightUnitContext'
interface Exercise {
    id: string
    name: string
}

interface ProgramExercise {
    id: string
    order_index: number
    target_sets: number
    target_reps: number
    exercise: Exercise
    previousSets: LoggedSet[]
}

interface LoggedSet {
    set_number: number
    weight_used: number
    reps_done: number
    done: boolean
    isExtra?: boolean
}

export default function SessionScreen() {

    const { id } = useLocalSearchParams<{ id: string }>()
    const [exercises, setExercises] = useState<ProgramExercise[]>([])
    const [currentIndex, setCurrentIndex] = useState(0)
    const [sets, setSets] = useState<Record<string, LoggedSet[]>>({})
    const [elapsed, setElapsed] = useState(0)
    const [loading, setLoading] = useState(true)
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const sidebarAnim = useRef(new Animated.Value(0)).current
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const { unit, toDisplay, toKg, formatWeight } = useWeightUnit()
    const [weightInputs, setWeightInputs] = useState<Record<string, string>>({})
    const setsRef = useRef<Record<string, LoggedSet[]>>({})
    const exercisesRef = useRef<ProgramExercise[]>([])
    const [startedAt, setStartedAt] = useState<number | null>(null)

    useEffect(() => {
        if (!id) return
        fetchSessionData()
    }, [id])
    // Keep refs in sync with state so auto-save can access latest values
    useEffect(() => {
        setsRef.current = sets
    }, [sets])

    useEffect(() => {
        exercisesRef.current = exercises
    }, [exercises])

    useEffect(() => {
        if (!startedAt) return
        if (timerRef.current) clearInterval(timerRef.current)

        // Set correct elapsed immediately, no flicker
        setElapsed(Math.floor((Date.now() - startedAt) / 1000))

        timerRef.current = setInterval(() => {
            setElapsed(Math.floor((Date.now() - startedAt) / 1000))
        }, 1000)
        return () => { if (timerRef.current) clearInterval(timerRef.current) }
    }, [startedAt])


    useFocusEffect(
        useCallback(() => {
            return () => {
                // Fires when screen loses focus — auto-save current sets
                autoSaveSets()
            }
        }, [])
    )

    async function autoSaveSets() {
        const currentSets = setsRef.current
        const currentExercises = exercisesRef.current
        if (!currentExercises.length || !id) return

        const allSets: any[] = []
        currentExercises.forEach(pe => {
            const peSets = currentSets[pe.id] || []
            peSets.forEach(set => {
                if (set.weight_used > 0 || set.reps_done > 0) {
                    allSets.push({
                        session_id: id,
                        program_exercise_id: pe.id,
                        exercise_id: pe.exercise.id,
                        set_number: set.set_number,
                        weight_used: set.weight_used,
                        reps_done: set.reps_done,
                        weight_unit: 'kg',
                        is_pr: false,
                    })
                }
            })
        })

        if (allSets.length === 0) return

        // Delete existing in-progress sets for this session then re-insert
        await supabase
            .from('session_sets')
            .delete()
            .eq('session_id', id)

        await supabase.from('session_sets').insert(allSets)
    }
    function openSidebar() {
        setSidebarOpen(true)
        Animated.timing(sidebarAnim, {
            toValue: 1,
            duration: 250,
            useNativeDriver: true,
        }).start()
    }

    function closeSidebar() {
        Animated.timing(sidebarAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
        }).start(() => setSidebarOpen(false))
    }

    function selectExercise(index: number) {
        setCurrentIndex(index)
        closeSidebar()
    }

    const sidebarTranslateX = sidebarAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [-240, 0],
    })

    const overlayOpacity = sidebarAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
    })

    async function fetchSessionData() {

        const { data: session } = await supabase
            .from('sessions')
            .select('program_day_id, started_at')
            .eq('id', id)
            .single()

        if (!session) return

        const startMs = new Date(session.started_at).getTime()
        setStartedAt(startMs)
        // Fix timer
        const [programExercisesRes, savedSetsRes, prevSessionRes] = await Promise.all([

            supabase
                .from('program_exercises')
                .select('id, order_index, target_sets, target_reps, exercises(id, name)')
                .eq('program_day_id', session.program_day_id)
                .order('order_index'),
            supabase
                .from('session_sets')
                .select('program_exercise_id, set_number, weight_used, reps_done, is_extra')
                .eq('session_id', id),
            supabase
                .from('sessions')
                .select('id')
                .eq('program_day_id', session.program_day_id)
                .eq('status', 'completed')
                .order('started_at', { ascending: false })
                .limit(1)
                .single()
        ])

        const programExercises = programExercisesRes.data



        if (!programExercises) return

        // Build saved sets lookup
        const savedLookup: Record<string, Record<number, { weight_used: number; reps_done: number }>> = {}
        if (savedSetsRes.data) {
            savedSetsRes.data.forEach(s => {
                if (!savedLookup[s.program_exercise_id]) savedLookup[s.program_exercise_id] = {}
                savedLookup[s.program_exercise_id][s.set_number] = {
                    weight_used: s.weight_used,
                    reps_done: s.reps_done,
                }
            })
        }

        // Fetch all previous sets in one query if previous session exists
        const prevSessionId = prevSessionRes.data?.id
        let prevSetsLookup: Record<string, { set_number: number; weight_used: number; reps_done: number }[]> = {}

        if (prevSessionId) {
            const { data: prevSets } = await supabase
                .from('session_sets')
                .select('program_exercise_id, set_number, weight_used, reps_done')
                .eq('session_id', prevSessionId)

            if (prevSets) {
                prevSets.forEach(s => {
                    if (!prevSetsLookup[s.program_exercise_id]) prevSetsLookup[s.program_exercise_id] = []
                    prevSetsLookup[s.program_exercise_id].push(s)
                })
            }
        }

        const enriched = programExercises.map(pe => {
            const exercise = Array.isArray(pe.exercises)
                ? pe.exercises[0]
                : pe.exercises as unknown as Exercise

            const previousSets = (prevSetsLookup[pe.id] || []).map(s => ({ ...s, done: true }))

            return {
                id: pe.id,
                order_index: pe.order_index,
                target_sets: pe.target_sets,
                target_reps: pe.target_reps,
                exercise,
                previousSets,
            }
        })

        setExercises(enriched)

        const initialSets: Record<string, LoggedSet[]> = {}
        enriched.forEach(pe => {
            const savedSetsForPe = savedSetsRes.data?.filter(s => s.program_exercise_id === pe.id) || []
            const savedBySetNumber: Record<number, any> = {}
            savedSetsForPe.forEach(s => { savedBySetNumber[s.set_number] = s })

            // Build target sets, overriding with saved data where available
            const targetSets = Array.from({ length: pe.target_sets }, (_, i) => {
                const saved = savedBySetNumber[i + 1]
                return {
                    set_number: i + 1,
                    weight_used: saved?.weight_used ?? pe.previousSets[i]?.weight_used ?? 0,
                    reps_done: saved?.reps_done ?? pe.previousSets[i]?.reps_done ?? 0,
                    done: !!saved,
                    isExtra: false,
                }
            })

            // Append any extra sets (set_number > target_sets)
            const extraSets = savedSetsForPe
                .filter(s => s.set_number > pe.target_sets)
                .sort((a, b) => a.set_number - b.set_number)
                .map(s => ({
                    set_number: s.set_number,
                    weight_used: s.weight_used,
                    reps_done: s.reps_done,
                    done: true,
                    isExtra: true,
                }))

            initialSets[pe.id] = [...targetSets, ...extraSets]
        })

        setSets(initialSets)
        setLoading(false)

    }
    async function saveSetToDb(peId: string, setIndex: number, updatedSets: Record<string, LoggedSet[]>) {
        const set = updatedSets[peId]?.[setIndex]
        const exercise = exercises.find(e => e.id === peId)
        if (!set || !exercise || !id) return
        if (set.weight_used === 0 && set.reps_done === 0) return

        const { error } = await supabase
            .from('session_sets')
            .upsert({
                session_id: id,
                program_exercise_id: peId,
                exercise_id: exercise.exercise.id,
                set_number: set.set_number,
                weight_used: set.weight_used,
                reps_done: set.reps_done,
                weight_unit: 'kg',
                is_pr: false,
                is_extra: set.isExtra ?? false,
            }, {
                onConflict: 'session_id,program_exercise_id,set_number'
            })

    }
    function formatTime(seconds: number) {
        const h = Math.floor(seconds / 3600)
        const m = Math.floor((seconds % 3600) / 60)
        const s = seconds % 60
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }

    function getSetsDoneCount(peId: string) {
        return (sets[peId] || []).filter(s => s.done).length
    }

    function isExerciseDone(pe: ProgramExercise) {
        const peSets = sets[pe.id] || []
        return peSets.length > 0 && peSets.every(s => s.done)
    }

    function getNextUndoneSetIndex(peId: string) {
        return (sets[peId] || []).findIndex(s => !s.done)
    }

    function updateSet(peId: string, setIndex: number, field: 'weight_used' | 'reps_done', value: string) {
        setSets(prev => {
            const updated = [...(prev[peId] || [])]
            updated[setIndex] = { ...updated[setIndex], [field]: parseFloat(value) || 0 }
            const newSets = { ...prev, [peId]: updated }
            saveSetToDb(peId, setIndex, newSets)
            return newSets
        })
    }

    function logNextSet() {
        const peId = currentExercise?.id
        if (!peId) return
        const nextIndex = getNextUndoneSetIndex(peId)
        if (nextIndex === -1) return
        setSets(prev => {
            const updated = [...(prev[peId] || [])]
            updated[nextIndex] = { ...updated[nextIndex], done: true }
            return { ...prev, [peId]: updated }
        })
    }

    function toggleSetDone(peId: string, setIndex: number) {
        setSets(prev => {
            const updated = [...(prev[peId] || [])]
            updated[setIndex] = { ...updated[setIndex], done: !updated[setIndex].done }
            const newSets = { ...prev, [peId]: updated }
            saveSetToDb(peId, setIndex, newSets)
            return newSets
        })
    }
    function addSet(peId: string) {
        setSets(prev => {
            const existing = prev[peId] || []
            const last = existing[existing.length - 1]
            const newSet: LoggedSet = {
                set_number: existing.length + 1,
                weight_used: last?.weight_used || 0,
                reps_done: last?.reps_done || 0,
                done: false,
                isExtra: true,
            }
            return { ...prev, [peId]: [...existing, newSet] }
        })
    }
    function removeSet(peId: string, setIndex: number) {
        setSets(prev => {
            const updated = prev[peId].filter((_, i) => i !== setIndex)
            // Renumber set_number after removal
            return {
                ...prev,
                [peId]: updated.map((s, i) => ({ ...s, set_number: i + 1 }))
            }
        })
    }
    async function saveAllSets() {
        // Step 1: collect all sets to save
        const allSets: {
            session_id: string;
            program_exercise_id: string;
            exercise_id: string;
            set_number: number;
            weight_used: number;
            reps_done: number;
            weight_unit: 'kg';
            is_pr: boolean;

        }[] = [];

        exercises.forEach(pe => {
            const peSets = sets[pe.id] || [];
            peSets.forEach(set => {
                if (set.done || (set.weight_used > 0 && set.reps_done > 0)) {
                    allSets.push({
                        session_id: id,
                        program_exercise_id: pe.id,
                        exercise_id: pe.exercise.id,
                        set_number: set.set_number,
                        weight_used: set.weight_used,
                        reps_done: set.reps_done,
                        weight_unit: 'kg',
                        is_pr: false,
                    });
                }
            });
        });

        if (allSets.length === 0) return;

        // Step 2: get unique exercise IDs from this session
        const exerciseIds = [...new Set(allSets.map(s => s.exercise_id))];

        // Step 3: fetch historical max weight per exercise (completed sessions only, not this one)
        const { data: historicalSets } = await supabase
            .from('session_sets')
            .select('exercise_id, weight_used')
            .in('exercise_id', exerciseIds)
            .neq('session_id', id);

        // Step 4: build a lookup map — exercise_id → historical max
        const historicalMax: Record<string, number> = {};
        (historicalSets ?? []).forEach(s => {
            if (!historicalMax[s.exercise_id] || s.weight_used > historicalMax[s.exercise_id]) {
                historicalMax[s.exercise_id] = s.weight_used;
            }
        });

        // Step 5: determine PRs — track session-level max too so only the
        // heaviest set in this session gets flagged, not every set that beats history
        const sessionMax: Record<string, number> = {};
        allSets.forEach(set => {
            if (!sessionMax[set.exercise_id] || set.weight_used > sessionMax[set.exercise_id]) {
                sessionMax[set.exercise_id] = set.weight_used;
            }
        });

        allSets.forEach(set => {
            const prevMax = historicalMax[set.exercise_id] ?? -1;
            const isSessionMax = set.weight_used === sessionMax[set.exercise_id];
            const beatsHistory = set.weight_used > prevMax;
            set.is_pr = isSessionMax && beatsHistory;
        });

        // Step 6: save
        await supabase.from('session_sets').insert(allSets);
    }

    async function finishSession() {
        // Check if any sets have been logged
        const hasLoggedSets = Object.values(sets).some(peSets =>
            peSets.some(set => set.done || (set.weight_used > 0 && set.reps_done > 0))
        );

        if (!hasLoggedSets) {
            Alert.alert(
                'No sets logged',
                'You haven\'t logged any sets yet. Log at least one set before finishing.',
                [{ text: 'OK' }]
            )
            return
        }

        Alert.alert(
            'Finish session?',
            'This will save all logged sets and mark the session as complete.',
            [
                {
                    text: 'Finish', onPress: async () => {
                        await saveAllSets()
                        await supabase
                            .from('sessions')
                            .update({ status: 'completed', ended_at: new Date().toISOString() })
                            .eq('id', id)
                        if (timerRef.current) clearInterval(timerRef.current)
                        router.replace('/(tabs)/home')
                    }
                },
                { text: 'Cancel', style: 'cancel' }
            ]
        )
    }

    async function abandonSession() {
        Alert.alert(
            'Abandon session?',
            'Your logged sets will be saved but marked as abandoned.',
            [
                {
                    text: 'Abandon', style: 'destructive', onPress: async () => {
                        await saveAllSets()
                        await supabase
                            .from('sessions')
                            .update({ status: 'abandoned', ended_at: new Date().toISOString() })
                            .eq('id', id)
                        if (timerRef.current) clearInterval(timerRef.current)
                        router.replace('/(tabs)/home')
                    }
                },
                { text: 'Cancel', style: 'cancel' }
            ]
        )
    }

    if (loading) {
        return (
            <View style={styles.centered}>
                <Text style={styles.loadingText}>Loading session...</Text>
            </View>
        )
    }

    const currentExercise = exercises[currentIndex]
    const currentSets = sets[currentExercise?.id] || []
    const doneCount = exercises.filter(isExerciseDone).length
    const progress = exercises.length > 0 ? doneCount / exercises.length : 0
    const nextUndoneIndex = getNextUndoneSetIndex(currentExercise?.id)

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <StatusBar barStyle="light-content" />

            <View style={styles.header}>
                <TouchableOpacity
                    style={[styles.menuBtn, sidebarOpen && styles.menuBtnActive]}
                    onPress={sidebarOpen ? closeSidebar : openSidebar}
                >
                    <Text style={styles.menuIcon}>{sidebarOpen ? '✕' : '☰'}</Text>
                </TouchableOpacity>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerLabel}>
                        Exercise {currentIndex + 1}/{exercises.length} · {doneCount} done
                    </Text>
                    <Text style={styles.headerTitle} numberOfLines={1}>
                        {currentExercise?.exercise?.name}
                    </Text>
                </View>
                <Text style={styles.timer}>{formatTime(elapsed)}</Text>
            </View>

            <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
            </View>

            <ScrollView
                style={styles.main}
                contentContainerStyle={styles.mainContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.exMeta}>
                    <Text style={styles.exTarget}>
                        Target: {currentExercise?.target_sets} sets × {currentExercise?.target_reps} reps
                    </Text>
                    {currentExercise?.previousSets?.length > 0 && (
                        <Text style={styles.exPrev}>
                            Last: {currentExercise.previousSets.map(s =>
                                `${toDisplay(s.weight_used)}${unit} × ${s.reps_done}`).join(', ')}
                        </Text>
                    )}
                </View>

                <View style={styles.exCard}>
                    <View style={styles.setHeader}>
                        <Text style={[styles.setCol, { flex: 0.5 }]}>SET</Text>
                        <Text style={styles.setCol}>WEIGHT ({unit.toUpperCase()})</Text>
                        <Text style={styles.setCol}>REPS</Text>
                        <Text style={[styles.setCol, { flex: 0.5 }]}></Text>
                    </View>

                    {currentSets.map((set, i) => {
                        const isCurrentSet = i === nextUndoneIndex
                        return (
                            <View key={i} style={[styles.setRow, set.done && styles.setRowDone]}>
                                <Text style={[styles.setNum, isCurrentSet && styles.setNumActive]}>
                                    {set.set_number}
                                </Text>
                                <TextInput
                                    style={[styles.setInput, isCurrentSet && styles.setInputActive]}
                                    value={weightInputs[`${currentExercise.id}-${i}`] ?? (set.weight_used > 0 ? String(toDisplay(set.weight_used)) : '')}
                                    onChangeText={v => {
                                        // Store raw string while typing
                                        setWeightInputs(prev => ({ ...prev, [`${currentExercise.id}-${i}`]: v }))
                                        // Only convert and save if it's a valid number
                                        const num = parseFloat(v)
                                        if (!isNaN(num)) {
                                            updateSet(currentExercise.id, i, 'weight_used', String(toKg(num)))
                                        }
                                    }}
                                    onBlur={() => {
                                        // Clean up raw input on blur — format it properly
                                        const key = `${currentExercise.id}-${i}`
                                        const num = parseFloat(weightInputs[key] ?? '')
                                        if (!isNaN(num)) {
                                            setWeightInputs(prev => ({ ...prev, [key]: String(toDisplay(toKg(num))) }))
                                        } else {
                                            setWeightInputs(prev => ({ ...prev, [key]: '' }))
                                            updateSet(currentExercise.id, i, 'weight_used', '0')
                                        }
                                    }}
                                    keyboardType="numeric"
                                    placeholder="0"
                                    placeholderTextColor="#444"
                                    editable={!set.done}
                                />
                                <TextInput
                                    style={[styles.setInput, isCurrentSet && styles.setInputActive]}
                                    value={set.reps_done > 0 ? String(set.reps_done) : ''}
                                    onChangeText={v => updateSet(currentExercise.id, i, 'reps_done', v)}
                                    keyboardType="numeric"
                                    placeholder="0"
                                    placeholderTextColor="#444"
                                    editable={!set.done}
                                />
                                <TouchableOpacity
                                    style={[styles.checkBtn, set.done && styles.checkBtnDone]}
                                    onPress={() => toggleSetDone(currentExercise.id, i)}
                                >
                                    <Text style={[styles.checkText, set.done && styles.checkTextDone]}>✓</Text>
                                </TouchableOpacity>

                                {set.isExtra && (
                                    <TouchableOpacity
                                        style={styles.removeBtn}
                                        onPress={() => removeSet(currentExercise.id, i)}
                                    >
                                        <Text style={styles.removeText}>✕</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )
                    })}

                    <TouchableOpacity
                        style={styles.addSetBtn}
                        onPress={() => addSet(currentExercise.id)}
                    >
                        <Text style={styles.addSetText}>+ Add Set</Text>
                    </TouchableOpacity>
                </View>



                <View style={styles.navRow}>
                    <TouchableOpacity
                        style={[styles.navBtn, currentIndex === 0 && styles.navBtnDisabled]}
                        onPress={() => currentIndex > 0 && setCurrentIndex(i => i - 1)}
                    >
                        <Text style={styles.navBtnText}>‹ Prev</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.navBtn, styles.navBtnNext, currentIndex === exercises.length - 1 && styles.navBtnDisabled]}
                        onPress={() => currentIndex < exercises.length - 1 && setCurrentIndex(i => i + 1)}
                    >
                        <Text style={[styles.navBtnText, { color: '#fff' }]}>Next ›</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.finishBtn} onPress={finishSession}>
                    <Text style={styles.finishBtnText}>FINISH SESSION</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.abandonBtn} onPress={abandonSession}>
                    <Text style={styles.abandonText}>Abandon session</Text>
                </TouchableOpacity>
            </ScrollView>

            {sidebarOpen && (
                <TouchableWithoutFeedback onPress={closeSidebar}>
                    <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} />
                </TouchableWithoutFeedback>
            )}

            {sidebarOpen && (
                <Animated.View style={[styles.sidebar, { transform: [{ translateX: sidebarTranslateX }] }]}>
                    <Text style={styles.sidebarTitle}>EXERCISES</Text>
                    <ScrollView showsVerticalScrollIndicator={false}>
                        {exercises.map((pe, index) => {
                            const done = isExerciseDone(pe)
                            const active = index === currentIndex
                            const setsDone = getSetsDoneCount(pe.id)
                            return (
                                <TouchableOpacity
                                    key={pe.id}
                                    style={[
                                        styles.sidebarItem,
                                        active && styles.sidebarItemActive,
                                        done && styles.sidebarItemDone,
                                    ]}
                                    onPress={() => selectExercise(index)}
                                >
                                    <View style={[
                                        styles.sidebarDot,
                                        active && styles.sidebarDotActive,
                                        done && styles.sidebarDotDone,
                                    ]} />
                                    <View style={styles.sidebarText}>
                                        <Text style={styles.sidebarName} numberOfLines={2}>
                                            {pe.exercise?.name}
                                        </Text>
                                        <Text style={styles.sidebarSets}>
                                            {setsDone}/{pe.target_sets} sets
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            )
                        })}
                    </ScrollView>
                </Animated.View>
            )}

        </KeyboardAvoidingView>
    )
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#050505' },
    centered: { flex: 1, backgroundColor: '#050505', justifyContent: 'center', alignItems: 'center' },
    loadingText: { color: '#555', fontSize: 14 },
    addSetBtn: {
        marginTop: 6,
        paddingVertical: 12,
        alignItems: 'center',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#222',
        borderStyle: 'dashed',
    },
    removeBtn: {
        width: 28, height: 44,
        alignItems: 'center', justifyContent: 'center',
    },
    removeText: { color: '#333', fontSize: 13 },
    addSetText: { color: '#444', fontSize: 13 },
    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12, gap: 12,
    },
    menuBtn: {
        width: 36, height: 36, backgroundColor: '#111',
        borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    },
    menuBtnActive: { backgroundColor: '#800000' },
    menuIcon: { color: '#fff', fontSize: 14 },
    headerCenter: { flex: 1 },
    headerLabel: { color: '#555', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 },
    headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
    timer: { color: '#800000', fontSize: 15, fontWeight: '600' },
    progressBarBg: { height: 4, backgroundColor: '#1a1a1a', marginHorizontal: 16, borderRadius: 2, marginBottom: 16 },
    progressBarFill: { height: 4, backgroundColor: '#800000', borderRadius: 2 },
    main: { flex: 1 },
    mainContent: { paddingHorizontal: 16, paddingBottom: 40 },
    exMeta: { marginBottom: 14 },
    exTarget: { color: '#555', fontSize: 12, marginBottom: 4 },
    exPrev: { color: '#800000', fontSize: 12 },
    exCard: { backgroundColor: '#111', borderRadius: 14, padding: 16, marginBottom: 14 },
    setHeader: { flexDirection: 'row', marginBottom: 10 },
    setCol: { flex: 1, color: '#444', fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', textAlign: 'center' },
    setRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    setRowDone: { opacity: 0.45 },
    setNum: { width: 24, color: '#555', fontSize: 13, textAlign: 'center' },
    setNumActive: { color: '#fff', fontWeight: '700' },
    setInput: {
        flex: 1, backgroundColor: '#1a1a1a', borderRadius: 10,
        paddingVertical: 14, paddingHorizontal: 8,
        color: '#fff', fontSize: 18, textAlign: 'center',
    },
    setInputActive: { backgroundColor: '#222' },
    checkBtn: {
        width: 44, height: 44, backgroundColor: '#1a1a1a',
        borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    },
    checkBtnDone: { backgroundColor: '#800000' },
    checkText: { color: '#444', fontSize: 16 },
    checkTextDone: { color: '#fff' },
    logBtn: {
        backgroundColor: '#800000', borderRadius: 12,
        paddingVertical: 18, alignItems: 'center', marginBottom: 12,
    },
    logBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 1 },
    navRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
    navBtn: {
        flex: 1, backgroundColor: '#111', borderRadius: 12,
        paddingVertical: 14, alignItems: 'center',
    },
    navBtnNext: { backgroundColor: '#1a1a1a' },
    navBtnDisabled: { opacity: 0.3 },
    navBtnText: { color: '#555', fontSize: 14, fontWeight: '600' },
    finishBtn: {
        backgroundColor: '#111', borderRadius: 12,
        paddingVertical: 16, alignItems: 'center',
        borderWidth: 1, borderColor: '#800000', marginBottom: 10,
    },
    finishBtnText: { color: '#800000', fontSize: 14, fontWeight: '700', letterSpacing: 1 },
    abandonBtn: { alignItems: 'center', paddingVertical: 12 },
    abandonText: { color: '#333', fontSize: 13 },
    overlay: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 10,
    },
    sidebar: {
        position: 'absolute', top: 0, left: 0, bottom: 0,
        width: 240, backgroundColor: '#0d0d0d',
        borderRightWidth: 1, borderRightColor: '#1a1a1a',
        zIndex: 11, paddingTop: 56, paddingHorizontal: 10,
    },
    sidebarTitle: { color: '#555', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12, paddingHorizontal: 4 },
    sidebarItem: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        padding: 12, borderRadius: 10, marginBottom: 4,
    },
    sidebarItemActive: { backgroundColor: '#800000' },
    sidebarItemDone: { opacity: 0.45 },
    sidebarDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#333', flexShrink: 0 },
    sidebarDotActive: { backgroundColor: '#fff' },
    sidebarDotDone: { backgroundColor: '#800000' },
    sidebarText: { flex: 1 },
    sidebarName: { color: '#fff', fontSize: 13, marginBottom: 2 },
    sidebarSets: { color: '#555', fontSize: 11 },
})