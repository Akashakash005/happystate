import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { toDateKey } from '../utils/date';
import { auth, db } from './firebase';
import {
  DB_SCHEMA,
  getCharacterCollection,
  getUserDocId,
  normalizeCharacterMode,
} from '../constants/dataSchema';
import { getActiveCharacterMode } from './characterModeService';

const STORAGE_KEY = '@happy_state_entries_v1';
const SLOT_HOURS = { morning: 9, afternoon: 14, evening: 19, night: 23 };
const SLOT_ORDER = { morning: 1, afternoon: 2, evening: 3, night: 4 };

function getSlotByHour(hour) {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

function toISOFromDateSlot(date, slot) {
  const [y, m, d] = String(date).split('-').map(Number);
  const hour = SLOT_HOURS[slot] ?? 12;
  return new Date(y, (m || 1) - 1, d || 1, hour, 0, 0).toISOString();
}

function clampMood(value) {
  const mood = Number(value);
  if (Number.isNaN(mood)) return 3;
  return Math.max(1, Math.min(5, mood));
}

function toScore(mood) {
  return Number((((mood || 3) - 3) / 2).toFixed(2));
}

function normalizeEntry(entry) {
  if (!entry) return null;

  const fallbackISO = entry.dateISO || entry.actualLoggedAt || new Date().toISOString();
  const fallbackDate = toDateKey(fallbackISO);
  const fallbackSlot = getSlotByHour(new Date(fallbackISO).getHours());

  const mood = clampMood(entry.mood);
  const date = entry.date || fallbackDate;
  const slot = entry.slot || fallbackSlot;
  const dateISO = entry.dateISO || toISOFromDateSlot(date, slot);

  return {
    id: entry.id || `${date}_${slot}`,
    date,
    slot,
    mood,
    score: typeof entry.score === 'number' ? entry.score : toScore(mood),
    note: entry.note || '',
    dateISO,
    actualLoggedAt: entry.actualLoggedAt || entry.updatedAt || new Date().toISOString(),
    isBackfilled: typeof entry.isBackfilled === 'boolean' ? entry.isBackfilled : date !== toDateKey(new Date()),
    createdAt: entry.createdAt || new Date().toISOString(),
    updatedAt: entry.updatedAt || new Date().toISOString(),
  };
}

function sortEntries(list) {
  return [...list].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return (SLOT_ORDER[b.slot] || 0) - (SLOT_ORDER[a.slot] || 0);
  });
}

function getEntriesStorageKey(mode = 'public') {
  return `${STORAGE_KEY}_${normalizeCharacterMode(mode)}`;
}

function moodEntriesRef(userDocId, mode = 'public') {
  return doc(
    db,
    DB_SCHEMA.users,
    userDocId,
    getCharacterCollection(mode),
    DB_SCHEMA.appData
  );
}

export async function getEntries(modeOverride = null) {
  const mode = normalizeCharacterMode(modeOverride || await getActiveCharacterMode());
  const storageKey = getEntriesStorageKey(mode);
  const localEntries = await (async () => {
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const normalized = Array.isArray(parsed)
        ? parsed.map(normalizeEntry).filter(Boolean)
        : [];
      return sortEntries(normalized);
    } catch {
      return [];
    }
  })();

  const userDocId = getUserDocId(auth.currentUser);
  if (!userDocId) return localEntries;

  try {
    const ref = moodEntriesRef(userDocId, mode);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      if (localEntries.length) {
        await setDoc(ref, { entries: localEntries, updatedAt: new Date().toISOString() }, { merge: true });
      }
      return localEntries;
    }

    const remoteEntries = Array.isArray(snap.data()?.moodEntries?.entries)
      ? snap.data().moodEntries.entries.map(normalizeEntry).filter(Boolean)
      : [];
    const sortedRemote = sortEntries(remoteEntries);

    if (sortedRemote.length === 0 && localEntries.length > 0) {
      await setDoc(
        ref,
        {
          moodEntries: {
            entries: localEntries,
            updatedAt: new Date().toISOString(),
          },
        },
        { merge: true }
      );
      return localEntries;
    }

    if (localEntries.length > sortedRemote.length) {
      await setDoc(
        ref,
        {
          moodEntries: {
            entries: localEntries,
            updatedAt: new Date().toISOString(),
          },
        },
        { merge: true }
      );
      return localEntries;
    }

    await AsyncStorage.setItem(storageKey, JSON.stringify(sortedRemote));
    return sortedRemote;
  } catch {
    return localEntries;
  }
}

export async function saveEntries(entries, modeOverride = null) {
  const mode = normalizeCharacterMode(modeOverride || await getActiveCharacterMode());
  const normalized = sortEntries((entries || []).map(normalizeEntry).filter(Boolean));
  await AsyncStorage.setItem(getEntriesStorageKey(mode), JSON.stringify(normalized));

  const userDocId = getUserDocId(auth.currentUser);
  if (userDocId) {
    try {
      const ref = moodEntriesRef(userDocId, mode);
      await setDoc(
        ref,
        {
          moodEntries: {
            entries: normalized,
            updatedAt: new Date().toISOString(),
          },
        },
        { merge: true }
      );
    } catch {
      // Keep local save successful even if remote sync temporarily fails.
    }
  }

  return normalized;
}

export async function upsertEntry({
  date,
  slot,
  mood,
  note,
  actualLoggedAt,
  isBackfilled,
  mode,
}) {
  const safeDate = date || toDateKey(new Date());
  const safeSlot = slot || 'evening';
  const safeMood = clampMood(mood);
  const nowISO = new Date().toISOString();

  const existing = await getEntries(mode);
  const idx = existing.findIndex((item) => item.date === safeDate && item.slot === safeSlot);

  const entryPayload = {
    id: `${safeDate}_${safeSlot}`,
    date: safeDate,
    slot: safeSlot,
    mood: safeMood,
    score: toScore(safeMood),
    note: note || '',
    dateISO: toISOFromDateSlot(safeDate, safeSlot),
    actualLoggedAt: actualLoggedAt || nowISO,
    isBackfilled: typeof isBackfilled === 'boolean' ? isBackfilled : safeDate !== toDateKey(new Date()),
    updatedAt: nowISO,
  };

  if (idx >= 0) {
    existing[idx] = {
      ...existing[idx],
      ...entryPayload,
    };
  } else {
    existing.push({
      ...entryPayload,
      createdAt: nowISO,
    });
  }

  return saveEntries(existing, mode);
}

export async function upsertTodayEntry({ mood, note, mode }) {
  return upsertEntry({
    date: toDateKey(new Date()),
    slot: 'evening',
    mood,
    note,
    isBackfilled: false,
    mode,
  });
}

export async function deleteEntry({ date, slot, id, mode }) {
  const existing = await getEntries(mode);
  const filtered = existing.filter((item) => {
    if (id) return item.id !== id;
    return !(item.date === date && item.slot === slot);
  });
  return saveEntries(filtered, mode);
}
