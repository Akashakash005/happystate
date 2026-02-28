function round2(value) {
  return Number((value || 0).toFixed(2));
}

function toScore(mood) {
  return ((Number(mood) || 3) - 3) / 2;
}

export function calculateDailyAverage(entries) {
  const byDate = {};
  (entries || []).forEach((entry) => {
    const day = entry.date;
    if (!day) return;
    byDate[day] = byDate[day] || [];
    byDate[day].push(typeof entry.score === 'number' ? entry.score : toScore(entry.mood));
  });

  return Object.entries(byDate)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, values]) => ({
      date,
      average: round2(values.reduce((acc, v) => acc + v, 0) / values.length),
      count: values.length,
    }));
}

export function calculateDaySlotSeries(entries) {
  const slotOrder = ['morning', 'afternoon', 'evening', 'night'];
  const bySlot = {
    morning: [],
    afternoon: [],
    evening: [],
    night: [],
  };

  (entries || []).forEach((entry) => {
    const slot = slotOrder.includes(entry?.slot) ? entry.slot : 'evening';
    const score = typeof entry.score === 'number' ? entry.score : toScore(entry.mood);
    bySlot[slot].push(score);
  });

  return slotOrder
    .filter((slot) => bySlot[slot].length > 0)
    .map((slot) => ({
      label: slot.charAt(0).toUpperCase(),
      value: round2(bySlot[slot].reduce((acc, n) => acc + n, 0) / bySlot[slot].length),
      slot,
      count: bySlot[slot].length,
    }));
}

export function calculateStabilityFromSeries(values) {
  const points = (values || []).filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (!points.length) return 0;
  if (points.length === 1) return 100;

  let diffSum = 0;
  for (let i = 1; i < points.length; i += 1) {
    diffSum += Math.abs(points[i] - points[i - 1]);
  }
  const avgDiff = diffSum / (points.length - 1);
  // Score range is -1..1 => max adjacent diff is 2.
  const normalizedInstability = Math.max(0, Math.min(1, avgDiff / 2));
  return Math.max(0, Math.min(100, Math.round((1 - normalizedInstability) * 100)));
}

export function calculateSlotAverage(entries) {
  const slots = ['morning', 'afternoon', 'evening', 'night'];
  const aggregates = {
    morning: [],
    afternoon: [],
    evening: [],
    night: [],
  };

  (entries || []).forEach((entry) => {
    const slot = slots.includes(entry.slot) ? entry.slot : 'evening';
    const score = typeof entry.score === 'number' ? entry.score : toScore(entry.mood);
    aggregates[slot].push(score);
  });

  return slots.map((slot) => {
    const values = aggregates[slot];
    return {
      slot,
      average: values.length ? round2(values.reduce((a, b) => a + b, 0) / values.length) : 0,
      count: values.length,
    };
  });
}

export function calculateStabilityScore(entries) {
  const daily = calculateDailyAverage(entries);
  if (daily.length <= 1) return 100;

  let variance = 0;
  for (let i = 1; i < daily.length; i += 1) {
    variance += Math.abs(daily[i].average - daily[i - 1].average);
  }
  const instability = variance / (daily.length - 1);
  return Math.max(0, Math.min(100, Math.round((1 - instability) * 100)));
}

export function calculateHalfYearAverage(entries, half) {
  const list = Array.isArray(entries) ? entries : [];
  const nowYear = new Date().getFullYear();
  const isFirst = half === 'jan-june';

  const filtered = list.filter((entry) => {
    const d = new Date(entry.dateISO);
    if (d.getFullYear() !== nowYear) return false;
    const month = d.getMonth();
    return isFirst ? month <= 5 : month >= 6;
  });

  if (!filtered.length) return 0;
  const sum = filtered.reduce(
    (acc, entry) => acc + (typeof entry.score === 'number' ? entry.score : toScore(entry.mood)),
    0
  );
  return round2(sum / filtered.length);
}
