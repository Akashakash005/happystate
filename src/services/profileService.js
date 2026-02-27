import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { DB_SCHEMA } from '../constants/dataSchema';

const PROFILE_KEY = '@happy_state_profile_v1';

const OPTION_SETS = {
  stressLevel: ['Low', 'Medium', 'High'],
  energyPattern: ['Morning', 'Night', 'Mixed'],
  emotionalSensitivity: ['Low', 'Moderate', 'High'],
  aiTone: ['Gentle', 'Direct', 'Motivational'],
  suggestionDepth: ['Quick', 'Detailed'],
  defaultInsightRange: ['Day', 'Week', 'Month', 'Year'],
  gender: ['Female', 'Male', 'Non-binary', 'Prefer not to say'],
};

export const DEFAULT_PROFILE = {
  name: 'You',
  age: '',
  profession: '',
  weight: '',
  height: '',
  gender: 'Prefer not to say',
  about: '',
  stressLevel: 'Medium',
  sleepAverage: '7',
  energyPattern: 'Mixed',
  emotionalSensitivity: 'Moderate',
  aiTone: 'Gentle',
  suggestionDepth: 'Detailed',
  defaultInsightRange: 'Week',
  allowLongTermAnalysis: true,
  showProfessionalSupportSuggestions: true,
  updatedAt: null,
};

export function hasRequiredPersonalDetails(profileData = {}) {
  const p = { ...DEFAULT_PROFILE, ...(profileData || {}) };
  const required = [
    String(p.name || '').trim(),
    String(p.age || '').trim(),
    String(p.profession || '').trim(),
    String(p.weight || '').trim(),
    String(p.height || '').trim(),
    String(p.gender || '').trim(),
    String(p.about || '').trim(),
  ];
  return required.every(Boolean);
}

function validateOption(key, value) {
  return OPTION_SETS[key].includes(value);
}

function normalizeSleepAverage(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  if (num < 0 || num > 24) return null;
  return Number(num.toFixed(1)).toString();
}

function normalizeOptionalNumber(value, { min, max }) {
  if (value === '' || value === null || typeof value === 'undefined') return '';
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  if (num < min || num > max) return null;
  return Number(num.toFixed(1)).toString();
}

export function validateProfile(profileData = {}) {
  const next = { ...DEFAULT_PROFILE, ...profileData };

  if (!next.name || String(next.name).trim().length < 2) {
    return { isValid: false, message: 'Name must be at least 2 characters.' };
  }

  const sleepAverage = normalizeSleepAverage(next.sleepAverage);
  if (sleepAverage === null) {
    return { isValid: false, message: 'Sleep Average must be between 0 and 24 hours.' };
  }

  if (!validateOption('stressLevel', next.stressLevel)) {
    return { isValid: false, message: 'Invalid Stress Level value.' };
  }
  if (!validateOption('energyPattern', next.energyPattern)) {
    return { isValid: false, message: 'Invalid Energy Pattern value.' };
  }
  if (!validateOption('emotionalSensitivity', next.emotionalSensitivity)) {
    return { isValid: false, message: 'Invalid Emotional Sensitivity value.' };
  }
  if (!validateOption('aiTone', next.aiTone)) {
    return { isValid: false, message: 'Invalid AI Tone value.' };
  }
  if (!validateOption('suggestionDepth', next.suggestionDepth)) {
    return { isValid: false, message: 'Invalid Suggestion Depth value.' };
  }
  if (!validateOption('defaultInsightRange', next.defaultInsightRange)) {
    return { isValid: false, message: 'Invalid Default Insight Range value.' };
  }
  if (!validateOption('gender', next.gender)) {
    return { isValid: false, message: 'Invalid Gender value.' };
  }

  const age = normalizeOptionalNumber(next.age, { min: 1, max: 120 });
  if (age === null) {
    return { isValid: false, message: 'Age must be between 1 and 120.' };
  }

  const weight = normalizeOptionalNumber(next.weight, { min: 1, max: 500 });
  if (weight === null) {
    return { isValid: false, message: 'Weight must be between 1 and 500.' };
  }

  const height = normalizeOptionalNumber(next.height, { min: 1, max: 300 });
  if (height === null) {
    return { isValid: false, message: 'Height must be between 1 and 300.' };
  }

  return {
    isValid: true,
    data: {
      ...next,
      name: String(next.name).trim(),
      age,
      profession: String(next.profession || '').trim(),
      weight,
      height,
      gender: next.gender,
      about: String(next.about || '').trim().slice(0, 240),
      sleepAverage,
      allowLongTermAnalysis: Boolean(next.allowLongTermAnalysis),
      showProfessionalSupportSuggestions: Boolean(next.showProfessionalSupportSuggestions),
      updatedAt: new Date().toISOString(),
    },
  };
}

export async function getProfile() {
  const localProfile = await (async () => {
    try {
      const raw = await AsyncStorage.getItem(PROFILE_KEY);
      if (!raw) return DEFAULT_PROFILE;
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_PROFILE, ...(parsed || {}) };
    } catch {
      return DEFAULT_PROFILE;
    }
  })();

  const uid = auth.currentUser?.uid;
  if (!uid) return localProfile;

  try {
    const ref = doc(db, DB_SCHEMA.users, uid, DB_SCHEMA.appData, DB_SCHEMA.docs.profile);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      if (localProfile && localProfile !== DEFAULT_PROFILE) {
        await setDoc(ref, { ...localProfile }, { merge: true });
      }
      return localProfile;
    }

    const remote = { ...DEFAULT_PROFILE, ...(snap.data() || {}) };
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(remote));
    return remote;
  } catch {
    return localProfile;
  }
}

export async function saveProfile(profileData) {
  const check = validateProfile(profileData);
  if (!check.isValid) {
    throw new Error(check.message);
  }

  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(check.data));

  const uid = auth.currentUser?.uid;
  if (uid) {
    try {
      const ref = doc(db, DB_SCHEMA.users, uid, DB_SCHEMA.appData, DB_SCHEMA.docs.profile);
      await setDoc(ref, { ...check.data }, { merge: true });
      await setDoc(
        doc(db, DB_SCHEMA.users, uid),
        {
          displayName: check.data.name || '',
          profileCompleted: hasRequiredPersonalDetails(check.data),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch {
      // Keep local save successful even if remote sync temporarily fails.
    }
  }

  return check.data;
}

export async function updateProfile(partialData) {
  const current = await getProfile();
  return saveProfile({ ...current, ...(partialData || {}) });
}
