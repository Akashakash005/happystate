import { toDateKey } from './date';

const DAY_MS = 24 * 60 * 60 * 1000;

export function getFilteredData(entries, filter) {
  const list = Array.isArray(entries) ? entries : [];
  const now = new Date();
  const nowTs = now.getTime();
  const currentYear = now.getFullYear();
  const todayKey = toDateKey(now);

  if (filter === 'day') {
    return list.filter((entry) => entry.date === todayKey);
  }

  if (filter === 'week') {
    return list.filter((entry) => nowTs - new Date(entry.dateISO).getTime() <= 7 * DAY_MS);
  }

  if (filter === 'month') {
    return list.filter((entry) => nowTs - new Date(entry.dateISO).getTime() <= 30 * DAY_MS);
  }

  if (filter === 'jan-june') {
    return list.filter((entry) => {
      const d = new Date(entry.dateISO);
      return d.getFullYear() === currentYear && d.getMonth() >= 0 && d.getMonth() <= 5;
    });
  }

  if (filter === 'jul-dec') {
    return list.filter((entry) => {
      const d = new Date(entry.dateISO);
      return d.getFullYear() === currentYear && d.getMonth() >= 6 && d.getMonth() <= 11;
    });
  }

  return list;
}
