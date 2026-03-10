import AsyncStorage from "@react-native-async-storage/async-storage";

const CHARACTER_MODE_KEY = "@happy_state_character_mode_v1";

function normalizeMode(value) {
  return value === "private" ? "private" : "public";
}

export async function getActiveCharacterMode() {
  try {
    const raw = await AsyncStorage.getItem(CHARACTER_MODE_KEY);
    return normalizeMode(raw);
  } catch {
    return "public";
  }
}

export async function setActiveCharacterMode(mode) {
  const normalized = normalizeMode(mode);
  await AsyncStorage.setItem(CHARACTER_MODE_KEY, normalized);
  return normalized;
}

export function resolveCharacterMode(value) {
  return normalizeMode(value);
}
