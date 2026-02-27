import { toDateKey } from './date';

const DAY_MS = 24 * 60 * 60 * 1000;

function round2(value) {
  return Number((value || 0).toFixed(2));
}

function trimNote(note) {
  if (!note) return '';
  const clean = String(note).trim().replace(/\s+/g, ' ');
  return clean.length > 80 ? `${clean.slice(0, 80)}...` : clean;
}

function toSentiment(moodValue) {
  // map 1..5 to -1..1 so summaries are compact and comparable
  return (Number(moodValue) - 3) / 2;
}

function getTimeBucket(dateInput) {
  const hour = new Date(dateInput).getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

function calcInstabilityIndex(values) {
  if (values.length <= 1) return 0;
  let diffSum = 0;
  for (let i = 1; i < values.length; i += 1) {
    diffSum += Math.abs(values[i] - values[i - 1]);
  }
  return round2(diffSum / (values.length - 1));
}

function calcStabilityScore(instabilityIndex) {
  // instability of 0 => 100, instability >=1 => 0 (clamped)
  return Math.max(0, Math.min(100, Math.round((1 - instabilityIndex) * 100)));
}

function filterEntriesByDays(allEntries, days) {
  const now = Date.now();
  return allEntries.filter((entry) => now - new Date(entry.dateISO).getTime() <= days * DAY_MS);
}

function summarizeCompact(entries, range) {
  const sorted = [...entries].sort((a, b) => new Date(a.dateISO) - new Date(b.dateISO));
  const sentiments = sorted.map((e) => toSentiment(e.mood));
  const overallAverage =
    sentiments.length > 0
      ? round2(sentiments.reduce((acc, s) => acc + s, 0) / sentiments.length)
      : 0;

  const instabilityIndex = calcInstabilityIndex(sentiments);
  const stabilityScore = calcStabilityScore(instabilityIndex);

  let negativeDays = 0;
  let positiveDays = 0;
  const negativeBuckets = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  const daySentimentMap = {};

  sorted.forEach((e) => {
    const day = toDateKey(e.dateISO);
    const val = toSentiment(e.mood);
    daySentimentMap[day] = daySentimentMap[day] || [];
    daySentimentMap[day].push(val);
    if (val < 0) {
      negativeBuckets[getTimeBucket(e.dateISO)] += 1;
    }
  });

  Object.values(daySentimentMap).forEach((vals) => {
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (avg < 0) negativeDays += 1;
    if (avg > 0) positiveDays += 1;
  });

  const commonNegativeTime = Object.entries(negativeBuckets).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  return {
    range,
    entryCount: sorted.length,
    overallAverage,
    stabilityScore,
    instabilityIndex,
    negativeDays,
    positiveDays,
    commonNegativeTime,
    samples: sorted.map((e) => ({
      d: toDateKey(e.dateISO),
      m: round2(toSentiment(e.mood)),
      n: trimNote(e.note),
    })),
  };
}

function buildYearSummary(entries) {
  const compact = summarizeCompact(entries, 'year');
  const byMonth = {};

  entries.forEach((entry) => {
    const d = new Date(entry.dateISO);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    byMonth[monthKey] = byMonth[monthKey] || [];
    byMonth[monthKey].push(toSentiment(entry.mood));
  });

  const monthlyAverages = Object.entries(byMonth)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, values]) => ({
      month,
      avg: round2(values.reduce((acc, v) => acc + v, 0) / values.length),
      count: values.length,
    }));

  // Never return raw per-entry samples for year mode
  return {
    range: 'year',
    entryCount: compact.entryCount,
    overallAverage: compact.overallAverage,
    yearlyAverage: compact.overallAverage,
    stabilityScore: compact.stabilityScore,
    instabilityIndex: compact.instabilityIndex,
    negativeDays: compact.negativeDays,
    positiveDays: compact.positiveDays,
    commonNegativeTime: compact.commonNegativeTime,
    monthlyAverages,
  };
}

export function compressYearToQuarterly(yearSummary) {
  const qMap = {};
  (yearSummary.monthlyAverages || []).forEach((m) => {
    const [yearStr, monthStr] = m.month.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const q = Math.ceil(month / 3);
    const key = `${year}-Q${q}`;
    qMap[key] = qMap[key] || { sum: 0, count: 0, entries: 0 };
    qMap[key].sum += m.avg * m.count;
    qMap[key].count += m.count;
    qMap[key].entries += 1;
  });

  const quarterlyAverages = Object.entries(qMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([quarter, acc]) => ({
      quarter,
      avg: round2(acc.sum / Math.max(acc.count, 1)),
      count: acc.count,
    }));

  return {
    ...yearSummary,
    monthlyAverages: undefined,
    quarterlyAverages,
  };
}

export function estimatePayloadTokens(payload) {
  const json = JSON.stringify(payload);
  return Math.ceil(json.length / 4);
}

export function getMoodDataByRange(allEntries, range) {
  const entries = Array.isArray(allEntries) ? allEntries : [];
  const todayKey = toDateKey(new Date());

  if (range === 'day') {
    const dayEntries = entries.filter((e) => toDateKey(e.dateISO) === todayKey);
    return summarizeCompact(dayEntries, 'day');
  }

  if (range === 'week') {
    return summarizeCompact(filterEntriesByDays(entries, 7), 'week');
  }

  if (range === 'month') {
    return summarizeCompact(filterEntriesByDays(entries, 30), 'month');
  }

  return buildYearSummary(filterEntriesByDays(entries, 365));
}
