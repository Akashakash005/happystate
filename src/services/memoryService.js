import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { DB_SCHEMA, getUserDocId } from '../constants/dataSchema';
import { getProfile } from './profileService';
import { getEntries } from './storageService';

const LONG_TERM_KEY = '@happy_state_memory_long_term_v1';
const ROLLING_KEY = '@happy_state_memory_rolling_v1';
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.EXPO_PUBLIC_GEMINI_MODEL || 'gemini-2.5-flash';
const LONG_TERM_COMPRESS_JOURNAL_THRESHOLD = 10;
const LONG_TERM_COMPRESS_MOOD_THRESHOLD = 10;
const LONG_TERM_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
let compressionInFlight = false;
const LONG_TERM_EDITABLE_FIELDS = [
  'profileSummary',
  'emotionalBaselineSummary',
  'personalityPattern',
  'stressBaseline',
  'emotionalTriggers',
  'supportPatterns',
  'recurringThemes',
  'relationshipPatterns',
  'manualTags',
];

export const DEFAULT_LONG_TERM_SUMMARY = {
  profileSummary: '',
  emotionalBaselineSummary: '',
  personalityPattern: '',
  stressBaseline: '',
  emotionalTriggers: [],
  supportPatterns: [],
  recurringThemes: [],
  relationshipPatterns: [],
  manualTags: [],
  userOverrides: {},
  lastCompressedAt: null,
  lastProcessedJournalEntryCount: 0,
  lastProcessedMoodEntryCount: 0,
  updatedAt: null,
};

export const DEFAULT_ROLLING_CONTEXT = {
  recentMoodTrend7d: '',
  recentEntriesSummary: '',
  sessionSummary: '',
  activeFocus: '',
  updatedAt: null,
};

function normalizeStringList(value, limit = 8) {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
  )].slice(0, limit);
}

function normalizeLongTermSummary(data = {}) {
  const journalCount = Number(data?.lastProcessedJournalEntryCount);
  const moodCount = Number(data?.lastProcessedMoodEntryCount);
  const manualTags = Array.isArray(data?.manualTags)
    ? data.manualTags
        .map((item) => ({
          label: String(item?.label || '').trim(),
          name: String(item?.name || '').trim(),
        }))
        .filter((item) => item.label && item.name)
        .slice(0, 30)
    : [];

  const userOverrides =
    data?.userOverrides && typeof data.userOverrides === 'object' && !Array.isArray(data.userOverrides)
      ? LONG_TERM_EDITABLE_FIELDS.reduce((acc, key) => {
          acc[key] = Boolean(data.userOverrides[key]);
          return acc;
        }, {})
      : LONG_TERM_EDITABLE_FIELDS.reduce((acc, key) => {
          acc[key] = false;
          return acc;
        }, {});

  return {
    ...DEFAULT_LONG_TERM_SUMMARY,
    ...(data || {}),
    profileSummary: String(data?.profileSummary || '').trim(),
    emotionalBaselineSummary: String(data?.emotionalBaselineSummary || '').trim(),
    personalityPattern: String(data?.personalityPattern || '').trim(),
    stressBaseline: String(data?.stressBaseline || '').trim(),
    emotionalTriggers: normalizeStringList(data?.emotionalTriggers),
    supportPatterns: normalizeStringList(data?.supportPatterns),
    recurringThemes: normalizeStringList(data?.recurringThemes),
    relationshipPatterns: normalizeStringList(data?.relationshipPatterns),
    manualTags,
    userOverrides,
    lastCompressedAt: data?.lastCompressedAt || null,
    lastProcessedJournalEntryCount: Number.isNaN(journalCount) ? 0 : Math.max(0, journalCount),
    lastProcessedMoodEntryCount: Number.isNaN(moodCount) ? 0 : Math.max(0, moodCount),
    updatedAt: data?.updatedAt || null,
  };
}

