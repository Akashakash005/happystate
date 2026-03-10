import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Keyboard,
  Modal,
  Platform,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../context/ThemeContext";
import { analyzeJournalEntryWithContext } from "../services/aiJournalService";
import { signInToPuter } from "../services/puterService";
import {
  addJournalExchange,
  createJournalSession,
  deleteJournalSession,
  getJournalSessions,
} from "../services/journalService";
import { getAiQuotaErrorDetails } from "../utils/aiErrorUtils";
import { formatLongDate } from "../utils/date";

const DEFAULT_SUGGESTIONS = [
  "What helped me feel relaxed today?",
  "Which part of my productive day felt most natural and easy?",
  "How can I recreate this 7 out of 7 mood tomorrow?",
  "What did I do differently before this calm, focused momentum?",
];

const PRIVATE_SUGGESTIONS = [
  "What urge or impulse has been strongest lately?",
  "What am I hiding from myself tonight?",
  "Which trigger keeps pulling me back into the same loop?",
  "What truth would I only admit in private mode?",
];

export default function JournalChatScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isPrivateMode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const journalMode = isPrivateMode ? "private" : "public";
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [suggestedPrompts, setSuggestedPrompts] = useState(
    isPrivateMode ? PRIVATE_SUGGESTIONS : DEFAULT_SUGGESTIONS,
  );
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [composerHeight, setComposerHeight] = useState(58);
  const [typingDots, setTypingDots] = useState(".");
  const [puterSignedIn, setPuterSignedIn] = useState(false);
  const [puterLoading, setPuterLoading] = useState(false);
  const [quotaModal, setQuotaModal] = useState({
    visible: false,
    title: "",
    message: "",
  });

  const scrollRef = useRef(null);
  const isNearBottomRef = useRef(true);

  useEffect(() => {
    setSuggestedPrompts(isPrivateMode ? PRIVATE_SUGGESTIONS : DEFAULT_SUGGESTIONS);
  }, [isPrivateMode]);

  useLayoutEffect(() => {
    if (!quotaModal.visible) return;

    setQuotaModal((prev) => ({
      ...prev,
      title: isPrivateMode ? "Private AI Cooling Down" : "AI Temporarily Busy",
    }));
  }, [isPrivateMode, quotaModal.visible]);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardVisible(true);
      setKeyboardHeight(event?.endCoordinates?.height || 0);
      if (isNearBottomRef.current) {
        setTimeout(
          () => scrollRef.current?.scrollToEnd({ animated: true }),
          40,
        );
      }
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!loading) {
      setTypingDots(".");
      return;
    }

    const intervalId = setInterval(() => {
      setTypingDots((prev) => (prev.length >= 3 ? "." : `${prev}.`));
    }, 420);

    return () => clearInterval(intervalId);
  }, [loading]);

  const loadSessions = useCallback(async () => {
    const stored = await getJournalSessions(journalMode);
    if (stored.length) {
      setSessions(stored);
      setActiveSessionId((prev) => prev || stored[0].id);
      return;
    }

    const first = await createJournalSession(
      isPrivateMode ? "Private after dark" : "Today reflection",
      journalMode,
    );
    setSessions([first]);
    setActiveSessionId(first.id);
  }, [isPrivateMode, journalMode]);

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
          journalMode,
        });
        const result = await addJournalExchange({
          sessionId: activeSession.id,
          userText: text,
          analysis,
          journalMode,
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
      } catch (error) {
        const quotaError = getAiQuotaErrorDetails(error);
        if (quotaError.isQuotaError) {
          setSessions((prev) =>
            prev.map((session) =>
              session.id === activeSession.id
                ? {
                    ...session,
                    messages: session.messages.filter(
                      (message) => message.id !== optimisticUserMessage.id,
                    ),
                  }
                : session,
            ),
          );
          setQuotaModal({
            visible: true,
            title: isPrivateMode
              ? "Private AI Cooling Down"
              : "AI Temporarily Busy",
            message: quotaError.message,
          });
          return;
        }

        const assistantError = {
          id: `assistant_error_${Date.now()}`,
          role: "assistant",
          text:
            error?.message ||
            "Private journal is unavailable right now. Check the selected provider configuration.",
          createdAt: new Date().toISOString(),
        };

        setSessions((prev) =>
          prev.map((session) =>
            session.id === activeSession.id
              ? {
                  ...session,
                  messages: [
                    ...session.messages.filter(
                      (message) => message.id !== optimisticUserMessage.id,
                    ),
                    assistantError,
                  ],
                }
              : session,
          ),
        );
      } finally {
        setLoading(false);
        setTimeout(
          () => scrollRef.current?.scrollToEnd({ animated: true }),
          50,
        );
      }
    },
    [activeSession, journalMode, loading],
  );

  const startNewChat = async () => {
    const session = await createJournalSession(
      isPrivateMode ? "Private after dark" : "New reflection",
      journalMode,
    );
    const updated = await getJournalSessions(journalMode);
    setSessions(updated);
    setActiveSessionId(session.id);
    setSuggestedPrompts(isPrivateMode ? PRIVATE_SUGGESTIONS : DEFAULT_SUGGESTIONS);
    setHistoryOpen(false);
  };

  const connectPuter = async () => {
    if (puterLoading) return;
    setPuterLoading(true);
    try {
      await signInToPuter();
      setPuterSignedIn(true);
    } catch (error) {
      const assistantError = {
        id: `assistant_error_${Date.now()}`,
        role: "assistant",
        text:
          error?.message ||
          "Puter sign-in did not complete. Try again and allow the Puter popup.",
        createdAt: new Date().toISOString(),
      };
      setSessions((prev) =>
        prev.map((session) =>
          session.id === activeSession?.id
            ? {
                ...session,
                messages: [...session.messages, assistantError],
              }
            : session,
        ),
      );
    } finally {
      setPuterLoading(false);
    }
  };

  const handleDeleteSession = async (sessionId) => {
    const updated = await deleteJournalSession(sessionId, journalMode);
    if (!updated.length) {
      const first = await createJournalSession(
        isPrivateMode ? "Private after dark" : "New reflection",
        journalMode,
      );
      setSessions([first]);
      setActiveSessionId(first.id);
      return;
    }

    setSessions(updated);
    if (activeSessionId === sessionId) {
      setActiveSessionId(updated[0].id);
    }
  };

  const androidVirtualButtonsExtra =
    Platform.OS === "android" && keyboardVisible && insets.bottom === 0
      ? 20
      : 0;
  const composerBottomOffset =
    Platform.OS === "android" && keyboardVisible
      ? keyboardHeight + androidVirtualButtonsExtra
      : 0;
  const handleChatScroll = useCallback((event) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const currentOffset = contentOffset?.y || 0;
    const viewportHeight = layoutMeasurement?.height || 0;
    const totalHeight = contentSize?.height || 0;
    const distanceFromBottom = totalHeight - (currentOffset + viewportHeight);
    isNearBottomRef.current = distanceFromBottom < 100;
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable
          style={styles.iconButton}
          onPress={() => setHistoryOpen(true)}
        >
          <Ionicons name="menu" size={20} color={colors.primary} />
        </Pressable>

        <View style={styles.titleWrap}>
          <Text style={styles.topTitle}>
            {isPrivateMode ? "Private Journal" : "Journal"}
          </Text>
          <Text style={styles.topSubtitle}>
            {isPrivateMode ? "Grok via Puter" : "Gemini reflection"}
          </Text>
        </View>

        <Pressable style={styles.newChatButton} onPress={startNewChat}>
          <Text style={styles.newChatButtonText}>New chat</Text>
        </Pressable>
      </View>

      {isPrivateMode && Platform.OS === "web" && !puterSignedIn ? (
        <View style={styles.puterGate}>
          <Text style={styles.puterGateTitle}>Private Journal Locked</Text>
          <Text style={styles.puterGateText}>
            Sign in with Puter first. After that, this browser session can use Grok inside private mode.
          </Text>
          <Pressable
            style={[
              styles.puterGateButton,
              puterLoading && styles.sendDisabled,
            ]}
            onPress={connectPuter}
            disabled={puterLoading}
          >
            <Text style={styles.puterGateButtonText}>
              {puterLoading ? "Connecting..." : "Connect with Puter"}
            </Text>
          </Pressable>
          <Text style={styles.puterGateHint}>
            If a popup appears, allow it and complete Puter consent there.
          </Text>
        </View>
      ) : null}

      <View
        style={[
          styles.chatWindow,
          {
            paddingBottom:
              composerHeight +
              16 +
              (keyboardVisible ? 6 + androidVirtualButtonsExtra : 46),
          },
        ]}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.chatContent}
          onContentSizeChange={() => {
            if (isNearBottomRef.current) {
              scrollRef.current?.scrollToEnd({ animated: true });
            }
          }}
          onScroll={handleChatScroll}
          scrollEventThrottle={16}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          showsVerticalScrollIndicator={false}
        >
          {!messages.length ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyChatText}>
                {isPrivateMode
                  ? "Say the thing you would not log anywhere else."
                  : "What is on your mind today?"}
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
              <View style={styles.typingDotRow}>
                <View style={styles.typingDot} />
                <View style={styles.typingDot} />
                <View style={styles.typingDot} />
              </View>
              <Text style={styles.loadingLabel}>{`Assistant is typing${typingDots}`}</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>

      <View
        style={[
          styles.promptSection,
          { bottom: composerBottomOffset + composerHeight + 8 },
        ]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.promptRow}
          keyboardShouldPersistTaps="handled"
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

      <View
        style={[styles.composerBar, { bottom: composerBottomOffset }]}
        onLayout={(event) => {
          const nextHeight = Math.ceil(event.nativeEvent.layout.height || 58);
          if (nextHeight !== composerHeight) {
            setComposerHeight(nextHeight);
          }
        }}
      >
        <Pressable style={styles.circleButton} onPress={startNewChat}>
          <Ionicons name="add" size={22} color={colors.surface} />
        </Pressable>

        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={isPrivateMode ? "Drop the unfiltered truth" : "Ask anything"}
          placeholderTextColor={colors.textMuted}
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
          <Ionicons name="arrow-up" size={18} color={colors.surface} />
        </Pressable>
      </View>

      {historyOpen ? (
        <View style={styles.drawerContainer}>
          <View style={styles.drawer}>
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>Your chats</Text>
              <Pressable onPress={() => setHistoryOpen(false)}>
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
            </View>

            <Pressable style={styles.drawerAction} onPress={startNewChat}>
              <Ionicons
                name="create-outline"
                size={16}
                color={colors.primary}
              />
              <Text style={styles.drawerActionText}>New chat</Text>
            </Pressable>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {sessions.map((session) => {
                const isActive = session.id === activeSessionId;
                return (
                  <LinearGradient
                    key={session.id}
                    colors={
                      isActive
                        ? colors.sessionGradientActive
                        : colors.sessionGradientIdle
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
                          color={colors.danger}
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

      <Modal
        transparent
        visible={quotaModal.visible}
        animationType="fade"
        onRequestClose={() =>
          setQuotaModal((prev) => ({ ...prev, visible: false }))
        }
      >
        <View style={styles.modalOverlay}>
          <View style={styles.quotaModalCard}>
            <LinearGradient
              colors={isPrivateMode ? colors.cardGradient : colors.cardGradientAlt}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.quotaModalGlow}
            >
              <Text style={styles.quotaModalTitle}>{quotaModal.title}</Text>
              <Text style={styles.quotaModalMessage}>{quotaModal.message}</Text>
              <Pressable
                style={styles.quotaModalButton}
                onPress={() =>
                  setQuotaModal((prev) => ({ ...prev, visible: false }))
                }
              >
                <Text style={styles.quotaModalButtonText}>Okay</Text>
              </Pressable>
            </LinearGradient>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
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
      backgroundColor: colors.inputAccent,
    },
    titleWrap: {
      flex: 1,
      alignItems: "flex-start",
      marginLeft: 10,
    },
    topTitle: {
      color: colors.primary,
      fontSize: 22,
      fontWeight: "700",
    },
    topSubtitle: {
      marginTop: 2,
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
    },
    newChatButton: {
      borderRadius: 999,
      backgroundColor: colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    newChatButtonText: {
      color: colors.surface,
      fontWeight: "700",
      fontSize: 12,
    },
    chatWindow: {
      flex: 1,
      borderRadius: 14,
      backgroundColor: colors.surface,
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
      color: colors.primary,
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
      backgroundColor: colors.border,
    },
    aiBubble: {
      alignSelf: "flex-start",
      backgroundColor: colors.primary,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.25)",
    },
    bubbleText: {
      fontSize: 16,
      lineHeight: 22,
    },
    userBubbleText: {
      color: colors.text,
      fontWeight: "600",
    },
    aiBubbleText: {
      color: colors.surface,
    },
    aitimeText: {
      marginTop: 6,
      fontSize: 11,
      color: colors.border,
      opacity: 0.8,
    },
    usertimeText: {
      marginTop: 6,
      fontSize: 11,
      color: colors.primary,
      opacity: 0.8,
    },
    loadingBubble: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    typingDotRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
    },
    typingDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.surface,
      opacity: 0.9,
    },
    loadingLabel: {
      color: colors.surface,
      fontWeight: "700",
      fontSize: 12,
    },
    promptSection: {
      position: "absolute",
      left: 12,
      right: 12,
    },
    promptRow: {
      gap: 8,
      paddingRight: 4,
    },
    promptChip: {
      backgroundColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
      maxWidth: 290,
      alignItems: "center",
      justifyContent: "center",
    },
    promptChipText: {
      color: colors.text,
      fontWeight: "700",
      fontSize: 10,
    },
    composerBar: {
      position: "absolute",
      left: 12,
      right: 12,
      borderRadius: 28,
      backgroundColor: colors.surface,
      borderWidth: 3,
      borderColor: colors.border,
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
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    input: {
      flex: 1,
      maxHeight: 90,
      color: colors.text,
      fontSize: 16,
      alignContent: "center",
      paddingHorizontal: 4,
    },
    sendButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.primary,
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
      backgroundColor: colors.text,
      opacity: 0.45,
    },
    drawer: {
      width: "72%",
      maxWidth: 320,
      backgroundColor: colors.surface,
      borderRightWidth: 1,
      borderColor: colors.border,
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
      color: colors.text,
      fontSize: 20,
      fontWeight: "800",
    },
    drawerAction: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 10,
      marginBottom: 10,
      backgroundColor: colors.background,
    },
    drawerActionText: {
      color: colors.text,
      fontWeight: "700",
    },
    puterGate: {
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 18,
      paddingHorizontal: 18,
      paddingVertical: 20,
      alignItems: "center",
    },
    puterGateTitle: {
      color: colors.text,
      fontSize: 20,
      fontWeight: "800",
      textAlign: "center",
    },
    puterGateText: {
      marginTop: 8,
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 22,
      textAlign: "center",
    },
    puterGateButton: {
      marginTop: 16,
      borderRadius: 999,
      backgroundColor: colors.primary,
      paddingHorizontal: 18,
      paddingVertical: 12,
    },
    puterGateButtonText: {
      color: colors.surface,
      fontWeight: "800",
      fontSize: 14,
    },
    puterGateHint: {
      marginTop: 10,
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
    },
    sessionRow: {
      borderWidth: 1,
      borderColor: colors.border,
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
      backgroundColor: colors.dangerSurface,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
    },
    sessionRowActive: {
      borderColor: colors.primary,
      shadowColor: colors.primary,
      shadowOpacity: 0.28,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    sessionTitle: { color: colors.text, fontWeight: "700" },
    sessionMeta: { color: colors.textMuted, marginTop: 2, fontSize: 12 },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 24,
    },
    quotaModalCard: {
      width: "100%",
      maxWidth: 360,
      borderRadius: 24,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    quotaModalGlow: {
      paddingHorizontal: 22,
      paddingVertical: 26,
    },
    quotaModalTitle: {
      color: colors.text,
      fontSize: 22,
      fontWeight: "800",
      textAlign: "center",
    },
    quotaModalMessage: {
      marginTop: 12,
      color: colors.text,
      fontSize: 15,
      lineHeight: 22,
      textAlign: "center",
    },
    quotaModalButton: {
      marginTop: 18,
      alignSelf: "center",
      borderRadius: 999,
      paddingHorizontal: 20,
      paddingVertical: 11,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    quotaModalButtonText: {
      color: colors.primary,
      fontWeight: "800",
      fontSize: 14,
    },
  });
