import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { buildCircle } from "../utils/buildCircle";
import {
  DB_SCHEMA,
  getCharacterCollection,
  getUserDocId,
  normalizeCharacterMode,
} from "../constants/dataSchema";
import { getActiveCharacterMode } from "./characterModeService";

const STORAGE_KEY = "@happy_state_circle_state_v1";

function getCircleStorageKey(mode = "public") {
  return `${STORAGE_KEY}_${normalizeCharacterMode(mode)}`;
}

function circleRef(userDocId, mode = "public") {
  return doc(
    db,
    DB_SCHEMA.users,
    userDocId,
    getCharacterCollection(mode),
    DB_SCHEMA.appData,
  );
}

function normalizeAliases(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean),
  )].slice(0, 20);
}

function normalizePerson(person = {}) {
  return {
    key: String(person.key || "").trim(),
    person: String(person.person || "").trim(),
    mentionCount: Number(person.mentionCount || 0),
    avgMood: Number(person.avgMood || 0),
    avgLevel: Number(person.avgLevel || 0),
    peakLevel: Number(person.peakLevel || 0),
    highIntensityCount: Number(person.highIntensityCount || 0),
    recentHeat: Number(person.recentHeat || 0),
    moodCorrelation: String(person.moodCorrelation || "mixed"),
    confidence: Number(person.confidence || 0),
    aliases: normalizeAliases(person.aliases),
    lastMentionDate: person.lastMentionDate || null,
  };
}

function normalizePersonNames(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizePerson)
    .filter((item) => item.key && item.person)
    .map((item) => item.person);
}

function normalizeManualEdits(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.keys(value).reduce((acc, key) => {
    const item = value[key];
    acc[key] = {
      person: String(item?.person || "").trim(),
      aliases: normalizeAliases(item?.aliases),
      deleted: Boolean(item?.deleted),
    };
    return acc;
  }, {});
}

function normalizeCircleState(data = {}) {
  const people = Array.isArray(data?.people)
    ? data.people.map(normalizePerson).filter((item) => item.key && item.person)
    : [];
  return {
    people,
    positiveEnergy: Array.isArray(data?.positiveEnergy) ? data.positiveEnergy : [],
    stressCorrelated: Array.isArray(data?.stressCorrelated) ? data.stressCorrelated : [],
    topTeasing: normalizePersonNames(data?.topTeasing),
    peakTriggers: normalizePersonNames(data?.peakTriggers),
    mostFrequent: normalizePersonNames(data?.mostFrequent),
    risingRecently: normalizePersonNames(data?.risingRecently),
    extractionMeta:
      data?.extractionMeta && typeof data.extractionMeta === "object"
        ? {
            provider: String(data.extractionMeta.provider || ""),
            totalEntries: Number(data.extractionMeta.totalEntries || 0),
            entriesWithNoNames: Number(data.extractionMeta.entriesWithNoNames || 0),
            fallbackCount: Number(data.extractionMeta.fallbackCount || 0),
            providerFailed: Boolean(data.extractionMeta.providerFailed),
            puterNotConnected: Boolean(data.extractionMeta.puterNotConnected),
            lastMessage: String(data.extractionMeta.lastMessage || ""),
          }
        : null,
    manualEdits: normalizeManualEdits(data?.manualEdits),
    updatedAt: data?.updatedAt || null,
  };
}

function applyManualEdits(circleState) {
  const manualEdits = normalizeManualEdits(circleState?.manualEdits);
  const people = (circleState?.people || []).map((person) => {
    const edit = manualEdits[person.key];
    if (!edit) return person;
    if (edit.deleted) return null;
    return {
      ...person,
      person: edit.person || person.person,
      aliases: normalizeAliases([...(person.aliases || []), ...(edit.aliases || [])]),
    };
  }).filter(Boolean);

  return {
    ...circleState,
    people,
    positiveEnergy: people.filter((person) => person.avgMood >= 0.2).map((person) => person.person),
    stressCorrelated: people.filter((person) => person.avgMood <= -0.2).map((person) => person.person),
    topTeasing: Array.isArray(circleState?.topTeasing) ? circleState.topTeasing : [],
    peakTriggers: Array.isArray(circleState?.peakTriggers) ? circleState.peakTriggers : [],
    mostFrequent: Array.isArray(circleState?.mostFrequent) ? circleState.mostFrequent : [],
    risingRecently: Array.isArray(circleState?.risingRecently) ? circleState.risingRecently : [],
    extractionMeta: circleState?.extractionMeta || null,
    manualEdits,
  };
}