function normalizeRollingContext(data = {}) {
  return {
    ...DEFAULT_ROLLING_CONTEXT,
    ...(data || {}),
    recentMoodTrend7d: String(data?.recentMoodTrend7d || '').trim(),
    recentEntriesSummary: String(data?.recentEntriesSummary || '').trim(),
    sessionSummary: String(data?.sessionSummary || '').trim(),
    activeFocus: String(data?.activeFocus || '').trim(),
    updatedAt: data?.updatedAt || null,
  };
}

function memoryRefs(userDocId) {
  return {
    longTermRef: doc(
      db,
      DB_SCHEMA.users,
      userDocId,
      DB_SCHEMA.memory,
      DB_SCHEMA.docs.longTermSummary
    ),
    rollingRef: doc(
      db,
      DB_SCHEMA.users,
      userDocId,
      DB_SCHEMA.memory,
      DB_SCHEMA.docs.rollingContext
    ),
  };
}

export async function getMemoryContext() {
  const localLongTerm = await (async () => {
    try {
      const raw = await AsyncStorage.getItem(LONG_TERM_KEY);
      return raw ? normalizeLongTermSummary(JSON.parse(raw)) : DEFAULT_LONG_TERM_SUMMARY;
    } catch {
      return DEFAULT_LONG_TERM_SUMMARY;
    }
  })();

  const localRolling = await (async () => {
    try {
      const raw = await AsyncStorage.getItem(ROLLING_KEY);
      return raw ? normalizeRollingContext(JSON.parse(raw)) : DEFAULT_ROLLING_CONTEXT;
    } catch {
      return DEFAULT_ROLLING_CONTEXT;
    }
  })();

  const userDocId = getUserDocId(auth.currentUser);
  if (!userDocId) {
    return { longTermSummary: localLongTerm, rollingContext: localRolling };
  }

  try {
    const { longTermRef, rollingRef } = memoryRefs(userDocId);
    const [longSnap, rollingSnap] = await Promise.all([getDoc(longTermRef), getDoc(rollingRef)]);

    const longTermSummary = longSnap.exists()
      ? normalizeLongTermSummary(longSnap.data())
      : localLongTerm;
    const rollingContext = rollingSnap.exists()
      ? normalizeRollingContext(rollingSnap.data())
      : localRolling;

    await Promise.all([
      AsyncStorage.setItem(LONG_TERM_KEY, JSON.stringify(longTermSummary)),
      AsyncStorage.setItem(ROLLING_KEY, JSON.stringify(rollingContext)),
    ]);

    return { longTermSummary, rollingContext };
  } catch {
    return { longTermSummary: localLongTerm, rollingContext: localRolling };
  }
}

export async function saveLongTermSummary(partialData = {}) {
  const source = String(partialData?.__source || 'manual');
  const cleanPartial = { ...(partialData || {}) };
  delete cleanPartial.__source;

  const current = (await getMemoryContext()).longTermSummary;
  const normalizedCurrent = normalizeLongTermSummary(current || {});

  const nextOverrides = { ...(normalizedCurrent.userOverrides || {}) };
  if (source === 'manual') {
    LONG_TERM_EDITABLE_FIELDS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(cleanPartial, key)) {
        nextOverrides[key] = true;
      }
    });
  }

  if (source === 'ai') {
    LONG_TERM_EDITABLE_FIELDS.forEach((key) => {
      if (nextOverrides[key]) {
        cleanPartial[key] = normalizedCurrent[key];
      }
    });
  }

  const next = normalizeLongTermSummary({
    ...normalizedCurrent,
    ...cleanPartial,
    userOverrides: nextOverrides,
    updatedAt: new Date().toISOString(),
  });

  await AsyncStorage.setItem(LONG_TERM_KEY, JSON.stringify(next));

  const userDocId = getUserDocId(auth.currentUser);
  if (userDocId) {
    try {
      const { longTermRef } = memoryRefs(userDocId);
      await setDoc(longTermRef, next, { merge: true });
    } catch {
      // Local save remains source of continuity when remote sync is unavailable.
    }
  }

  return next;
}

