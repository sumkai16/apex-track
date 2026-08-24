import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";

/** Kept in the transcript on device. */
const MAX_STORED = 50;
/** Sent up per turn — the Edge Function enforces the same cap independently. */
const MAX_SENT = 10;
/**
 * Deliberately outside the Edge Function's own 45s upstream abort, so its
 * structured error message wins the race instead of this generic one.
 */
const REQUEST_TIMEOUT_MS = 55000;
/** One reveal step per frame, sized so even a long reply lands inside MAX_TYPE_MS. */
const TYPE_TICK_MS = 16;
const MAX_TYPE_MS = 3500;

const STARTERS = [
  "How's my bench progressing?",
  "Is my current program balanced?",
  "What should I train today?",
  "How do I break through a plateau?",
];

/**
 * Shaped to map 1:1 onto a future `chat_messages` table — see
 * plans/ai-chat-coach.md. `status` is client-only and stripped before both
 * sending and persisting.
 */
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  status?: "failed";
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function storageKey(userId: string): string {
  return `apextrack.chat.v1.${userId}`;
}

/** The coach's face. Sparkles matches the Generate Program FAB in (tabs)/_layout. */
function AiAvatar() {
  return (
    <View style={styles.aiAvatar}>
      <Ionicons name="sparkles" size={13} color="#fff" />
    </View>
  );
}

