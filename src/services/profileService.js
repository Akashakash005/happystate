import AsyncStorage from '@react-native-async-storage/async-storage';

const PROFILE_KEY = '@happy_state_profile_v1';

const OPTION_SETS = {
  stressLevel: ['Low', 'Medium', 'High'],
  energyPattern: ['Morning', 'Night', 'Mixed'],
  emotionalSensitivity: ['Low', 'Moderate', 'High'],
  aiTone: ['Gentle', 'Direct', 'Motivational'],
  suggestionDepth: ['Quick', 'Detailed'],
  defaultInsightRange: ['Day', 'Week', 'Month', 'Year'],
};

export const DEFAULT_PROFILE = {
  name: 'You',
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

function validateOption(key, value) {
  return OPTION_SETS[key].includes(value);
}

function normalizeSleepAverage(value) {
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  if (num < 0 || num > 24) return null;
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

  return {
    isValid: true,
    data: {
      ...next,
      name: String(next.name).trim(),
      sleepAverage,
      allowLongTermAnalysis: Boolean(next.allowLongTermAnalysis),
      showProfessionalSupportSuggestions: Boolean(next.showProfessionalSupportSuggestions),
      updatedAt: new Date().toISOString(),
    },
  };
}

export async function getProfile() {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PROFILE, ...(parsed || {}) };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export async function saveProfile(profileData) {
  const check = validateProfile(profileData);
  if (!check.isValid) {
    throw new Error(check.message);
  }

  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(check.data));
  return check.data;
}

export async function updateProfile(partialData) {
  const current = await getProfile();
  return saveProfile({ ...current, ...(partialData || {}) });
}
