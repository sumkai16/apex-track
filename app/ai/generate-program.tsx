import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React, { useEffect, useRef, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
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
    acknowledgment: string
}

interface Message {
    role: 'ai' | 'user'
    text: string
    isTyping?: boolean
}

export default function GenerateProgramScreen() {
    const [questions, setQuestions] = useState<Question[]>([])
    const [currentIndex, setCurrentIndex] = useState(0)
    const [messages, setMessages] = useState<Message[]>([])
    const [answers, setAnswers] = useState<Record<string, string>>({})
    const [inputText, setInputText] = useState('')
    const [generating, setGenerating] = useState(false)
    const [loading, setLoading] = useState(true)
    const [isTyping, setIsTyping] = useState(false)
    const [displayName, setDisplayName] = useState('')
    const [locked, setLocked] = useState(false)
    const scrollRef = useRef<ScrollView>(null)

    useEffect(() => {
        fetchData()
    }, [])

    async function fetchData() {
        const { data: { user } } = await supabase.auth.getUser()
        let name = ''
        if (user) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('display_name')
                .eq('id', user.id)
                .single()
            if (profile?.display_name) {
                name = profile.display_name.split(' ')[0] // first name only
                setDisplayName(name)
            }
        }

        const { data } = await supabase
            .from('ai_generator_questions')
            .select('*')
            .eq('is_active', true)
            .order('order_index')

        if (data && data.length > 0) {
            setQuestions(data)
            const greeting = name
                ? `Hey ${name}! I'm your AI coach. Let's build you a personalized training program. ${data[0].question}`
                : `Hey! I'm your AI coach. Let's build you a personalized training program. ${data[0].question}`
            setMessages([{ role: 'ai', text: greeting }])
        }
        setLoading(false)
    }

    function scrollToBottom() {
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)
    }

    async function handleAnswer(answer: string) {
        if (locked) return
        const current = questions[currentIndex]
        if (!current) return

        setLocked(true)
        setInputText('')

        const newAnswers = { ...answers, [current.field_key]: answer }
        setAnswers(newAnswers)

        // Add user message
        setMessages(prev => [...prev, { role: 'user', text: answer }])
        scrollToBottom()

        // Show typing indicator
        await delay(400)
        setIsTyping(true)
        scrollToBottom()

        // Build acknowledgment
        const ack = current.acknowledgment?.replace('{answer}', answer) || `Got it — "${answer}".`

        const nextIndex = currentIndex + 1
        let aiResponse = ''

        if (nextIndex < questions.length) {
            aiResponse = `${ack} ${questions[nextIndex].question}`
        } else {
            aiResponse = `${ack} Perfect — I have everything I need. Give me a moment while I build your personalized program! 💪`
        }

        // Simulate typing delay based on message length
        await delay(Math.min(800 + aiResponse.length * 10, 2000))
        setIsTyping(false)

        setMessages(prev => [...prev, { role: 'ai', text: aiResponse }])
        setCurrentIndex(nextIndex)
        scrollToBottom()

        if (nextIndex >= questions.length) {
            await delay(600)
            generateProgram(newAnswers)
        } else {
            setLocked(false)
        }
    }

    function delay(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    function handleSend() {
        if (!inputText.trim() || locked) return
        handleAnswer(inputText.trim())
    }

    async function generateProgram(finalAnswers: Record<string, string>) {
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
                .map(q => `${q.field_key}: ${finalAnswers[q.field_key] || 'not specified'}`)
                .join('\n')

            const daysMatch = finalAnswers['days_per_week']?.match(/\d+/)
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
            setGenerating(false)
            Alert.alert('Error', 'Failed to generate program. Please try again.')
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

        setGenerating(false)

        setMessages(prev => [...prev, {
            role: 'ai',
            text: `🎉 Your program "${parsed.program_name}" is ready! Head to Programs to check it out and set it as active.`
        }])
        scrollToBottom()

        await delay(1500)
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

    const isComplete = currentIndex >= questions.length

    if (loading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator color="#800000" />
            </View>
        )
    }

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
            <StatusBar barStyle="light-content" />
            <View style={styles.topBar}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="chevron-back" size={22} color="#fff" />
                </TouchableOpacity>
                <View style={styles.topBarCenter}>
                    <Ionicons name="sparkles" size={14} color="#800000" />
                    <Text style={styles.topBarTitle}>AI Program Generator</Text>
                </View>
                <View style={{ width: 36 }} />
            </View>

            <ScrollView
                ref={scrollRef}
                contentContainerStyle={styles.scroll}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {messages.map((msg, i) => (
                    <View
                        key={i}
                        style={[
                            styles.bubbleWrapper,
                            msg.role === 'user' ? styles.bubbleWrapperUser : styles.bubbleWrapperAI,
                        ]}
                    >
                        {msg.role === 'ai' && (
                            <View style={styles.aiAvatar}>
                                <Ionicons name="sparkles" size={12} color="#800000" />
                            </View>
                        )}
                        <View style={[
                            styles.bubble,
                            msg.role === 'user' ? styles.bubbleUser : styles.bubbleAI,
                        ]}>
                            <Text style={[
                                styles.bubbleText,
                                msg.role === 'user' ? styles.bubbleTextUser : styles.bubbleTextAI,
                            ]}>
                                {msg.text}
                            </Text>
                        </View>
                    </View>
                ))}

                {isTyping && (
                    <View style={styles.bubbleWrapperAI}>
                        <View style={styles.aiAvatar}>
                            <Ionicons name="sparkles" size={12} color="#800000" />
                        </View>
                        <View style={[styles.bubble, styles.bubbleAI, styles.typingBubble]}>
                            <Text style={styles.typingDots}>● ● ●</Text>
                        </View>
                    </View>
                )}

                {generating && (
                    <View style={styles.bubbleWrapperAI}>
                        <View style={styles.aiAvatar}>
                            <Ionicons name="sparkles" size={12} color="#800000" />
                        </View>
                        <View style={[styles.bubble, styles.bubbleAI]}>
                            <ActivityIndicator color="#800000" size="small" />
                            <Text style={[styles.bubbleText, styles.bubbleTextAI, { marginLeft: 8 }]}>
                                Building your program...
                            </Text>
                        </View>
                    </View>
                )}
            </ScrollView>

            {!isComplete && !generating && (
                <View style={styles.inputArea}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.chipsRow}
                        keyboardShouldPersistTaps="handled"
                    >
                        {questions[currentIndex]?.suggestions.map((s, i) => (
                            <TouchableOpacity
                                key={i}
                                style={styles.chip}
                                onPress={() => handleSuggestion(s)}
                                activeOpacity={0.8}
                                disabled={locked}
                            >
                                <Text style={styles.chipText}>{s}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    <View style={styles.textRow}>
                        <TextInput
                            style={styles.input}
                            placeholder="Or type your own answer..."
                            placeholderTextColor="#333"
                            value={inputText}
                            onChangeText={setInputText}
                            onSubmitEditing={handleSend}
                            returnKeyType="send"
                            editable={!locked}
                        />
                        <TouchableOpacity
                            style={[styles.sendBtn, (!inputText.trim() || locked) && styles.sendBtnDisabled]}
                            onPress={handleSend}
                            disabled={!inputText.trim() || locked}
                            activeOpacity={0.8}
                        >
                            <Ionicons name="arrow-up" size={18} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </KeyboardAvoidingView>
    )

    function handleSuggestion(suggestion: string) {
        handleAnswer(suggestion)
    }
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
        borderBottomWidth: 1,
        borderBottomColor: '#1a1a1a',
    },
    topBarCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    backBtn: {
        width: 36,
        height: 36,
        backgroundColor: '#111',
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    topBarTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
    scroll: {
        paddingHorizontal: 16,
        paddingTop: 20,
        paddingBottom: 20,
        gap: 12,
        flexGrow: 1,
    },
    bubbleWrapper: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 8,
        marginBottom: 4,
    },
    bubbleWrapperAI: { alignSelf: 'flex-start', maxWidth: '85%' },
    bubbleWrapperUser: { alignSelf: 'flex-end', flexDirection: 'row-reverse', maxWidth: '85%' },
    aiAvatar: {
        width: 26,
        height: 26,
        backgroundColor: 'rgba(128,0,0,0.15)',
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(128,0,0,0.3)',
        flexShrink: 0,
    },
    bubble: {
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        flexShrink: 1,
    },
    bubbleAI: {
        backgroundColor: '#111',
        borderWidth: 1,
        borderColor: '#1a1a1a',
        borderBottomLeftRadius: 4,
    },
    bubbleUser: {
        backgroundColor: '#800000',
        borderBottomRightRadius: 4,
    },
    bubbleText: { fontSize: 14, lineHeight: 20, flexShrink: 1 },
    bubbleTextAI: { color: '#ccc' },
    bubbleTextUser: { color: '#fff' },
    typingBubble: { paddingVertical: 12 },
    typingDots: { color: '#555', fontSize: 10, letterSpacing: 4 },
    inputArea: {
        borderTopWidth: 1,
        borderTopColor: '#1a1a1a',
        paddingBottom: Platform.OS === 'ios' ? 24 : 12,
        paddingTop: 12,
        backgroundColor: '#050505',
    },
    chipsRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 10 },
    chip: {
        backgroundColor: '#111',
        borderWidth: 1,
        borderColor: '#800000',
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    chipText: { color: '#fff', fontSize: 13 },
    textRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        gap: 10,
    },
    input: {
        flex: 1,
        backgroundColor: '#111',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
        color: '#fff',
        fontSize: 14,
        borderWidth: 1,
        borderColor: '#1a1a1a',
    },
    sendBtn: {
        width: 38,
        height: 38,
        backgroundColor: '#800000',
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendBtnDisabled: { opacity: 0.4 },
})