function TypingDots() {
  const dots = useRef([
    new Animated.Value(0.3),
    new Animated.Value(0.3),
    new Animated.Value(0.3),
  ]).current;

  useEffect(() => {
    const loops = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(dot, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.3,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.delay((2 - i) * 160),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [dots]);

  return (
    <View style={styles.assistantRow}>
      <AiAvatar />
      <View style={[styles.bubble, styles.assistantBubble, styles.typingBubble]}>
        {dots.map((dot, i) => (
          <Animated.View key={i} style={[styles.typingDot, { opacity: dot }]} />
        ))}
      </View>
    </View>
  );
}

/**
 * Reveals `text` a few characters at a time. The counter lives here rather
 * than in ChatScreen so a 60fps reveal re-renders one bubble, not the whole
 * transcript. Bumping `skipToken` jumps straight to the end; `onDone` fires
 * once the last character lands, either way.
 */
function TypewriterText({
  text,
  skipToken,
  onDone,
}: {
  text: string;
  skipToken: number;
  onDone: () => void;
}) {
  const [count, setCount] = useState(0);
  // Only a bump *after* mount is a skip — the token carries over from whatever
  // the previous reply did, and that must not fast-forward this one.
  const tokenAtMount = useRef(skipToken).current;

  useEffect(() => {
    const step = Math.max(
      1,
      Math.ceil(text.length / (MAX_TYPE_MS / TYPE_TICK_MS)),
    );
    const timer = setInterval(() => setCount((c) => c + step), TYPE_TICK_MS);
    return () => clearInterval(timer);
  }, [text]);

  useEffect(() => {
    if (skipToken !== tokenAtMount) setCount(text.length);
  }, [skipToken, tokenAtMount, text.length]);

  const complete = count >= text.length;
  useEffect(() => {
    if (complete) onDone();
  }, [complete, onDone]);

  return (
    <Text style={styles.assistantText} selectable>
      {text.slice(0, count)}
    </Text>
  );
}

export default function ChatScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  // The one reply currently being revealed. Only ever set for a message that
  // just arrived — a transcript restored from storage renders in full.
  const [typingId, setTypingId] = useState<string | null>(null);
  const [skipToken, setSkipToken] = useState(0);

  const scrollRef = useRef<ScrollView>(null);
  const mountedRef = useRef(true);
  // Synchronous guard. `sending` state is not enough: with React 19 batching
  // and reactCompiler enabled (app.json), a fast double-tap can run both
  // handlers before the re-render lands and bill two requests.
  const inFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // The composer rises with the keyboard, but the transcript below it would
  // stay put and hide the newest message behind it.
  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => scrollRef.current?.scrollToEnd({ animated: true }),
    );
    return () => show.remove();
  }, []);

  // Load the user, their name, and any stored transcript.
  useEffect(() => {
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || !mountedRef.current) return;
        setUserId(user.id);

        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", user.id)
          .maybeSingle();
        if (profile?.display_name && mountedRef.current) {
          setDisplayName(String(profile.display_name).split(" ")[0]);
        }

        const stored = await AsyncStorage.getItem(storageKey(user.id));
        if (stored && mountedRef.current) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) setMessages(parsed);
        }
      } catch (err) {
        // A failed restore costs the transcript, not the screen.
        console.log("Chat load error:", err);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
  }, []);

  const persist = useCallback(
    (next: ChatMessage[]) => {
      if (!userId) return;
      const trimmed = next
        .slice(-MAX_STORED)
        .map(({ id, role, content, created_at }) => ({
          id,
          role,
          content,
          created_at,
        }));
      AsyncStorage.setItem(storageKey(userId), JSON.stringify(trimmed)).catch(
        (err) => console.log("Chat persist error:", err),
      );
    },
    [userId],
  );

  const requestReply = useCallback(
    async (history: ChatMessage[]) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setSending(true);
      try {
        const payload = history
          .filter((m) => m.status !== "failed")
          .slice(-MAX_SENT)
          .map(({ role, content }) => ({ role, content }));

        // The Edge Function aborts its own upstream call at 25s; this race is
        // the client-side safety net for a stalled connection. It stops us
        // waiting — it can't cancel an in-flight invoke.
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("The coach took too long to reply.")),
            REQUEST_TIMEOUT_MS,
          ),
        );

        const { data, error } = (await Promise.race([
          supabase.functions.invoke("chat", { body: { messages: payload } }),
          timeout,
        ])) as { data: { reply?: string } | null; error: unknown };

        if (error) {
          let message = "Couldn't reach the coach. Check your connection.";
          const context = (error as { context?: Response }).context;
          if (context && typeof context.json === "function") {
            const body = await context.json().catch(() => null);
            if (body?.error) message = String(body.error);
          }
          throw new Error(message);
        }

        const reply = data?.reply;
        if (!reply) throw new Error("The coach sent back an empty reply.");

        if (!mountedRef.current) return;
        const assistantMessage: ChatMessage = {
          id: makeId(),
          role: "assistant",
          content: reply,
          created_at: new Date().toISOString(),
        };
        const next: ChatMessage[] = [
          ...history.filter((m) => m.status !== "failed"),
          assistantMessage,
        ];
        setMessages(next);
        setTypingId(assistantMessage.id);
        // The full text is stored immediately — the reveal is display-only.
        persist(next);
      } catch (err) {
        if (!mountedRef.current) return;
        const message =
          err instanceof Error
            ? err.message
            : "Something went wrong. Please try again.";
        setMessages((prev) => [
          ...prev,
          {
            id: makeId(),
            role: "assistant",
            content: message,
            created_at: new Date().toISOString(),
            status: "failed",
          },
        ]);
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current) setSending(false);
      }
    },
    [persist],
  );

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || inFlightRef.current) return;

      const userMessage: ChatMessage = {
        id: makeId(),
        role: "user",
        content: text,
        created_at: new Date().toISOString(),
      };
      // Drop any trailing error bubble — it isn't part of the conversation.
      const base = messages.filter((m) => m.status !== "failed");
      const next = [...base, userMessage];

      setMessages(next);
      setInput("");
      setTypingId(null);
      persist(next);
      requestReply(next);
    },
    [messages, persist, requestReply],
  );

  const retry = useCallback(() => {
    if (inFlightRef.current) return;
    // Re-send the existing turn — no duplicate user bubble.
    const cleaned = messages.filter((m) => m.status !== "failed");
    setMessages(cleaned);
    setTypingId(null);
    requestReply(cleaned);
  }, [messages, requestReply]);

  const clearConversation = useCallback(() => {
    if (!messages.length) return;
    Alert.alert(
      "Clear conversation",
      "This deletes the whole thread from this device. It can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            setMessages([]);
            setTypingId(null);
            if (userId) {
              await AsyncStorage.removeItem(storageKey(userId)).catch(() => {});
            }
          },
        },
      ],
    );
  }, [messages.length, userId]);

  const finishTyping = useCallback(() => setTypingId(null), []);

  // A tap anywhere on the screen fast-forwards the reveal. Harmless when
  // nothing is animating, so it can sit on the root view without guarding
  // taps meant for the composer or the top bar.
  const skipTyping = useCallback(() => {
    if (typingId) setSkipToken((t) => t + 1);
  }, [typingId]);

  const canSend = input.trim().length > 0 && !sending;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      // "padding" on both platforms. Android needs it explicitly: with
      // edgeToEdgeEnabled (app.json) the window no longer shrinks under
      // adjustResize, so leaving behavior undefined left the composer sitting
      // behind the keyboard. The padding is derived from this view's measured
      // frame vs. the keyboard's screen position, so on any device where the
      // window *does* resize it resolves to ~0 rather than double-shifting.
      behavior="padding"
      onTouchStart={skipTyping}
    >
      <StatusBar barStyle="light-content" />

      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={24} color="#800000" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1}>
          AI Coach
        </Text>
        <TouchableOpacity
          onPress={clearConversation}
          style={styles.iconBtn}
          disabled={!messages.length}
        >
          <Ionicons
            name="trash-outline"
            size={20}
            color={messages.length ? "#888" : "#2a2a2a"}
          />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#800000" size="large" />
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messages}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() =>
            // An animated scroll per revealed chunk would queue 60 competing
            // animations a second, so the reveal tracks the bottom directly.
            scrollRef.current?.scrollToEnd({ animated: !typingId })
          }
        >
          {messages.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="sparkles-outline" size={26} color="#800000" />
              </View>
              <Text style={styles.emptyTitle}>
                {displayName ? `Hey ${displayName}` : "Hey"}
              </Text>
              <Text style={styles.emptyBody}>
                Ask me anything about your training. I can see your programs and
                everything you&apos;ve logged.
              </Text>
              {STARTERS.map((starter) => (
                <TouchableOpacity
                  key={starter}
                  style={styles.starter}
                  onPress={() => send(starter)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.starterText}>{starter}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            messages.map((message) => {
              // A failed turn isn't the coach speaking, so it gets no avatar —
              // just the spacer, so its text still lines up with the replies.
              if (message.status === "failed") {
                return (
                  <View key={message.id} style={styles.assistantRow}>
                    <View style={styles.avatarSpacer} />
                    <View style={styles.errorBubble}>
                      <Text style={styles.errorText}>{message.content}</Text>
                      <TouchableOpacity onPress={retry} style={styles.retryBtn}>
                        <Ionicons name="refresh" size={14} color="#fff" />
                        <Text style={styles.retryText}>Retry</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }

              if (message.role === "user") {
                return (
                  <View
                    key={message.id}
                    style={[styles.bubble, styles.userBubble]}
                  >
                    <Text style={styles.userText} selectable>
                      {message.content}
                    </Text>
                  </View>
                );
              }

              return (
                <View key={message.id} style={styles.assistantRow}>
                  <AiAvatar />
                  <View style={[styles.bubble, styles.assistantBubble]}>
                    {message.id === typingId ? (
                      <TypewriterText
                        text={message.content}
                        skipToken={skipToken}
                        onDone={finishTyping}
                      />
                    ) : (
                      <Text style={styles.assistantText} selectable>
                        {message.content}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })
          )}

          {sending && <TypingDots />}
        </ScrollView>
      )}

      <View style={styles.footer}>
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask your coach..."
            placeholderTextColor="#555"
            multiline
            maxLength={2000}
            editable={!sending}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            onPress={() => send(input)}
            disabled={!canSend}
            activeOpacity={0.8}
          >
            <Ionicons
              name="arrow-up"
              size={20}
              color={canSend ? "#fff" : "#555"}
            />
          </TouchableOpacity>
        </View>
        <Text style={styles.disclaimer}>
          AI guidance, not medical advice. Your profile and training data are sent
          to generate replies.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050505" },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 52,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
  },
  iconBtn: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  topBarTitle: {
    flex: 1,
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },

  messages: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },

  bubble: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    alignSelf: "flex-end",
    maxWidth: "85%",
    marginBottom: 10,
    backgroundColor: "#800000",
  },
  // Assistant bubbles sit in a row next to the avatar, so the row owns the
  // spacing and the bubble shrinks to fit the width the avatar leaves.
  assistantRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginBottom: 10,
    paddingRight: 32,
  },
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#800000",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarSpacer: { width: 28 },
  assistantBubble: {
    flexShrink: 1,
    backgroundColor: "#1a1a1a",
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  userText: { color: "#fff", fontSize: 15, lineHeight: 21 },
  assistantText: { color: "#e8e8e8", fontSize: 15, lineHeight: 21 },

  typingBubble: { flexDirection: "row", alignItems: "center", gap: 5 },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#9a9a9a",
  },

  errorBubble: {
    flexShrink: 1,
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: "#3a1a1a",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorText: { color: "#ff8a8a", fontSize: 14, lineHeight: 20 },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: 10,
    backgroundColor: "#800000",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  retryText: { color: "#fff", fontSize: 13, fontWeight: "600" },

  empty: { alignItems: "center", paddingTop: 40, paddingHorizontal: 4 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptyBody: {
    color: "#9a9a9a",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 24,
  },
  starter: {
    alignSelf: "stretch",
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  starterText: { color: "#cfcfcf", fontSize: 14 },

  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    // No SafeAreaProvider is mounted in this app and no screen uses insets, so
    // this is the house fake-inset convention. Verify on an edge-to-edge
    // Android device that the send button clears the gesture pill.
    paddingBottom: Platform.OS === "ios" ? 28 : 16,
    borderTopWidth: 1,
    borderTopColor: "#1a1a1a",
    backgroundColor: "#0a0a0a",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  disclaimer: {
    color: "#444",
    fontSize: 10.5,
    lineHeight: 14,
    textAlign: "center",
    marginTop: 8,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    color: "#fff",
    fontSize: 15,
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#800000",
    justifyContent: "center",
    alignItems: "center",
  },
  sendBtnDisabled: { backgroundColor: "#1a1a1a" },
});
