import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "@react-navigation/native";
import { COLORS } from "../constants/colors";
import { analyzeJournalEntryWithContext } from "../services/aiJournalService";
import {
  addJournalExchange,
  createJournalSession,
  deleteJournalSession,
  getJournalSessions,
} from "../services/journalService";
import { formatLongDate } from "../utils/date";

const DEFAULT_SUGGESTIONS = [
  "What helped me feel relaxed today?",
  "Which part of my productive day felt most natural and easy?",
  "How can I recreate this 7 out of 7 mood tomorrow?",
  "What did I do differently before this calm, focused momentum?",
];

export default function JournalChatScreen() {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [suggestedPrompts, setSuggestedPrompts] = useState(DEFAULT_SUGGESTIONS);

  const scrollRef = useRef(null);

  const loadSessions = useCallback(async () => {
    const stored = await getJournalSessions();
    if (stored.length) {
      setSessions(stored);
      setActiveSessionId((prev) => prev || stored[0].id);
      return;
    }

    const first = await createJournalSession("Today reflection");
    setSessions([first]);
    setActiveSessionId(first.id);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSessions();
    }, [loadSessions]),
  );

  const activeSession = useMemo(
    () =>
      sessions.find((session) => session.id === activeSessionId) ||
      sessions[0] ||
      null,
    [sessions, activeSessionId],
  );

  const messages = activeSession?.messages || [];
  const trendLabel = (session) => {
    const value = String(session?.moodTrend || "stable");
    if (value === "improving") return "Mood: Improving";
    if (value === "declining") return "Mood: Declining";
    return "Mood: Stable";
  };

  const submitText = useCallback(
    async (inputText) => {
      const text = String(inputText || "").trim();
      if (!text || loading || !activeSession) return;

      setDraft("");
      setLoading(true);

      const optimisticUserMessage = {
        id: `optimistic_user_${Date.now()}`,
        role: "user",
        text,
        createdAt: new Date().toISOString(),
      };

      setSessions((prev) =>
        prev.map((session) =>
          session.id === activeSession.id
            ? {
                ...session,
                messages: [...session.messages, optimisticUserMessage],
              }
            : session,
        ),
      );

      try {
        const history = (activeSession.messages || [])
          .slice(-8)
          .map((message) => ({
            role: message.role,
            text: message.text,
          }));

        const analysis = await analyzeJournalEntryWithContext(text, {
          history,
        });
        const result = await addJournalExchange({
          sessionId: activeSession.id,
          userText: text,
          analysis,
        });

        setSessions(result.sessions);
        setActiveSessionId(result.sessionId);

        const nextPrompt =
          String(analysis.followUpQuestion || "").trim() ||
          (Array.isArray(analysis.suggestedQuestions)
            ? String(analysis.suggestedQuestions[0] || "").trim()
            : "");
        if (nextPrompt) {
          setSuggestedPrompts([nextPrompt]);
        }
      } finally {
        setLoading(false);
        setTimeout(
          () => scrollRef.current?.scrollToEnd({ animated: true }),
          50,
        );
      }
    },
    [activeSession, loading],
  );

  const startNewChat = async () => {
    const session = await createJournalSession("New reflection");
    const updated = await getJournalSessions();
    setSessions(updated);
    setActiveSessionId(session.id);
    setSuggestedPrompts(DEFAULT_SUGGESTIONS);
    setHistoryOpen(false);
  };

  const handleDeleteSession = async (sessionId) => {
    const updated = await deleteJournalSession(sessionId);
    if (!updated.length) {
      const first = await createJournalSession("New reflection");
      setSessions([first]);
      setActiveSessionId(first.id);
      return;
    }

    setSessions(updated);
    if (activeSessionId === sessionId) {
      setActiveSessionId(updated[0].id);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable
          style={styles.iconButton}
          onPress={() => setHistoryOpen(true)}
        >
          <Ionicons name="menu" size={20} color={COLORS.primary} />
        </Pressable>

        <View style={styles.titleWrap}>
          <Text style={styles.topTitle}>Journal</Text>
        </View>

        <Pressable style={styles.newChatButton} onPress={startNewChat}>
          <Text style={styles.newChatButtonText}>New chat</Text>
        </Pressable>
      </View>

      <View style={styles.chatWindow}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.chatContent}
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: true })
          }
          showsVerticalScrollIndicator={false}
        >
          {!messages.length ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyChatText}>
                What is on your mind today?
              </Text>
            </View>
          ) : (
            messages.map((message) => (
              <View
                key={message.id}
                style={[
                  styles.bubble,
                  message.role === "user" ? styles.userBubble : styles.aiBubble,
                ]}
              >
                <Text
                  style={[
                    styles.bubbleText,
                    message.role === "user"
                      ? styles.userBubbleText
                      : styles.aiBubbleText,
                  ]}
                >
                  {message.text}
                </Text>
                <Text
                  style={
                    message.role === "user"
                      ? styles.usertimeText
                      : styles.aitimeText
                  }
                >
                  {formatLongDate(message.createdAt)}
                </Text>
              </View>
            ))
          )}

          {loading ? (
            <View
              style={[styles.bubble, styles.aiBubble, styles.loadingBubble]}
            >
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.loadingLabel}>Thinking...</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>

      <View style={styles.promptSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.promptRow}
        >
          {suggestedPrompts.map((prompt) => (
            <Pressable
              key={prompt}
              style={styles.promptChip}
              onPress={() => submitText(prompt)}
            >
              <Text style={styles.promptChipText}>{prompt}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={styles.composerBar}>
        <Pressable style={styles.circleButton} onPress={startNewChat}>
          <Ionicons name="add" size={22} color={COLORS.surface} />
        </Pressable>

        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask anything"
          placeholderTextColor={COLORS.textMuted}
          style={styles.input}
          multiline
        />

        <Pressable
          style={[
            styles.sendButton,
            (!draft.trim() || loading) && styles.sendDisabled,
          ]}
          onPress={() => submitText(draft)}
          disabled={!draft.trim() || loading}
        >
          <Ionicons name="arrow-up" size={18} color={COLORS.surface} />
        </Pressable>
      </View>

      {historyOpen ? (
        <View style={styles.drawerContainer}>
          <View style={styles.drawer}>
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>Your chats</Text>
              <Pressable onPress={() => setHistoryOpen(false)}>
                <Ionicons name="close" size={20} color={COLORS.text} />
              </Pressable>
            </View>

            <Pressable style={styles.drawerAction} onPress={startNewChat}>
              <Ionicons
                name="create-outline"
                size={16}
                color={COLORS.primary}
              />
              <Text style={styles.drawerActionText}>New chat</Text>
            </Pressable>

            <ScrollView showsVerticalScrollIndicator={false}>
              {sessions.map((session) => {
                const isActive = session.id === activeSessionId;
                return (
                  <LinearGradient
                    key={session.id}
                    colors={
                      isActive ? ["#7990ef", "#c6cff9"] : ["#b9c4f3", "#E3E8FF"]
                    }
                    locations={[0, 0.5, 1]}
                    start={{ x: 1, y: 1 }}
                    end={{ x: 0, y: 0 }}
                    style={[
                      styles.sessionRow,
                      isActive && styles.sessionRowActive,
                    ]}
                  >
                    <View style={styles.sessionTopRow}>
                      <Pressable
                        style={styles.sessionTitlePress}
                        onPress={() => {
                          setActiveSessionId(session.id);
                          setHistoryOpen(false);
                        }}
                      >
                        <Text style={styles.sessionTitle}>{session.title}</Text>
                      </Pressable>
                      <Pressable
                        style={styles.sessionDeleteButton}
                        onPress={() => handleDeleteSession(session.id)}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={16}
                          color={COLORS.danger}
                        />
                      </Pressable>
                    </View>
                    <Pressable
                      style={styles.sessionContentPress}
                      onPress={() => {
                        setActiveSessionId(session.id);
                        setHistoryOpen(false);
                      }}
                    >
                      <Text style={styles.sessionMeta}>
                        {formatLongDate(session.updatedAt)}
                      </Text>
                    </Pressable>
                  </LinearGradient>
                );
              })}
            </ScrollView>
          </View>
          <Pressable
            style={styles.drawerBackdrop}
            onPress={() => setHistoryOpen(false)}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  titleWrap: {
    flex: 1,
    alignItems: "flex-start",
    marginLeft: 10,
  },
  topTitle: {
    color: COLORS.primary,
    fontSize: 22,
    fontWeight: "700",
  },
  newChatButton: {
    borderRadius: 999,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  newChatButtonText: {
    color: COLORS.surface,
    fontWeight: "700",
    fontSize: 12,
  },
  chatWindow: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
  },
  chatContent: {
    flexGrow: 1,
    paddingVertical: 8,
    gap: 10,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 280,
  },
  emptyChatText: {
    color: COLORS.primary,
    fontSize: 38,
    fontWeight: "500",
    textAlign: "center",
    paddingHorizontal: 18,
    lineHeight: 46,
  },
  bubble: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxWidth: "88%",
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: COLORS.border,
  },
  aiBubble: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.primary,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  bubbleText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userBubbleText: {
    color: COLORS.text,
    fontWeight: "600",
  },
  aiBubbleText: {
    color: COLORS.surface,
  },
  aitimeText: {
    marginTop: 6,
    fontSize: 11,
    color: COLORS.border,
    opacity: 0.8,
  },
  usertimeText: {
    marginTop: 6,
    fontSize: 11,
    color: COLORS.primary,
    opacity: 0.8,
  },
  loadingBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadingLabel: { color: COLORS.primary },
  promptSection: {
    marginTop: 8,
  },
  promptRow: {
    gap: 8,
    paddingRight: 4,
  },
  promptChip: {
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: 290,
    alignItems: "center",
    justifyContent: "center",
  },
  promptChipText: {
    color: COLORS.surface,
    fontWeight: "700",
    fontSize: 10,
  },
  composerBar: {
    marginTop: 8,
    borderRadius: 28,
    backgroundColor: COLORS.surface,
    borderWidth: 3,
    borderColor: COLORS.border,
    minHeight: 26,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 8,
  },
  circleButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    maxHeight: 90,
    color: COLORS.text,
    fontSize: 16,
    alignContent: "center",
    paddingHorizontal: 4,
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: {
    opacity: 0.45,
  },
  drawerContainer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    zIndex: 30,
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: COLORS.text,
    opacity: 0.45,
  },
  drawer: {
    width: "72%",
    maxWidth: 320,
    backgroundColor: COLORS.surface,
    borderRightWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    paddingTop: 14,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  drawerTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: "800",
  },
  drawerAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
    backgroundColor: COLORS.background,
  },
  drawerActionText: {
    color: COLORS.text,
    fontWeight: "700",
  },
  sessionRow: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    overflow: "hidden",
  },
  sessionTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  sessionTitlePress: {
    flex: 1,
    marginRight: 8,
  },
  sessionContentPress: {
    paddingRight: 0,
  },
  sessionDeleteButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  sessionRowActive: {
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  sessionTitle: { color: COLORS.text, fontWeight: "700" },
  sessionMeta: { color: COLORS.textMuted, marginTop: 2, fontSize: 12 },
  sessionTrend: {
    marginTop: 4,
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: "700",
  },
  sessionSummary: {
    marginTop: 4,
    fontSize: 11,
    color: COLORS.textMuted,
  },
  sessionTags: {
    marginTop: 4,
    fontSize: 11,
    color: COLORS.text,
    fontWeight: "600",
  },
});
