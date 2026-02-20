import AsyncStorage from '@react-native-async-storage/async-storage';
import { toDateKey } from '../utils/date';

const STORAGE_KEY = '@happy_state_entries_v1';

export async function getEntries() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveEntries(entries) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  return entries;
}

export async function upsertTodayEntry({ mood, note }) {
  const now = new Date();
  const todayKey = toDateKey(now);

  const existing = await getEntries();
  const idx = existing.findIndex((item) => toDateKey(item.dateISO) === todayKey);

  if (idx >= 0) {
    existing[idx] = {
      ...existing[idx],
      mood,
      note,
      updatedAt: now.toISOString(),
    };
  } else {
    existing.unshift({
      id: `${Date.now()}`,
      dateISO: now.toISOString(),
      mood,
      note,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }

  existing.sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO));
  await saveEntries(existing);
  return existing;
}
