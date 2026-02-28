import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { DB_SCHEMA, getUserDocId } from '../constants/dataSchema';
import { maybeRefreshLongTermSummary, saveRollingContext } from './memoryService';

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
    summary: String(session.summary || ''),
    tags: Array.isArray(session.tags) ? session.tags.filter(Boolean).slice(0, 6) : [],
    moodTrend: session.moodTrend || 'stable',
    averageMood: typeof session.averageMood === 'number' ? session.averageMood : 0,
    messages,
    entries,
  };
}

function cleanText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function generateAutoTitle(text) {
  const cleaned = cleanText(text);
  if (!cleaned) return 'New reflection';
  const words = cleaned.split(' ').slice(0, 6);
  const title = words.join(' ');
  return title.length > 54 ? `${title.slice(0, 54)}...` : title;
}

function buildSessionSummary(messages = [], entries = []) {
  const recentUserTexts = messages
    .filter((m) => m.role === 'user')
    .slice(-3)
    .map((m) => cleanText(m.text))
    .filter(Boolean);

  const recentMoodTags = entries
    .slice(-3)
    .map((e) => String(e?.moodTag || '').trim())
    .filter(Boolean)
    .join(', ');

  const base = recentUserTexts.join(' ');
  if (!base && !recentMoodTags) return '';

  const summary = base.length > 180 ? `${base.slice(0, 180)}...` : base;
  if (!recentMoodTags) return summary;
  if (!summary) return `Recent moods: ${recentMoodTags}.`;
  return `${summary} | Moods: ${recentMoodTags}`;
}

function detectTagsFromText(text) {
  const lower = cleanText(text).toLowerCase();
  if (!lower) return [];

  const map = [
    { tag: 'work', keys: ['work', 'office', 'manager', 'deadline', 'project'] },
    { tag: 'sleep', keys: ['sleep', 'insomnia', 'rest', 'tired', 'night'] },
    { tag: 'relationship', keys: ['friend', 'partner', 'wife', 'husband', 'mom', 'dad', 'family'] },
    { tag: 'stress', keys: ['stress', 'anxious', 'overwhelmed', 'panic'] },
    { tag: 'health', keys: ['health', 'exercise', 'walk', 'gym', 'weight'] },
    { tag: 'productivity', keys: ['focus', 'productive', 'routine', 'habit'] },
  ];

  return map
    .filter((item) => item.keys.some((k) => lower.includes(k)))
    .map((item) => item.tag);
}

function computeMoodTrend(entries = []) {
  const scores = entries
    .map((e) => Number(e?.sentimentScore))
    .filter((v) => !Number.isNaN(v));

  if (scores.length < 2) {
    const one = scores[0] || 0;
    return {
      moodTrend: 'stable',
      averageMood: Number(one.toFixed(2)),
    };
  }

  const mid = Math.floor(scores.length / 2) || 1;
  const first = scores.slice(0, mid);
  const second = scores.slice(mid);

  const avg = (arr) => arr.reduce((sum, v) => sum + v, 0) / (arr.length || 1);
  const firstAvg = avg(first);
  const secondAvg = avg(second);
  const delta = Number((secondAvg - firstAvg).toFixed(2));
  const overall = Number(avg(scores).toFixed(2));

  if (delta >= 0.12) return { moodTrend: 'improving', averageMood: overall };
  if (delta <= -0.12) return { moodTrend: 'declining', averageMood: overall };
  return { moodTrend: 'stable', averageMood: overall };
}

function computeSessionIntelligence(session, userText, journalEntry) {
  const nextMessages = session.messages || [];
  const nextEntries = session.entries || [];
  const titleNeedsUpdate =
    !session.title ||
    session.title === 'Untitled chat' ||
    session.title === 'New reflection' ||
    session.title === 'Today reflection';

  const nextTitle = titleNeedsUpdate ? generateAutoTitle(userText) : session.title;
  const summary = buildSessionSummary(nextMessages, nextEntries);

  const moodTags = nextEntries
    .map((e) => String(e?.moodTag || '').toLowerCase())
    .filter(Boolean);
  const textTags = detectTagsFromText(userText);
  const tags = [...new Set([...textTags, ...moodTags])].slice(0, 6);

  const trend = computeMoodTrend(nextEntries);
  return {
    title: nextTitle,
    summary,
    tags,
    moodTrend: trend.moodTrend,
    averageMood: trend.averageMood,
    lastMoodTag: journalEntry?.moodTag || '',
  };
}

