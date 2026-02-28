import { toDateKey } from './date';

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfWeek(date) {
  const d = startOfDay(date);
  const day = d.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  const shift = day === 0 ? 6 : day - 1; // Monday as start
  d.setDate(d.getDate() - shift);
  return d;
}

function endOfWeek(date) {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function startOfMonth(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfMonth(date) {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}

function entryTime(entry) {
  const dateInput = entry?.dateISO || entry?.actualLoggedAt || entry?.updatedAt || entry?.date;
  return new Date(dateInput).getTime();
}

export function getFilteredData(entries, filter) {
  const list = Array.isArray(entries) ? entries : [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const todayKey = toDateKey(now);

  if (filter === 'day') {
    return list.filter((entry) => entry.date === todayKey);
  }

  if (filter === 'week') {
    const start = startOfWeek(now).getTime();
    const end = endOfWeek(now).getTime();
    return list.filter((entry) => {
      const ts = entryTime(entry);
      return ts >= start && ts <= end;
    });
  }

  if (filter === 'month') {
    const start = startOfMonth(now).getTime();
    const end = endOfMonth(now).getTime();
    return list.filter((entry) => {
      const ts = entryTime(entry);
      return ts >= start && ts <= end;
    });
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
