import {
  compareHebrewDatesDesc,
  getHebrewMonthLabel,
  getMonthKeyFromHebrewDate,
  isToday
} from "./dateParse.js";

export function groupLogsByDate(logs) {
  const byDate = new Map();

  logs.forEach((log) => {
    if (!byDate.has(log.date)) {
      byDate.set(log.date, []);
    }
    byDate.get(log.date).push(log);
  });

  return byDate;
}

export function buildLogsArchiveStructure(logs, referenceDate = new Date()) {
  const byDate = groupLogsByDate(logs);
  const todayStr = referenceDate.toLocaleDateString("he-IL");
  const todayLogs = byDate.get(todayStr) || [];
  byDate.delete(todayStr);

  const todayMonthKey = getMonthKeyFromHebrewDate(todayStr);
  const otherDates = Array.from(byDate.keys()).sort(compareHebrewDatesDesc);
  const byMonth = new Map();

  otherDates.forEach((dateStr) => {
    const monthKey = getMonthKeyFromHebrewDate(dateStr);
    if (!monthKey) {
      return;
    }

    if (!byMonth.has(monthKey)) {
      byMonth.set(monthKey, []);
    }

    byMonth.get(monthKey).push({
      dateStr,
      logs: byDate.get(dateStr)
    });
  });

  const archiveItems = [];
  const monthKeys = Array.from(byMonth.keys()).sort((a, b) => {
    const [yearA, monthA] = a.split("-").map(Number);
    const [yearB, monthB] = b.split("-").map(Number);
    return new Date(yearB, monthB - 1, 1) - new Date(yearA, monthA - 1, 1);
  });

  monthKeys.forEach((monthKey) => {
    const [year, month] = monthKey.split("-").map(Number);
    const days = byMonth.get(monthKey);

    if (monthKey === todayMonthKey) {
      days.forEach((day) => {
        archiveItems.push({ type: "day", ...day });
      });
      return;
    }

    archiveItems.push({
      type: "month",
      monthKey,
      monthLabel: getHebrewMonthLabel(month, year, referenceDate),
      days
    });
  });

  return {
    todayStr,
    todayLogs,
    archiveItems
  };
}

export { isToday };