export async function saveRollingContext(partialData = {}) {
  const next = normalizeRollingContext({
    ...(await getMemoryContext()).rollingContext,
    ...(partialData || {}),
    updatedAt: new Date().toISOString(),
  });

  await AsyncStorage.setItem(ROLLING_KEY, JSON.stringify(next));

  const userDocId = getUserDocId(auth.currentUser);
  if (userDocId) {
    try {
      const { rollingRef } = memoryRefs(userDocId);
      await setDoc(rollingRef, next, { merge: true });
    } catch {
      // Local save remains source of continuity when remote sync is unavailable.
    }
  }

  return next;
}

export async function ensureMemoryScaffold() {
  const userDocId = getUserDocId(auth.currentUser);
  if (!userDocId) return;

  try {
    const { longTermRef, rollingRef } = memoryRefs(userDocId);
    const [longSnap, rollingSnap] = await Promise.all([getDoc(longTermRef), getDoc(rollingRef)]);

    const tasks = [];
    if (!longSnap.exists()) {
      tasks.push(
        setDoc(
          longTermRef,
          { ...DEFAULT_LONG_TERM_SUMMARY, updatedAt: new Date().toISOString() },
          { merge: true }
        )
      );
    }
    if (!rollingSnap.exists()) {
      tasks.push(
        setDoc(
          rollingRef,
          { ...DEFAULT_ROLLING_CONTEXT, updatedAt: new Date().toISOString() },
          { merge: true }
        )
      );
    }
    if (tasks.length) {
      await Promise.all(tasks);
    }
  } catch {
    // Non-blocking.
  }
}

function safeJsonParse(text) {
  if (!text) return null;
  const cleaned = String(text)
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function compactText(value, max = 220) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function toUniqueList(value, max = 8) {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((item) => typeof item === 'string')
      .map((item) => compactText(item, 60))
      .filter(Boolean)
  )].slice(0, max);
}

function normalizeModelSummaryPayload(payload = {}) {
  return {
    profileSummary: compactText(payload?.profileSummary, 220),
    emotionalBaselineSummary: compactText(payload?.emotionalBaselineSummary, 220),
    personalityPattern: compactText(payload?.personalityPattern, 220),
    stressBaseline: compactText(payload?.stressBaseline, 160),
    emotionalTriggers: toUniqueList(payload?.emotionalTriggers),
    supportPatterns: toUniqueList(payload?.supportPatterns),
    recurringThemes: toUniqueList(payload?.recurringThemes),
    relationshipPatterns: toUniqueList(payload?.relationshipPatterns),
  };
}

function buildCompressionPrompt({ profile, longTerm, journalEntries, moodEntries }) {
  const compactProfile = {
    name: compactText(profile?.name, 80),
    age: compactText(profile?.age, 12),
    profession: compactText(profile?.profession, 80),
    gender: compactText(profile?.gender, 24),
    about: compactText(profile?.about, 180),
    stressLevel: compactText(profile?.stressLevel, 24),
    sleepAverage: compactText(profile?.sleepAverage, 12),
    energyPattern: compactText(profile?.energyPattern, 24),
    emotionalSensitivity: compactText(profile?.emotionalSensitivity, 24),
    aiTone: compactText(profile?.aiTone, 24),
  };

  const compactLongTerm = {
    profileSummary: compactText(longTerm?.profileSummary, 220),
    emotionalBaselineSummary: compactText(longTerm?.emotionalBaselineSummary, 220),
    personalityPattern: compactText(longTerm?.personalityPattern, 220),
    stressBaseline: compactText(longTerm?.stressBaseline, 160),
    emotionalTriggers: toUniqueList(longTerm?.emotionalTriggers),
    supportPatterns: toUniqueList(longTerm?.supportPatterns),
    recurringThemes: toUniqueList(longTerm?.recurringThemes),
    relationshipPatterns: toUniqueList(longTerm?.relationshipPatterns),
  };

  const recentJournal = (journalEntries || [])
    .slice(-30)
    .map((entry) => ({
      text: compactText(entry?.text, 140),
      moodTag: compactText(entry?.moodTag, 20),
      sentimentScore: Number(entry?.sentimentScore ?? 0),
      date: entry?.date || '',
    }));

  const recentMoods = (moodEntries || [])
    .slice(-30)
    .map((entry) => ({
      date: entry?.date || '',
      slot: compactText(entry?.slot, 12),
      mood: Number(entry?.mood ?? 3),
      score: Number(entry?.score ?? 0),
      note: compactText(entry?.note, 100),
    }));

  return `
You are updating a long-term emotional memory profile for a personal mood companion app.
Summarize patterns safely and supportively.
Do not diagnose medical conditions.
Return strict JSON only with this exact shape:
{
  "profileSummary": "...",
  "emotionalBaselineSummary": "...",
  "personalityPattern": "...",
  "stressBaseline": "...",
  "emotionalTriggers": ["..."],
  "supportPatterns": ["..."],
  "recurringThemes": ["..."],
  "relationshipPatterns": ["..."]
}

Guidelines:
- Keep each string concise (1-2 sentences).
- Arrays should contain short bullet-like phrases.
- Prefer stable patterns over one-off events.
- Preserve useful prior memory when still valid.

Current profile:
${JSON.stringify(compactProfile)}

Existing long-term memory:
${JSON.stringify(compactLongTerm)}

Recent journal entries:
${JSON.stringify(recentJournal)}

Recent mood entries:
${JSON.stringify(recentMoods)}
  `.trim();
}

