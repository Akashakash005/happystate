import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { toDateKey } from "../utils/date";
import {
  DB_SCHEMA,
  getCharacterCollection,
  getUserDocId,
  normalizeCharacterMode,
} from "../constants/dataSchema";
import { getActiveCharacterMode } from "./characterModeService";

const STORAGE_KEY = "@happy_state_activity_calendar_v1";

function getStorageKey(mode = "public") {
  return `${STORAGE_KEY}_${normalizeCharacterMode(mode)}`;
}

function clampScore(value) {
  const next = Number(value);
  if (Number.isNaN(next)) return 0;
  return Math.max(0, Math.min(3, Math.round(next)));
}

function normalizeCalendarEntry(entry) {
  if (!entry) return null;

  const date = toDateKey(entry.date || entry.updatedAt || new Date());
  const updatedAt = entry.updatedAt || new Date().toISOString();

  return {
    id: entry.id || date,
    date,
    score: clampScore(entry.score),
    createdAt: entry.createdAt || updatedAt,
    updatedAt,
  };
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date));
}

function activityCalendarRef(userDocId, mode = "public") {
  return doc(
    db,
    DB_SCHEMA.users,
    userDocId,
    getCharacterCollection(mode),
    DB_SCHEMA.appData,
  );
}

async function getLocalEntries(storageKey) {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const normalized = Array.isArray(parsed)
      ? parsed.map(normalizeCalendarEntry).filter(Boolean)
      : [];
    return sortEntries(normalized);
  } catch {
    return [];
  }
}

export async function getActivityCalendarEntries(modeOverride = null) {
  const mode = normalizeCharacterMode(
    modeOverride || (await getActiveCharacterMode()),
  );
  const storageKey = getStorageKey(mode);
  const localEntries = await getLocalEntries(storageKey);
  const userDocId = getUserDocId(auth.currentUser);

  if (!userDocId) return localEntries;

  try {
    const ref = activityCalendarRef(userDocId, mode);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      if (localEntries.length) {
        await setDoc(
          ref,
          {
            activityCalendar: {
              entries: localEntries,
              updatedAt: new Date().toISOString(),
            },
          },
          { merge: true },
        );
      }
      return localEntries;
    }

    const remoteEntries = Array.isArray(snap.data()?.activityCalendar?.entries)
      ? snap.data().activityCalendar.entries
          .map(normalizeCalendarEntry)
          .filter(Boolean)
      : [];
    const sortedRemote = sortEntries(remoteEntries);

    if (sortedRemote.length === 0 && localEntries.length > 0) {
      await setDoc(
        ref,
        {
          activityCalendar: {
            entries: localEntries,
            updatedAt: new Date().toISOString(),
          },
        },
        { merge: true },
      );
      return localEntries;
    }

    if (localEntries.length > sortedRemote.length) {
      await setDoc(
        ref,
        {
          activityCalendar: {
            entries: localEntries,
            updatedAt: new Date().toISOString(),
          },
        },
        { merge: true },
      );
      return localEntries;
    }

    await AsyncStorage.setItem(storageKey, JSON.stringify(sortedRemote));
    return sortedRemote;
  } catch {
    return localEntries;
  }
}

export async function saveActivityCalendarEntries(entries, modeOverride = null) {
  const mode = normalizeCharacterMode(
    modeOverride || (await getActiveCharacterMode()),
  );
  const normalized = sortEntries(
    (entries || []).map(normalizeCalendarEntry).filter(Boolean),
  );
  await AsyncStorage.setItem(getStorageKey(mode), JSON.stringify(normalized));

  const userDocId = getUserDocId(auth.currentUser);
  if (userDocId) {
    try {
      const ref = activityCalendarRef(userDocId, mode);
      await setDoc(
        ref,
        {
          activityCalendar: {
            entries: normalized,
            updatedAt: new Date().toISOString(),
          },
        },
        { merge: true },
      );
    } catch {
      // Keep local save working if sync fails.
    }
  }

  return normalized;
}

export async function upsertActivityCalendarEntry(
  { date, score },
  modeOverride = null,
) {
  const safeDate = toDateKey(date || new Date());
  const safeScore = clampScore(score);
  const nowISO = new Date().toISOString();
  const existing = await getActivityCalendarEntries(modeOverride);
  const index = existing.findIndex((item) => item.date === safeDate);

  const nextEntry = {
    id: safeDate,
    date: safeDate,
    score: safeScore,
    updatedAt: nowISO,
  };

  if (index >= 0) {
    existing[index] = {
      ...existing[index],
      ...nextEntry,
    };
  } else {
    existing.push({
      ...nextEntry,
      createdAt: nowISO,
    });
  }

  return saveActivityCalendarEntries(existing, modeOverride);
}

export async function deleteActivityCalendarEntry(date, modeOverride = null) {
  const safeDate = toDateKey(date || new Date());
  const existing = await getActivityCalendarEntries(modeOverride);
  const filtered = existing.filter((item) => item.date !== safeDate);
  return saveActivityCalendarEntries(filtered, modeOverride);
}
