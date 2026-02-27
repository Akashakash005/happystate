import { extractPeopleNames } from '../services/aiJournalService';

function normalizeName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ');
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
    const names = [...new Set((extracted || []).map(normalizeName).filter(Boolean))];
    if (!names.length) continue;

    const moodValue = toMoodScore(entry?.mood ?? entry?.sentimentScore);
    const mentionDate = entry?.date || new Date().toISOString();

    names.forEach((name) => {
      const key = name.toLowerCase();
      const current = map.get(key) || {
        person: name,
        mentionCount: 0,
        moodSamples: [],
        lastMentionDate: mentionDate,
      };

      current.person = current.person.length >= name.length ? current.person : name;
      current.mentionCount += 1;
      current.moodSamples.push(moodValue);

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
      return {
        person: item.person,
        mentionCount: item.mentionCount,
        avgMood,
        moodCorrelation: moodLabelFromAverage(avgMood),
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
