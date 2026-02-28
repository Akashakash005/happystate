import { getProfile } from './profileService';
import { getEntries } from './storageService';
import { getMemoryContext } from './memoryService';

function truncate(text, max = 220) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return '';
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

function average(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, n) => sum + Number(n || 0), 0) / values.length;
}

function isWithinLastDays(isoDate, days = 7) {
  if (!isoDate) return false;
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return false;
  const now = Date.now();
  const diff = now - date.getTime();
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
}

function buildProfileSummary(profile = {}) {
  const name = String(profile?.name || 'User').trim();
  const age = String(profile?.age || '').trim();
  const profession = String(profile?.profession || '').trim();
  const gender = String(profile?.gender || '').trim();
  const about = truncate(profile?.about || '', 180);
  const stressLevel = String(profile?.stressLevel || '').trim();
  const energyPattern = String(profile?.energyPattern || '').trim();
  const emotionalSensitivity = String(profile?.emotionalSensitivity || '').trim();
  const aiTone = String(profile?.aiTone || '').trim();
  const suggestionDepth = String(profile?.suggestionDepth || '').trim();

  const details = [
    name ? `Name: ${name}` : '',
    age ? `Age: ${age}` : '',
    gender ? `Gender: ${gender}` : '',
    profession ? `Profession: ${profession}` : '',
    stressLevel ? `Stress baseline: ${stressLevel}` : '',
    energyPattern ? `Energy pattern: ${energyPattern}` : '',
    emotionalSensitivity ? `Sensitivity: ${emotionalSensitivity}` : '',
    aiTone ? `Preferred tone: ${aiTone}` : '',
    suggestionDepth ? `Depth: ${suggestionDepth}` : '',
    about ? `About: ${about}` : '',
  ].filter(Boolean);

  return truncate(details.join(' | '), 420);
}

function buildMoodSummary(entries = []) {
  const recent = entries
    .filter((entry) => isWithinLastDays(entry?.dateISO || entry?.actualLoggedAt || entry?.updatedAt, 7))
    .slice(0, 20);

  if (!recent.length) {
    return {
      recentMoodTrend: 'No recent mood entries in the last 7 days.',
      recentEntriesSummary: '',
    };
  }

  const sortedAsc = [...recent].sort(
    (a, b) =>
      new Date(a.dateISO || a.actualLoggedAt || a.updatedAt || 0) -
      new Date(b.dateISO || b.actualLoggedAt || b.updatedAt || 0)
  );

  const scores = sortedAsc.map((entry) => Number(entry?.score ?? 0)).filter((n) => !Number.isNaN(n));
  const pivot = Math.max(1, Math.floor(scores.length / 2));
  const firstHalf = scores.slice(0, pivot);
  const secondHalf = scores.slice(pivot);
  const delta = average(secondHalf) - average(firstHalf);
  const overall = average(scores);

  let trendText = `7d average mood score: ${overall.toFixed(2)}.`;
  if (delta >= 0.12) trendText += ' Trend: improving.';
  else if (delta <= -0.12) trendText += ' Trend: declining.';
  else trendText += ' Trend: stable.';

  const entryHighlights = sortedAsc
    .slice(-5)
    .map((entry) => {
      const date = String(entry?.date || '').trim();
      const slot = String(entry?.slot || '').trim();
      const note = truncate(entry?.note || '', 64);
      const mood = Number(entry?.mood || 3);
      const label = note ? `"${note}"` : 'no note';
      return `${date} ${slot} mood:${mood} ${label}`.trim();
    })
    .filter(Boolean)
    .join(' | ');

  return {
    recentMoodTrend: truncate(trendText, 180),
    recentEntriesSummary: truncate(entryHighlights, 420),
  };
}

function buildRecentHistorySummary(history = []) {
  const compact = (history || [])
    .slice(-6)
    .map((msg) => {
      const role = msg?.role === 'assistant' ? 'assistant' : 'user';
      const text = truncate(msg?.text || '', 90);
      return text ? `${role}: ${text}` : '';
    })
    .filter(Boolean)
    .join(' | ');
  return truncate(compact, 520);
}

export async function buildJournalContext({ history = [] } = {}) {
  const [profile, entries, memory] = await Promise.all([
    getProfile(),
    getEntries(),
    getMemoryContext(),
  ]);

  const mood = buildMoodSummary(entries || []);
  const longTerm = memory?.longTermSummary || {};
  const rolling = memory?.rollingContext || {};
  const manualTagsSummary = Array.isArray(longTerm?.manualTags)
    ? longTerm.manualTags
        .map((item) => {
          const label = truncate(item?.label || '', 24);
          const name = truncate(item?.name || '', 32);
          return label && name ? `${label}: ${name}` : '';
        })
        .filter(Boolean)
        .slice(0, 20)
        .join(' | ')
    : '';

  return {
    profileSummary: buildProfileSummary(profile || {}),
    recentMoodTrend: mood.recentMoodTrend,
    recentEntriesSummary: mood.recentEntriesSummary,
    longTermSummary: truncate(
      [
        truncate(longTerm.profileSummary, 120),
        truncate(longTerm.emotionalBaselineSummary, 120),
        truncate(longTerm.personalityPattern, 120),
        truncate(longTerm.stressBaseline, 100),
      ]
        .filter(Boolean)
        .join(' | '),
      420
    ),
    rollingSummary: truncate(
      [
        truncate(rolling.recentMoodTrend7d, 120),
        truncate(rolling.recentEntriesSummary, 120),
        truncate(rolling.sessionSummary, 120),
        truncate(rolling.activeFocus, 90),
      ]
        .filter(Boolean)
        .join(' | '),
      420
    ),
    recentChatHistorySummary: buildRecentHistorySummary(history),
    manualTagsSummary: truncate(manualTagsSummary, 520),
  };
}
