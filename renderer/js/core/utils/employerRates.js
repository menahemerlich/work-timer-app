import { formatDateInputValue } from "./dateParse.js";

/** Raises sorted by start date; invalid entries are dropped. from is "YYYY-MM-DD". */
export function normalizeRateChanges(list) {
  return (Array.isArray(list) ? list : [])
    .map((item) => ({ rate: Number(item?.rate), from: String(item?.from || "") }))
    .filter((item) => Number.isFinite(item.rate) && item.rate >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(item.from))
    .sort((a, b) => a.from.localeCompare(b.from));
}

export function todayIsoDate(referenceDate = new Date()) {
  return formatDateInputValue(referenceDate.toLocaleDateString("he-IL"));
}

/**
 * Index of the raise in effect on the given ISO date, or -1 when the base rate applies.
 */
export function getRateChangeIndexForIso(employer, isoDate) {
  const changes = normalizeRateChanges(employer?.rateChanges);
  let index = -1;
  changes.forEach((change, i) => {
    if (change.from <= isoDate) {
      index = i;
    }
  });
  return index;
}

/** Hourly rate in effect on a "d.m.yyyy" log date (null when no rate is set). */
export function getRateForDate(employer, dateStr) {
  if (!employer) {
    return null;
  }
  const isoDate = formatDateInputValue(dateStr);
  const changes = normalizeRateChanges(employer.rateChanges);
  const index = isoDate ? getRateChangeIndexForIso(employer, isoDate) : -1;
  return index >= 0 ? changes[index].rate : employer.hourlyRate ?? null;
}

export function getCurrentRate(employer, referenceDate = new Date()) {
  return getRateForDate(employer, referenceDate.toLocaleDateString("he-IL"));
}

/** Finds the employer of a log by id, falling back to its saved name. */
export function findEmployerForLog(log, employers) {
  return (
    employers.find((employer) => log.employerId && employer.id === log.employerId) ||
    employers.find((employer) => employer.name === log.employerName) ||
    null
  );
}

/**
 * Pay earned by the given logs: hourly logs at the rate in effect on each log's date, plus
 * units × unit price for per-unit projects. Fixed-price project time adds nothing here.
 */
export function computeLogsPay(logs, { employers = [], projectsById = new Map() } = {}) {
  let hourly = 0;
  let units = 0;
  (logs || []).forEach((log) => {
    const project = log.projectId ? projectsById.get(log.projectId) : null;
    if (project?.billingType === "fixed") {
      return;
    }
    if (project?.billingType === "unit") {
      if (project.unitPrice !== null && project.unitPrice !== undefined) {
        units += (log.unitCount || 0) * project.unitPrice;
      }
      return;
    }
    const rate = getRateForDate(findEmployerForLog(log, employers), log.date);
    if (rate !== null && rate !== undefined) {
      hourly += ((log.durationMs || 0) / 3600000) * rate;
    }
  });
  return { hourly, units, total: hourly + units };
}
