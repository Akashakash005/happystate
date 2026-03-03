function startOfDay(dateInput) {
  const d = new Date(dateInput);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(dateInput) {
  const d = new Date(dateInput);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfWeekMonday(dateInput) {
  const d = startOfDay(dateInput);
  const day = d.getDay();
  const shift = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - shift);
  return d;
}

function endOfWeekSunday(dateInput) {
  const start = startOfWeekMonday(dateInput);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function startOfMonth(dateInput) {
  const d = new Date(dateInput);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfMonth(dateInput) {
  const d = new Date(dateInput);
  d.setMonth(d.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function getHalfYearRange(dateInput = new Date()) {
  const d = new Date(dateInput);
  const year = d.getFullYear();
  const month = d.getMonth();

  if (month < 6) {
    return {
      start: new Date(year, 0, 1, 0, 0, 0, 0),
      end: new Date(year, 5, 30, 23, 59, 59, 999),
      label: `Jan-Jun ${year}`,
    };
  }

  return {
    start: new Date(year, 6, 1, 0, 0, 0, 0),
    end: new Date(year, 11, 31, 23, 59, 59, 999),
    label: `Jul-Dec ${year}`,
  };
}

export function getDateRange(filter, referenceDate = new Date(), customRange = null) {
  const ref = new Date(referenceDate);

  if (filter === "day") {
    return { start: startOfDay(ref), end: endOfDay(ref) };
  }

  if (filter === "week") {
    return { start: startOfWeekMonday(ref), end: endOfWeekSunday(ref) };
  }

  if (filter === "month") {
    return { start: startOfMonth(ref), end: endOfMonth(ref) };
  }

  if (filter === "halfyear") {
    const half = getHalfYearRange(ref);
    return { start: half.start, end: half.end };
  }

  if (filter === "custom") {
    const rawStart = customRange?.startDate
      ? startOfDay(customRange.startDate)
      : startOfDay(ref);
    const rawEnd = customRange?.endDate
      ? endOfDay(customRange.endDate)
      : endOfDay(ref);
    const minTs = Math.min(rawStart.getTime(), rawEnd.getTime());
    const maxTs = Math.max(rawStart.getTime(), rawEnd.getTime());
    return { start: new Date(minTs), end: new Date(maxTs) };
  }

  return { start: startOfDay(ref), end: endOfDay(ref) };
}

function entryTime(entry) {
  const value =
    entry?.dateISO || entry?.actualLoggedAt || entry?.updatedAt || entry?.date;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? NaN : ts;
}

export function filterEntriesByRange(entries, range) {
  const list = Array.isArray(entries) ? entries : [];
  if (!range?.start || !range?.end) return list;
  const startTs = range.start.getTime();
  const endTs = range.end.getTime();

  return list.filter((entry) => {
    const ts = entryTime(entry);
    return !Number.isNaN(ts) && ts >= startTs && ts <= endTs;
  });
}

export function shiftReferenceDate(referenceDate, filter, direction) {
  const step = direction >= 0 ? 1 : -1;
  const d = new Date(referenceDate);

  if (filter === "day") {
    d.setDate(d.getDate() + step);
    return d;
  }

  if (filter === "week") {
    d.setDate(d.getDate() + step * 7);
    return d;
  }

  if (filter === "month") {
    d.setMonth(d.getMonth() + step);
    return d;
  }

  if (filter === "halfyear") {
    d.setMonth(d.getMonth() + step * 6);
    return d;
  }

  return d;
}

export function formatRangeLabel(filter, range, referenceDate = new Date()) {
  if (!range?.start || !range?.end) return "";

  if (filter === "day") {
    return range.start.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  if (filter === "week" || filter === "custom") {
    const start = range.start.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const end = range.end.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${start} - ${end}`;
  }

  if (filter === "month") {
    return range.start.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  }

  if (filter === "halfyear") {
    return getHalfYearRange(referenceDate).label;
  }

  return "";
}
