import { toDateKey } from './date';

export function getStats(entries) {
  if (!entries.length) {
    return {
      total: 0,
      average: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      streak: 0,
      trend: 'stable',
    };
  }

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;

  entries.forEach((e) => {
    distribution[e.mood] = (distribution[e.mood] || 0) + 1;
    sum += e.mood;
  });

  const average = Number((sum / entries.length).toFixed(2));

  const entrySet = new Set(entries.map((e) => toDateKey(e.dateISO)));
  const cursor = new Date();
  let streak = 0;
  while (entrySet.has(toDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const recent = entries.filter((e) => now - new Date(e.dateISO).getTime() <= 7 * dayMs);
  const previous = entries.filter((e) => {
    const diff = now - new Date(e.dateISO).getTime();
    return diff > 7 * dayMs && diff <= 14 * dayMs;
  });

  const avg = (list) =>
    list.length ? list.reduce((acc, item) => acc + item.mood, 0) / list.length : 0;

  const recentAvg = avg(recent);
  const prevAvg = avg(previous);

  let trend = 'stable';
  if (recentAvg > prevAvg + 0.2) trend = 'up';
  if (recentAvg < prevAvg - 0.2) trend = 'down';

  return { total: entries.length, average, distribution, streak, trend };
}