export async function getCircleState(modeOverride = null) {
  const mode = normalizeCharacterMode(modeOverride || (await getActiveCharacterMode()));
  const storageKey = getCircleStorageKey(mode);
  const localState = await (async () => {
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      return raw ? normalizeCircleState(JSON.parse(raw)) : normalizeCircleState();
    } catch {
      return normalizeCircleState();
    }
  })();

  const userDocId = getUserDocId(auth.currentUser);
  if (!userDocId) {
    return applyManualEdits(localState);
  }

  try {
    const ref = circleRef(userDocId, mode);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return applyManualEdits(localState);
    }

    const remoteState = normalizeCircleState(snap.data()?.circleState || {});
    await AsyncStorage.setItem(storageKey, JSON.stringify(remoteState));
    return applyManualEdits(remoteState);
  } catch {
    return applyManualEdits(localState);
  }
}

async function saveCircleState(state, modeOverride = null) {
  const mode = normalizeCharacterMode(modeOverride || (await getActiveCharacterMode()));
  const normalized = normalizeCircleState(state);
  await AsyncStorage.setItem(getCircleStorageKey(mode), JSON.stringify(normalized));

  const userDocId = getUserDocId(auth.currentUser);
  if (userDocId) {
    try {
      const ref = circleRef(userDocId, mode);
      await setDoc(ref, { circleState: normalized }, { merge: true });
    } catch {
      // Keep local copy even if sync fails.
    }
  }

  return applyManualEdits(normalized);
}

export async function refreshCircleState({ journalEntries = null, mode = null } = {}) {
  const activeMode = normalizeCharacterMode(mode || (await getActiveCharacterMode()));
  const current = await getCircleState(activeMode);
  const entries = Array.isArray(journalEntries)
    ? journalEntries
    : await (async () => {
        const journalService = await import("./journalService");
        return journalService.getAllJournalEntries(activeMode);
      })();
  const analysis = await buildCircle(entries, { journalMode: activeMode });
  const nextState = {
    people: Array.isArray(analysis?.people) ? analysis.people : [],
    positiveEnergy: Array.isArray(analysis?.positiveEnergy)
      ? analysis.positiveEnergy.map((person) => person.person)
      : [],
    stressCorrelated: Array.isArray(analysis?.stressCorrelated)
      ? analysis.stressCorrelated.map((person) => person.person)
      : [],
    topTeasing: Array.isArray(analysis?.topTeasing)
      ? analysis.topTeasing.map((person) => person.person)
      : [],
    peakTriggers: Array.isArray(analysis?.peakTriggers)
      ? analysis.peakTriggers.map((person) => person.person)
      : [],
    mostFrequent: Array.isArray(analysis?.mostFrequent)
      ? analysis.mostFrequent.map((person) => person.person)
      : [],
    risingRecently: Array.isArray(analysis?.risingRecently)
      ? analysis.risingRecently.map((person) => person.person)
      : [],
    extractionMeta: analysis?.extractionMeta || null,
    manualEdits: current.manualEdits || {},
    updatedAt: new Date().toISOString(),
  };
  return saveCircleState(nextState, activeMode);
}

export async function saveCirclePersonEdit({ key, person, aliases }, modeOverride = null) {
  const mode = normalizeCharacterMode(modeOverride || (await getActiveCharacterMode()));
  const current = await getCircleState(mode);
  const manualEdits = {
    ...(current.manualEdits || {}),
    [key]: {
      person: String(person || "").trim(),
      aliases: normalizeAliases(aliases),
      deleted: false,
    },
  };
  return saveCircleState({ ...current, manualEdits, updatedAt: new Date().toISOString() }, mode);
}

export async function deleteCirclePerson(key, modeOverride = null) {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) {
    throw new Error("Missing person key.");
  }

  const mode = normalizeCharacterMode(modeOverride || (await getActiveCharacterMode()));
  const current = await getCircleState(mode);
  const manualEdits = {
    ...(current.manualEdits || {}),
    [normalizedKey]: {
      person: "",
      aliases: [],
      deleted: true,
    },
  };

  return saveCircleState(
    { ...current, manualEdits, updatedAt: new Date().toISOString() },
    mode,
  );
}
