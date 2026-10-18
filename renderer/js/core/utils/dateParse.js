/**
 * Parses "d.m.yyyy". Also accepts "/" or "-" separators, "yyyy-mm-dd", and stray
 * invisible characters (e.g. RTL marks), so logs saved in another format still show.
 */
export function parseHebrewDate(dateStr) {
  const parts = String(dateStr ?? "")
    .replace(/[^\d./-]/g, "")
    .split(/[./-]/)
    .filter(Boolean)
    .map(Number);
  if (parts.length !== 3) {
    return null;
  }

  const [day, month, year] = parts[0] > 999 ? [parts[2], parts[1], parts[0]] : parts;
  if (!day || !month || !year || month > 12 || day > 31) {
    return null;
  }

  return { day, month, year, date: new Date(year, month - 1, day) };
}

/** The canonical "d.m.yyyy" form of a date string, or the input when it can't be parsed. */
export function normalizeHebrewDate(dateStr) {
  const parsed = parseHebrewDate(dateStr);
  return parsed ? `${parsed.day}.${parsed.month}.${parsed.year}` : dateStr;
}

export function isInCurrentMonth(dateStr, referenceDate = new Date()) {
  const parsed = parseHebrewDate(dateStr);
  if (!parsed) {
    return false;
  }

  return (
    parsed.month - 1 === referenceDate.getMonth() &&
    parsed.year === referenceDate.getFullYear()
  );
}

export function isToday(dateStr, referenceDate = new Date()) {
  return dateStr === referenceDate.toLocaleDateString("he-IL");
}

export function compareHebrewDatesDesc(a, b) {
  const parsedA = parseHebrewDate(a);
  const parsedB = parseHebrewDate(b);
  if (!parsedA && !parsedB) {
    return 0;
  }
  if (!parsedA) {
    return 1;
  }
  if (!parsedB) {
    return -1;
  }
  return parsedB.date - parsedA.date;
}

const HEBREW_MONTH_NAMES = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר"
];

export function getHebrewMonthLabel(month, year, referenceDate = new Date()) {
  const name = HEBREW_MONTH_NAMES[month - 1] || "";
  if (year !== referenceDate.getFullYear()) {
    return `${name} ${year}`;
  }
  return name;
}

export function getMonthKeyFromHebrewDate(dateStr) {
  const parsed = parseHebrewDate(dateStr);
  if (!parsed) {
    return null;
  }
  return `${parsed.year}-${parsed.month}`;
}

export function parseTimeOnDate(dateStr, timeStr) {
  const parsed = parseHebrewDate(dateStr);
  if (!parsed) {
    return null;
  }

  const [hours, minutes, seconds = 0] = timeStr.split(":").map(Number);
  if ([hours, minutes, seconds].some(Number.isNaN)) {
    return null;
  }

  const date = new Date(parsed.year, parsed.month - 1, parsed.day, hours, minutes, seconds);
  return date;
}

export function formatDateInputValue(dateStr) {
  const parsed = parseHebrewDate(dateStr);
  if (!parsed) {
    return "";
  }

  return `${String(parsed.year).padStart(4, "0")}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`;
}

export function formatHebrewDateFromInput(inputValue) {
  const [year, month, day] = inputValue.split("-").map(Number);
  if (!year || !month || !day) {
    return "";
  }

  return `${day}.${month}.${year}`;
}
