import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native'
import { supabase } from '../../lib/supabase'

interface Question {
    id: string
    order_index: number
    question: string
    field_key: string
    suggestions: string[]
}

export default function GenerateProgramScreen() {
    const [questions, setQuestions] = useState<Question[]>([])
    const [answers, setAnswers] = useState<Record<string, string>>({})
    const [displayName, setDisplayName] = useState('')
    const [loading, setLoading] = useState(true)
    const [generating, setGenerating] = useState(false)

    // AI toggle state - must be activated to enable Generate button
    const [aiActivated, setAiActivated] = useState(false)

    useEffect(() => {
        fetchData()
    }, [])

    async function fetchData() {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('display_name')
                .eq('id', user.id)
                .single()
            if (profile?.display_name) {
                setDisplayName(profile.display_name.split(' ')[0])
            }
        }

        const { data } = await supabase
            .from('ai_generator_questions')
            .select('*')
            .eq('is_active', true)
            .order('order_index')

        if (data) setQuestions(data)
        setLoading(false)
    }

    function selectAnswer(fieldKey: string, answer: string) {
        setAnswers(prev => ({ ...prev, [fieldKey]: answer }))
    }

    function isComplete() {
        return questions.every(q => answers[q.field_key])
    }

    async function handleGenerate() {
        if (!isComplete()) {
            Alert.alert('Incomplete', 'Please answer all questions before generating.')
            return
        }

        setGenerating(true)

        try {
            const { data: exercises } = await supabase
                .from('exercises')
                .select('id, name, category, equipment_type')

            if (!exercises || exercises.length === 0) {
                Alert.alert('Error', 'No exercises found in the database.')
                setGenerating(false)
                return
            }

            const exerciseList = exercises
                .map(e => `- ${e.name} (id: ${e.id}, category: ${e.category}, equipment: ${e.equipment_type})`)
                .join('\n')

            const answerSummary = questions
                .map(q => `${q.field_key}: ${answers[q.field_key]}`)
                .join('\n')

            const daysMatch = answers['days_per_week']?.match(/\d+/)
            const daysPerWeek = daysMatch ? parseInt(daysMatch[0]) : 4

            const prompt = `You are a certified strength and conditioning coach with expertise in evidence-based training. Generate a personalized training program based on the following user profile:

${answerSummary}

You MUST only use exercises from this exact list. Use the exact id values provided:
${exerciseList}

Respond ONLY with a valid JSON object in this exact format, no explanation, no markdown:
{
  "program_name": "string",
  "description": "string (1-2 sentences, science-based rationale)",
  "days": [
    {
      "name": "string (e.g. Upper Body A)",
      "day_order": 0,
      "exercises": [
        {
          "exercise_id": "uuid from the list above",
          "target_sets": number,
          "target_reps": number,
          "order_index": 0
        }
      ]
    }
  ]
}

Rules:
- Only include ${daysPerWeek} training days (no rest days in the array)
- Adjust exercises per day based on session_duration (30-45 min = 3-4 exercises, 45-60 min = 4-5, 60-90 min = 5-6)
- Avoid exercises that aggravate the user's stated limitations
- Use progressive overload principles appropriate for the user's level
- Balance muscle groups appropriately for the stated goal and style
- Only use exercise IDs from the list provided
- target_reps should be a single number (e.g. 8, not "8-12")`

            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.EXPO_PUBLIC_GEMINI_API_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { temperature: 0.7 },
                    }),
                }
            )

            const data = await response.json()
            const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text
            if (!rawText) throw new Error('No response from AI')

            const clean = rawText.replace(/```json|```/g, '').trim()
            const parsed = JSON.parse(clean)

            await saveProgram(parsed, daysPerWeek)

        } catch (err) {
            console.log('Generate error:', err)
            Alert.alert('Error', 'Failed to generate program. Please try again.')
        } finally {
            setGenerating(false)
        }
    }

    async function saveProgram(parsed: any, daysPerWeek: number) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: program, error: programError } = await supabase
            .from('programs')
            .insert({
                user_id: user.id,
                name: parsed.program_name,
                description: parsed.description,
            })
            .select()
            .single()

        if (programError || !program) throw new Error('Failed to create program')

        const allDays = []
        let trainingIndex = 0
        for (let i = 0; i < 7; i++) {
            if (trainingIndex < parsed.days.length && shouldTrainOnDay(i, daysPerWeek)) {
                allDays.push({
                    program_id: program.id,
                    name: parsed.days[trainingIndex].name,
                    day_order: i,
                    is_rest_day: false,
                })
                trainingIndex++
            } else {
                allDays.push({
                    program_id: program.id,
                    name: getDayName(i),
                    day_order: i,
                    is_rest_day: true,
                })
            }
        }

        const { data: createdDays, error: daysError } = await supabase
            .from('program_days')
            .insert(allDays)
            .select()

        if (daysError || !createdDays) throw new Error('Failed to create days')

        const trainingDays = createdDays.filter(d => !d.is_rest_day)
        for (let i = 0; i < parsed.days.length; i++) {
            const day = parsed.days[i]
            const createdDay = trainingDays[i]
            if (!createdDay) continue

            const exercisesPayload = day.exercises.map((ex: any, idx: number) => ({
                program_day_id: createdDay.id,
                exercise_id: ex.exercise_id,
                target_sets: ex.target_sets,
                target_reps: ex.target_reps,
                order_index: idx,
            }))

            await supabase.from('program_exercises').insert(exercisesPayload)
        }

        Alert.alert(
            '🎉 Program Created!',
            `"${parsed.program_name}" has been added to your programs.`,
            [{
                text: 'View Program',
                onPress: () => router.replace(`/programs/${program.id}`)
            }]
        )
    }

    function shouldTrainOnDay(dayIndex: number, totalDays: number): boolean {
        const patterns: Record<number, number[]> = {
            3: [0, 2, 4],
            4: [0, 1, 3, 4],
            5: [0, 1, 2, 4, 5],
            6: [0, 1, 2, 3, 4, 5],
        }
        return patterns[totalDays]?.includes(dayIndex) ?? false
    }

    function getDayName(index: number): string {
        return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][index]
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
            <View style={styles.topBar}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="chevron-back" size={22} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.topBarTitle}>AI Program Generator</Text>
                <View style={{ width: 36 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                <View style={styles.header}>
                    <Ionicons name="sparkles" size={20} color="#800000" />
                    <Text style={styles.headerText}>
                        {displayName ? `Let's build your program, ${displayName}.` : "Let's build your program."}
                    </Text>
                </View>
                <Text style={styles.headerSub}>Answer the questions below and we'll generate a science-based training program tailored to you.</Text>

                {questions.map((q, qi) => (
                    <View key={q.id} style={styles.questionBlock}>
                        <Text style={styles.questionNumber}>0{qi + 1}</Text>
                        <Text style={styles.questionText}>{q.question}</Text>
                        <View style={styles.chipsRow}>
                            {q.suggestions.map((s, si) => (
                                <TouchableOpacity
                                    key={si}
                                    style={[
                                        styles.chip,
                                        answers[q.field_key] === s && styles.chipSelected
                                    ]}
                                    onPress={() => selectAnswer(q.field_key, s)}
                                    activeOpacity={0.8}
                                >
                                    <Text style={[
                                        styles.chipText,
                                        answers[q.field_key] === s && styles.chipTextSelected
                                    ]}>
                                        {s}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                ))}

                <TouchableOpacity
                    style={[styles.generateBtn, (!isComplete() || generating) && styles.generateBtnDisabled]}
                    onPress={handleGenerate}
                    disabled={!isComplete() || generating}
                    activeOpacity={0.85}
                >
                    {generating ? (
                        <View style={styles.btnRow}>
                            <ActivityIndicator color="#fff" size="small" />
                            <Text style={styles.generateBtnText}>Generating your program...</Text>
                        </View>
                    ) : (
                        <View style={styles.btnRow}>
                            <Ionicons name="sparkles" size={18} color="#fff" />
                            <Text style={styles.generateBtnText}>Generate Program</Text>
                        </View>
                    )}
                </TouchableOpacity>

                <Text style={styles.disclaimer}>
                    Program is generated based on evidence-based training principles. Always consult a professional before starting a new training regimen.
                </Text>
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
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 56,
        paddingBottom: 16,
    },
    backBtn: {
        width: 36,
        height: 36,
        backgroundColor: '#111',
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    topBarTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
    scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
        marginTop: 8,
    },
    headerText: { color: '#fff', fontSize: 18, fontWeight: '700', flex: 1 },
    headerSub: { color: '#555', fontSize: 13, lineHeight: 19, marginBottom: 28 },
    questionBlock: { marginBottom: 28 },
    questionNumber: {
        color: '#800000',
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1,
        marginBottom: 6,
    },
    questionText: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 12 },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: '#111',
        borderWidth: 1,
        borderColor: '#1a1a1a',
    },
    chipSelected: {
        backgroundColor: 'rgba(128,0,0,0.15)',
        borderColor: '#800000',
    },
    chipText: { color: '#555', fontSize: 13 },
    chipTextSelected: { color: '#fff', fontWeight: '600' },
    generateBtn: {
        backgroundColor: '#800000',
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 8,
        marginBottom: 16,
    },
    generateBtnDisabled: { opacity: 0.4 },
    generateBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    btnRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    disclaimer: {
        color: '#333',
        fontSize: 11,
        lineHeight: 17,
        textAlign: 'center',
    },
})
