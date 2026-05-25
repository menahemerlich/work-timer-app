import { formatDuration } from "../utils/timeFormat.js";
import { isInCurrentMonth, isToday, parseHebrewDate } from "../utils/dateParse.js";
import { UNKNOWN_EMPLOYER } from "../../../../shared/constants/storageKeys.js";

export class ReportSummaryService {
  filterLogs(logs, { employerFilter = "all", dateFrom = null, dateTo = null } = {}) {
    return logs.filter((log) => {
      if (employerFilter !== "all") {
        if (employerFilter === UNKNOWN_EMPLOYER) {
          if (log.employerName !== UNKNOWN_EMPLOYER) {
            return false;
          }
        } else if (log.employerId !== employerFilter && log.employerName !== employerFilter) {
          const employerNameMatch = log.employerName === employerFilter;
          if (!employerNameMatch) {
            return false;
          }
        }
      }

      const parsed = parseHebrewDate(log.date);
      if (!parsed) {
        return false;
      }

      if (dateFrom) {
        const from = new Date(dateFrom);
        from.setHours(0, 0, 0, 0);
        if (parsed.date < from) {
          return false;
        }
      }

      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (parsed.date > to) {
          return false;
        }
      }

      return true;
    });
  }

  getTotalDurationMs(logs) {
    return logs.reduce((sum, log) => sum + (log.durationMs || 0), 0);
  }

  getMonthlySummary(logs, referenceDate = new Date()) {
    const monthLogs = logs.filter((log) => isInCurrentMonth(log.date, referenceDate));
    return this.getSummaryByEmployer(monthLogs);
  }

  getSummaryByEmployer(logs) {
    const byEmployer = new Map();

    logs.forEach((log) => {
      const key = log.employerName || UNKNOWN_EMPLOYER;
      if (!byEmployer.has(key)) {
        byEmployer.set(key, { employerName: key, totalMs: 0, dates: new Set() });
      }

      const entry = byEmployer.get(key);
      entry.totalMs += log.durationMs || 0;
      entry.dates.add(log.date);
    });

    const rows = Array.from(byEmployer.values()).map((entry) => ({
      employerName: entry.employerName,
      workDays: entry.dates.size,
      totalMs: entry.totalMs,
      totalStr: formatDuration(entry.totalMs)
    }));

    const overallDays = new Set(logs.map((log) => log.date)).size;
    const overallMs = this.getTotalDurationMs(logs);

    return {
      rows,
      overall: {
        workDays: overallDays,
        totalMs: overallMs,
        totalStr: formatDuration(overallMs)
      }
    };
  }

  getTodayLogs(logs, referenceDate = new Date()) {
    const today = referenceDate.toLocaleDateString("he-IL");
    return logs.filter((log) => isToday(log.date, referenceDate) || log.date === today);
  }

  getCurrentMonthLogs(logs, referenceDate = new Date()) {
    return logs.filter((log) => isInCurrentMonth(log.date, referenceDate));
  }

  getEmployerFilterOptions(logs, activeEmployers) {
    const names = new Set();
    activeEmployers.forEach((employer) => names.add(employer.name));

    logs.forEach((log) => {
      if (log.employerName) {
        names.add(log.employerName);
      }
    });

    return Array.from(names).sort((a, b) => a.localeCompare(b, "he"));
  }
}