async function generateLongTermSummaryWithGemini(params) {
  if (!GEMINI_API_KEY) return null;

  const prompt = buildCompressionPrompt(params);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || '')
      .join('\n')
      .trim() || '';
  const parsed = safeJsonParse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  return normalizeModelSummaryPayload(parsed);
}

function shouldCompressLongTermSummary({
  longTermSummary,
  journalCount,
  moodCount,
  force = false,
}) {
  if (force) return true;

  const lastProcessedJournal = Number(longTermSummary?.lastProcessedJournalEntryCount || 0);
  const lastProcessedMood = Number(longTermSummary?.lastProcessedMoodEntryCount || 0);
  const newJournal = Math.max(0, journalCount - lastProcessedJournal);
  const newMood = Math.max(0, moodCount - lastProcessedMood);
  const hasThreshold =
    newJournal >= LONG_TERM_COMPRESS_JOURNAL_THRESHOLD ||
    newMood >= LONG_TERM_COMPRESS_MOOD_THRESHOLD;

  const hasMissingCore =
    !String(longTermSummary?.profileSummary || '').trim() ||
    !String(longTermSummary?.emotionalBaselineSummary || '').trim();

  const lastCompressedAt = longTermSummary?.lastCompressedAt
    ? new Date(longTermSummary.lastCompressedAt).getTime()
    : 0;
  const isStale =
    !lastCompressedAt ||
    Number.isNaN(lastCompressedAt) ||
    Date.now() - lastCompressedAt >= LONG_TERM_REFRESH_INTERVAL_MS;

  const hasAnyNewData = newJournal > 0 || newMood > 0;
  return hasMissingCore || hasThreshold || (isStale && hasAnyNewData);
}

export async function maybeRefreshLongTermSummary({
  journalEntries = [],
  moodEntries = null,
  force = false,
} = {}) {
  if (compressionInFlight) return false;

  const memory = await getMemoryContext();
  const longTermSummary = normalizeLongTermSummary(memory?.longTermSummary || {});
  const journalList = Array.isArray(journalEntries) ? journalEntries : [];
  const moodList = Array.isArray(moodEntries) ? moodEntries : await getEntries();

  if (
    !shouldCompressLongTermSummary({
      longTermSummary,
      journalCount: journalList.length,
      moodCount: moodList.length,
      force,
    })
  ) {
    return false;
  }

  compressionInFlight = true;
  try {
    const profile = await getProfile();
    const generated = await generateLongTermSummaryWithGemini({
      profile,
      longTerm: longTermSummary,
      journalEntries: journalList,
      moodEntries: moodList,
    });

    if (!generated) return false;

    await saveLongTermSummary({
      __source: 'ai',
      ...generated,
      lastCompressedAt: new Date().toISOString(),
      lastProcessedJournalEntryCount: journalList.length,
      lastProcessedMoodEntryCount: moodList.length,
    });
    return true;
  } finally {
    compressionInFlight = false;
  }
}