function sortSessions(sessions) {
  return [...sessions].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export async function getJournalSessions() {
  const localSessions = await (async () => {
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
  })();

  const userDocId = getUserDocId(auth.currentUser);
  if (!userDocId) return localSessions;

  try {
    const ref = doc(db, DB_SCHEMA.users, userDocId, DB_SCHEMA.appData, DB_SCHEMA.docs.journalSessions);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      if (localSessions.length) {
        await setDoc(ref, { sessions: localSessions, updatedAt: new Date().toISOString() }, { merge: true });
      }
      return localSessions;
    }

    const remoteSessions = Array.isArray(snap.data()?.sessions)
      ? snap.data().sessions.map(normalizeSession).filter(Boolean)
      : [];
    const sortedRemote = sortSessions(remoteSessions);

    if (sortedRemote.length === 0 && localSessions.length > 0) {
      await setDoc(
        ref,
        { sessions: localSessions, updatedAt: new Date().toISOString() },
        { merge: true }
      );
      return localSessions;
    }

    if (localSessions.length > sortedRemote.length) {
      await setDoc(
        ref,
        { sessions: localSessions, updatedAt: new Date().toISOString() },
        { merge: true }
      );
      return localSessions;
    }

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sortedRemote));
    return sortedRemote;
  } catch {
    return localSessions;
  }
}

export async function saveJournalSessions(sessions) {
  const normalized = sortSessions((sessions || []).map(normalizeSession).filter(Boolean));
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));

  const userDocId = getUserDocId(auth.currentUser);
  if (userDocId) {
    try {
      const ref = doc(db, DB_SCHEMA.users, userDocId, DB_SCHEMA.appData, DB_SCHEMA.docs.journalSessions);
      await setDoc(ref, { sessions: normalized, updatedAt: new Date().toISOString() }, { merge: true });
    } catch {
      // Keep local save successful even if remote sync temporarily fails.
    }
  }

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

export async function deleteJournalSession(sessionId) {
  const sessions = await getJournalSessions();
  const filtered = sessions.filter((session) => session.id !== sessionId);
  await saveJournalSessions(filtered);
  return filtered;
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

  const followUpQuestion =
    String(analysis.followUpQuestion || '').trim() ||
    (Array.isArray(analysis.suggestedQuestions) ? String(analysis.suggestedQuestions[0] || '').trim() : '');
  const assistantText = [analysis.reflection, followUpQuestion].filter(Boolean).join('\n\n').trim();

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
    updatedAt: new Date().toISOString(),
    messages: [...session.messages, userMessage, assistantMessage],
    entries: [...session.entries, journalEntry],
  };

  const intelligence = computeSessionIntelligence(updatedSession, userText, journalEntry);
  updatedSession.title = intelligence.title;
  updatedSession.summary = intelligence.summary;
  updatedSession.tags = intelligence.tags;
  updatedSession.moodTrend = intelligence.moodTrend;
  updatedSession.averageMood = intelligence.averageMood;
  updatedSession.lastMoodTag = intelligence.lastMoodTag;

  const nextSessions = [...sessions];
  nextSessions[index] = updatedSession;

  const saved = await saveJournalSessions(nextSessions);
  try {
    await saveRollingContext({
      recentMoodTrend7d: intelligence.moodTrend || '',
      recentEntriesSummary: intelligence.lastMoodTag
        ? `Recent mood tag: ${intelligence.lastMoodTag}`
        : '',
      sessionSummary: intelligence.summary || '',
      activeFocus: userText || '',
    });
  } catch {
    // Memory refresh should not block chat persistence.
  }
  try {
    const allJournalEntries = saved.flatMap((s) => (Array.isArray(s?.entries) ? s.entries : []));
    maybeRefreshLongTermSummary({ journalEntries: allJournalEntries }).catch(() => {});
  } catch {
    // Long-term compression is best-effort and should never block user flow.
  }
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
