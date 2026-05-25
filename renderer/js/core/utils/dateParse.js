export function parseHebrewDate(dateStr) {
  const [day, month, year] = dateStr.split(".").map(Number);
  if (!day || !month || !year) {
    return null;
  }

  return { day, month, year, date: new Date(year, month - 1, day) };
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
