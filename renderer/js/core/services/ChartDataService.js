import { parseHebrewDate, parseTimeOnDate } from "../utils/dateParse.js";
import { computeLogsPay, findEmployerForLog } from "../utils/employerRates.js";

const MAX_MONTHS = 12;

function monthKeyOf(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

/**
 * Data for the charts tab. Pay uses the same rules as the reports screen: hourly logs at
 * the rate in effect on their date, units x unit price, and a fixed-price project's price
 * in the month the project was created.
 */
export class ChartDataService {
  /**
   * Pay and hours per month per employer, for the last months that have logs (up to 12,
   * ending this month). Employers come in the order of the given list (stable colors).
   */
  monthlyIncome(logs, employers, projects, referenceDate = new Date()) {
    const projectsById = new Map(projects.map((project) => [project.id, project]));
    const payContext = { employers, projectsById };

    let first = null;
    logs.forEach((log) => {
      const parsed = parseHebrewDate(log.date);
      if (parsed && (!first || parsed.date < first)) {
        first = parsed.date;
      }
    });

    const months = [];
    const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    let cursor = first ? new Date(first.getFullYear(), first.getMonth(), 1) : end;
    while (cursor <= end) {
      months.push(monthKeyOf(cursor.getFullYear(), cursor.getMonth()));
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    const shownMonths = months.slice(-MAX_MONTHS);
    const shown = new Set(shownMonths);

    const cells = new Map(); // `${month}|${employerId}` -> { logs, pay, ms }
    const cell = (month, employerId) => {
      const key = `${month}|${employerId}`;
      if (!cells.has(key)) {
        cells.set(key, { logs: [], pay: 0, ms: 0 });
      }
      return cells.get(key);
    };

    logs.forEach((log) => {
      const parsed = parseHebrewDate(log.date);
      const employer = findEmployerForLog(log, employers);
      if (!parsed || !employer) {
        return;
      }
      const month = monthKeyOf(parsed.year, parsed.month - 1);
      if (shown.has(month)) {
        const entry = cell(month, employer.id);
        entry.logs.push(log);
        entry.ms += log.durationMs || 0;
      }
    });

    cells.forEach((entry) => {
      entry.pay = computeLogsPay(entry.logs, payContext).total;
    });

    const activeIds = new Set(employers.map((employer) => employer.id));
    projects.forEach((project) => {
      if (
        project.billingType !== "fixed" ||
        project.deletedAt ||
        !activeIds.has(project.employerId) ||
        project.fixedPrice === null ||
        project.fixedPrice === undefined
      ) {
        return;
      }
      const created = project.createdAt ? new Date(project.createdAt) : null;
      if (!created || Number.isNaN(created.getTime())) {
        return;
      }
      const month = monthKeyOf(created.getFullYear(), created.getMonth());
      if (shown.has(month)) {
        cell(month, project.employerId).pay += project.fixedPrice;
      }
    });

    const rows = shownMonths.map((month) => ({
      month,
      byEmployer: employers.map((employer) => {
        const entry = cells.get(`${month}|${employer.id}`);
        return { employerId: employer.id, pay: entry?.pay || 0, hours: (entry?.ms || 0) / 3600000 };
      })
    }));

    const usedEmployers = employers.filter((employer, index) =>
      rows.some((row) => row.byEmployer[index].pay > 0 || row.byEmployer[index].hours > 0)
    );

    return { months: rows, employers: usedEmployers };
  }

  /** Month keys ("yyyy-mm") that have logs, newest first. */
  monthsWithLogs(logs) {
    const keys = new Set();
    logs.forEach((log) => {
      const parsed = parseHebrewDate(log.date);
      if (parsed) {
        keys.add(monthKeyOf(parsed.year, parsed.month - 1));
      }
    });
    return [...keys].sort().reverse();
  }

  /**
   * Cumulative hours per day of a month against the target pace (hoursPerDay on each
   * Sunday-Thursday, like the monthly goal in reports). The current month stops at today.
   */
  monthProgress(logs, monthKey, hoursPerDay, referenceDate = new Date()) {
    const [year, month] = monthKey.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const isCurrent = year === referenceDate.getFullYear() && month === referenceDate.getMonth() + 1;
    const lastDay = isCurrent ? referenceDate.getDate() : daysInMonth;

    const hoursByDay = new Map();
    logs.forEach((log) => {
      const parsed = parseHebrewDate(log.date);
      if (parsed && parsed.year === year && parsed.month === month) {
        hoursByDay.set(parsed.day, (hoursByDay.get(parsed.day) || 0) + (log.durationMs || 0) / 3600000);
      }
    });

    const days = [];
    let actual = 0;
    let target = 0;
    for (let day = 1; day <= daysInMonth; day += 1) {
      if (new Date(year, month - 1, day).getDay() <= 4) {
        target += hoursPerDay;
      }
      const hours = hoursByDay.get(day) || 0;
      if (day <= lastDay) {
        actual += hours;
      }
      days.push({ day, hours, actual: day <= lastDay ? actual : null, target });
    }

    return { year, month, daysInMonth, lastDay, isCurrent, days, monthTarget: target };
  }

  /** Hours per weekday (0 = Sunday) x hour of day, over all logs. Sessions are split across hours. */
  weeklyHeatmap(logs) {
    const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
    logs.forEach((log) => {
      const start = parseTimeOnDate(log.date, String(log.start || ""));
      let remainingMs = log.durationMs || 0;
      if (!start || remainingMs <= 0) {
        return;
      }
      let cursor = start;
      while (remainingMs > 0) {
        const nextHour = new Date(cursor);
        nextHour.setMinutes(60, 0, 0);
        const chunk = Math.min(remainingMs, nextHour - cursor);
        grid[cursor.getDay()][cursor.getHours()] += chunk / 3600000;
        remainingMs -= chunk;
        cursor = nextHour;
      }
    });
    return grid;
  }
}
