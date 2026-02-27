import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@happy_state_journal_sessions_v1';

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeMessage(message) {
  if (!message) return null;
  return {
    id: message.id || makeId('msg'),
    role: message.role === 'assistant' ? 'assistant' : 'user',
    text: String(message.text || ''),
    createdAt: message.createdAt || new Date().toISOString(),
  };
}

function normalizeEntry(entry) {
  if (!entry) return null;
  return {
    id: entry.id || makeId('entry'),
    text: String(entry.text || ''),
    date: entry.date || new Date().toISOString(),
    sentimentScore: typeof entry.sentimentScore === 'number' ? entry.sentimentScore : 0,
    moodTag: String(entry.moodTag || 'neutral').toLowerCase(),
    sessionId: entry.sessionId || '',
  };
}

function normalizeSession(session) {
  if (!session) return null;
  const messages = Array.isArray(session.messages)
    ? session.messages.map(normalizeMessage).filter(Boolean)
    : [];
  const entries = Array.isArray(session.entries)
    ? session.entries.map(normalizeEntry).filter(Boolean)
    : [];

  return {
    id: session.id || makeId('session'),
    title: session.title || 'Untitled chat',
    createdAt: session.createdAt || new Date().toISOString(),
    updatedAt: session.updatedAt || new Date().toISOString(),
    messages,
    entries,
  };
}

function sortSessions(sessions) {
  return [...sessions].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export async function getJournalSessions() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const normalized = Array.isArray(parsed)
      ? parsed.map(normalizeSession).filter(Boolean)
      : [];
    return sortSessions(normalized);
  } catch {
    return [];
  }
}

export async function saveJournalSessions(sessions) {
  const normalized = sortSessions((sessions || []).map(normalizeSession).filter(Boolean));
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function createJournalSession(initialTitle = 'New reflection') {
  const sessions = await getJournalSessions();
  const now = new Date().toISOString();

  const session = {
    id: makeId('session'),
    title: initialTitle,
    createdAt: now,
    updatedAt: now,
    messages: [],
    entries: [],
  };

  sessions.unshift(session);
  await saveJournalSessions(sessions);
  return session;
}

export async function addJournalExchange({ sessionId, userText, analysis }) {
  const sessions = await getJournalSessions();
  const now = new Date().toISOString();

  let index = sessions.findIndex((session) => session.id === sessionId);

  if (index < 0) {
    const created = await createJournalSession('New reflection');
    const fresh = await getJournalSessions();
    index = fresh.findIndex((session) => session.id === created.id);
    if (index < 0) return { sessions: fresh, sessionId: created.id };
    fresh[index] = {
      ...fresh[index],
      updatedAt: now,
    };
    await saveJournalSessions(fresh);
    return addJournalExchange({ sessionId: created.id, userText, analysis });
  }

  const session = sessions[index];

  const userMessage = normalizeMessage({
    role: 'user',
    text: userText,
    createdAt: now,
  });

  const assistantText = `${analysis.reflection}\n\n${(analysis.suggestedQuestions || [])
    .map((q, idx) => `${idx + 1}. ${q}`)
    .join('\n')}`.trim();

  const assistantMessage = normalizeMessage({
    role: 'assistant',
    text: assistantText,
    createdAt: new Date().toISOString(),
  });

  const journalEntry = normalizeEntry({
    text: userText,
    date: now,
    sentimentScore: analysis.sentiment,
    moodTag: analysis.moodTag,
    sessionId: session.id,
  });

  const updatedSession = {
    ...session,
    title: session.messages.length
      ? session.title
      : String(userText || 'New reflection').slice(0, 48),
    updatedAt: new Date().toISOString(),
    messages: [...session.messages, userMessage, assistantMessage],
    entries: [...session.entries, journalEntry],
  };

  const nextSessions = [...sessions];
  nextSessions[index] = updatedSession;

  const saved = await saveJournalSessions(nextSessions);
  return {
    sessions: saved,
    sessionId: updatedSession.id,
    assistantMessage,
    journalEntry,
  };
}

export async function getAllJournalEntries() {
  const sessions = await getJournalSessions();
  const all = sessions.flatMap((session) =>
    (session.entries || []).map((entry) => ({
      ...entry,
      sessionId: session.id,
      sessionTitle: session.title,
    }))
  );

  return all.sort((a, b) => new Date(b.date) - new Date(a.date));
}
