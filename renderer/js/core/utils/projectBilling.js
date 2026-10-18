import { formatDuration } from "./timeFormat.js";
import { compareHebrewDatesDesc } from "./dateParse.js";

const DEFAULT_UNIT_NAME = "יחידות";

export function formatMoney(n) {
  return `₪${Number(n || 0).toLocaleString("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

/** "3 תיקים"-style label. The unit name is entered in plural by the user (e.g. "תיקים"). */
export function formatUnits(count, unitName) {
  const name = unitName || DEFAULT_UNIT_NAME;
  return `${count || 0} ${name}`;
}

/** Total tracked ms per projectId, over all given logs. */
export function sumMsByProject(logs) {
  const totals = new Map();
  logs.forEach((log) => {
    if (!log.projectId) {
      return;
    }
    totals.set(log.projectId, (totals.get(log.projectId) || 0) + (log.durationMs || 0));
  });
  return totals;
}

/** Total unit count per projectId, over all given logs. */
export function sumUnitsByProject(logs) {
  const totals = new Map();
  logs.forEach((log) => {
    if (!log.projectId || !log.unitCount) {
      return;
    }
    totals.set(log.projectId, (totals.get(log.projectId) || 0) + log.unitCount);
  });
  return totals;
}

// Below this the per-hour figure is meaningless (e.g. ₪300 over 2 seconds).
const MIN_MS_FOR_RATE = 60000;

/** Money per hour actually earned for a given amount and time, or null when it can't be computed. */
export function effectiveHourlyRate(amount, totalMs) {
  if (amount === null || amount === undefined || !totalMs || totalMs < MIN_MS_FOR_RATE) {
    return null;
  }
  return amount / (totalMs / 3600000);
}

/** A fixed-price project's price is income of the month the project was created in. */
export function isCreatedInMonth(project, referenceDate = new Date()) {
  const created = project?.createdAt ? new Date(project.createdAt) : null;
  if (!created || Number.isNaN(created.getTime())) {
    return false;
  }
  return (
    created.getFullYear() === referenceDate.getFullYear() &&
    created.getMonth() === referenceDate.getMonth()
  );
}

/**
 * Active fixed-price projects with a price whose income belongs to the given month.
 * Projects whose employer was deleted are skipped (activeEmployerIds = ids of existing employers).
 */
export function getFixedProjectsIncomeForMonth(projects, referenceDate = new Date(), activeEmployerIds = null) {
  return (projects || []).filter(
    (project) =>
      project.billingType === "fixed" &&
      !project.deletedAt &&
      (!activeEmployerIds || activeEmployerIds.has(project.employerId)) &&
      project.fixedPrice !== null &&
      project.fixedPrice !== undefined &&
      isCreatedInMonth(project, referenceDate)
  );
}

/** Same as getFixedProjectsIncomeForMonth, for projects created on one "d.m.yyyy" day. */
export function getFixedProjectsIncomeForDate(projects, dateStr, activeEmployerIds = null) {
  return (projects || []).filter((project) => {
    if (
      project.billingType !== "fixed" ||
      project.deletedAt ||
      (activeEmployerIds && !activeEmployerIds.has(project.employerId)) ||
      project.fixedPrice === null ||
      project.fixedPrice === undefined
    ) {
      return false;
    }
    const created = project.createdAt ? new Date(project.createdAt) : null;
    return Boolean(created) && !Number.isNaN(created.getTime()) && created.toLocaleDateString("he-IL") === dateStr;
  });
}

/**
 * Per-unit income of the given logs (they should already be limited to one month):
 * count × the project's current unit price.
 */
export function sumUnitIncome(logs, projectsById) {
  return logs.reduce((sum, log) => {
    const project = projectsById.get(log.projectId);
    if (project?.billingType !== "unit" || project.unitPrice === null || project.unitPrice === undefined) {
      return sum;
    }
    return sum + (log.unitCount || 0) * project.unitPrice;
  }, 0);
}

export function describeProjectStats(project, totalMs, totalUnits = 0) {
  const parts = [`זמן מצטבר: ${formatDuration(totalMs || 0)}`];

  if (project.isFixed) {
    if (project.fixedPrice === null) {
      parts.push("לא הוגדר מחיר");
    } else {
      parts.push(`מחיר: ${formatMoney(project.fixedPrice)}`);
      const rate = effectiveHourlyRate(project.fixedPrice, totalMs);
      if (rate !== null) {
        parts.push(`יוצא ${formatMoney(rate)} לשעה`);
      }
    }
    parts.push("לא נספר בשכר לפי שעה");
  }

  if (project.isUnit) {
    parts.push(formatUnits(totalUnits, project.unitName));
    if (project.unitPrice === null) {
      parts.push("לא הוגדר מחיר ליחידה");
    } else {
      const amount = totalUnits * project.unitPrice;
      parts.push(`סה"כ ${formatMoney(amount)}`);
      const rate = effectiveHourlyRate(amount, totalMs);
      if (rate !== null) {
        parts.push(`יוצא ${formatMoney(rate)} לשעה`);
      }
    }
  }

  return parts.join(" · ");
}

/**
 * Where a per-unit project stands: units finished so far (over all logs) and whether the
 * most recent session ended with a unit still in progress.
 */
export function getUnitProgress(logs, projectId) {
  const projectLogs = (logs || []).filter((log) => log.projectId === projectId);
  const finished = projectLogs.reduce((sum, log) => sum + (log.unitCount || 0), 0);
  const lastLog =
    projectLogs.sort(
      (a, b) => compareHebrewDatesDesc(a.date, b.date) || String(b.start).localeCompare(String(a.start))
    )[0] || null;
  return { finished, lastLog, lastOpen: Boolean(lastLog?.unitOpen) };
}
