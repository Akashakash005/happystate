import { extractPeopleNames } from '../services/aiJournalService';

const RELATION_ALIASES = {
  mom: 'Mother',
  mother: 'Mother',
  mummy: 'Mother',
  dad: 'Father',
  father: 'Father',
  papa: 'Father',
  boss: 'Boss',
  manager: 'Manager',
  wife: 'Wife',
  husband: 'Husband',
  partner: 'Partner',
  boyfriend: 'Boyfriend',
  girlfriend: 'Girlfriend',
  brother: 'Brother',
  sister: 'Sister',
  son: 'Son',
  daughter: 'Daughter',
  friend: 'Friend',
};

const NICKNAME_TO_CANONICAL = {
  alex: 'Alex',
  alexander: 'Alex',
  mike: 'Michael',
  michael: 'Michael',
  sam: 'Sam',
  samantha: 'Sam',
  dan: 'Daniel',
  danny: 'Daniel',
  daniel: 'Daniel',
  chris: 'Chris',
  christopher: 'Chris',
};

function normalizeName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function canonicalKey(name) {
  const normalized = normalizeName(name).toLowerCase().replace(/[^\w\s]/g, '');
  if (!normalized) return '';
  if (RELATION_ALIASES[normalized]) return RELATION_ALIASES[normalized].toLowerCase();
  if (NICKNAME_TO_CANONICAL[normalized]) return NICKNAME_TO_CANONICAL[normalized].toLowerCase();
  return normalized;
}

function displayNameFromKey(key, fallback = '') {
  const raw = String(key || '').trim();
  if (!raw) return normalizeName(fallback);
  const relation = RELATION_ALIASES[raw];
  if (relation) return relation;
  const canonical = NICKNAME_TO_CANONICAL[raw];
  if (canonical) return canonical;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function extractRelationMentions(text) {
  const lower = String(text || '').toLowerCase();
  const matches = Object.keys(RELATION_ALIASES).filter((token) =>
    new RegExp(`\\b${token}\\b`, 'i').test(lower)
  );
  return [...new Set(matches.map((token) => RELATION_ALIASES[token]))];
}

function toMoodScore(value) {
  const num = Number(value);
  if (!Number.isNaN(num)) {
    if (num >= -1 && num <= 1) return num;
    if (num >= 1 && num <= 5) return Number((((num - 3) / 2).toFixed(2)));
  }
  return 0;
}

function moodLabelFromAverage(avgMood) {
  if (avgMood >= 0.2) return 'positive';
  if (avgMood <= -0.2) return 'negative';
  return 'mixed';
}

export async function buildCircle(entries, options = {}) {
  const extractor = options.extractor || extractPeopleNames;

  const map = new Map();

  for (const entry of entries || []) {
    const text = String(entry?.text || '').trim();
    if (!text) continue;

    const extracted = await extractor(text);
    const extractedNames = [...new Set((extracted || []).map(normalizeName).filter(Boolean))];
    const relationNames = extractRelationMentions(text);
    const names = [...new Set([...extractedNames, ...relationNames])];
    if (!names.length) continue;

    const moodValue = toMoodScore(entry?.mood ?? entry?.sentimentScore);
    const mentionDate = entry?.date || new Date().toISOString();

    names.forEach((name) => {
      const key = canonicalKey(name);
      if (!key) return;
      const isRelationHeuristic = relationNames.includes(name) && !extractedNames.includes(name);
      const mentionConfidence = isRelationHeuristic ? 0.6 : 0.85;

      const current = map.get(key) || {
        person: displayNameFromKey(key, name),
        mentionCount: 0,
        moodSamples: [],
        confidenceSamples: [],
        aliases: [],
        lastMentionDate: mentionDate,
      };

      const display = displayNameFromKey(key, name);
      current.person = current.person.length >= display.length ? current.person : display;
      current.mentionCount += 1;
      current.moodSamples.push(moodValue);
      current.confidenceSamples.push(mentionConfidence);
      if (!current.aliases.includes(name)) current.aliases.push(name);

      if (new Date(mentionDate) > new Date(current.lastMentionDate)) {
        current.lastMentionDate = mentionDate;
      }

      map.set(key, current);
    });
  }

  const people = [...map.values()]
    .filter((item) => item.mentionCount >= 2)
    .map((item) => {
      const total = item.moodSamples.reduce((sum, value) => sum + value, 0);
      const avgMood = item.moodSamples.length ? Number((total / item.moodSamples.length).toFixed(2)) : 0;
      const confidence = item.confidenceSamples.length
        ? Number(
          (
            item.confidenceSamples.reduce((sum, value) => sum + value, 0) /
            item.confidenceSamples.length
          ).toFixed(2)
        )
        : 0.5;
      return {
        person: item.person,
        mentionCount: item.mentionCount,
        avgMood,
        moodCorrelation: moodLabelFromAverage(avgMood),
        confidence,
        aliases: item.aliases,
        lastMentionDate: item.lastMentionDate,
      };
    })
    .sort((a, b) => b.mentionCount - a.mentionCount || b.avgMood - a.avgMood);

  return {
    people,
    positiveEnergy: people.filter((person) => person.avgMood >= 0.2),
    stressCorrelated: people.filter((person) => person.avgMood <= -0.2),
  };
}
