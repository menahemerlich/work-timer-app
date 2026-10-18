import { isInCurrentMonth } from "../../renderer/js/core/utils/dateParse.js";
import { UNKNOWN_EMPLOYER, TIMER_COMMANDS } from "../../shared/constants/storageKeys.js";
import {
  getFixedProjectsIncomeForMonth,
  sumUnitIncome
} from "../../renderer/js/core/utils/projectBilling.js";
import {
  computeLogsPay,
  findEmployerForLog,
  getRateForDate
} from "../../renderer/js/core/utils/employerRates.js";

function getLiveElapsedMs(state) {
  if (!state) {
    return 0;
  }

  let ms = state.elapsedMs || 0;
  if (state.isRunning && !state.isPaused && state.segmentStartTime) {
    ms += Date.now() - new Date(state.segmentStartTime).getTime();
  }
  return ms;
}

// Fixed-price and per-unit projects are not paid by the hour.
function buildNonHourlyProjectIds(projects) {
  return new Set(
    (projects || [])
      .filter((project) => project?.billingType === "fixed" || project?.billingType === "unit")
      .map((project) => project.id)
  );
}

function computeEarnings({ logs, employers, projects, timerState }) {
  const fixedProjectIds = buildNonHourlyProjectIds(projects);
  const projectsById = new Map((projects || []).map((project) => [project.id, project]));

  // Each hourly log is paid at the employer's rate in effect on its date.
  const hourlyLogs = logs.filter(
    (log) => isInCurrentMonth(log.date) && !fixedProjectIds.has(log.projectId)
  );

  const liveMs = getLiveElapsedMs(timerState);
  const isRunning = Boolean(timerState?.isRunning);
  const isLiveFixed = fixedProjectIds.has(timerState?.projectId);
  if (isRunning && liveMs > 0 && !isLiveFixed) {
    hourlyLogs.push({
      date: new Date().toLocaleDateString("he-IL"),
      durationMs: liveMs,
      employerId: timerState.employerId,
      employerName: timerState.employerName || UNKNOWN_EMPLOYER
    });
  }

  let total = computeLogsPay(hourlyLogs, { employers, projectsById }).hourly;
  let hasAnyRate = hourlyLogs.some((log) => {
    const rate = getRateForDate(findEmployerForLog(log, employers), log.date);
    return rate !== null && rate !== undefined;
  });

  // Fixed-price projects add their price in the month they were created.
  const activeEmployerIds = new Set((employers || []).map((employer) => employer.id));
  const incomeProjects = getFixedProjectsIncomeForMonth(projects, new Date(), activeEmployerIds);
  incomeProjects.forEach((project) => {
    total += project.fixedPrice;
  });

  // Per-unit projects: units of this month's logs plus the running session.
  const unitLogs = logs.filter((log) => isInCurrentMonth(log.date));
  if (isRunning && timerState?.projectId && timerState.unitCount) {
    unitLogs.push({ projectId: timerState.projectId, unitCount: timerState.unitCount });
  }
  const unitIncome = sumUnitIncome(unitLogs, projectsById);
  total += unitIncome;

  if (incomeProjects.length || unitIncome > 0) {
    hasAnyRate = true;
  }

  return { total, hasAnyRate, isRunning, isLiveFixed };
}

function formatMoney(n) {
  return `₪${Number(n || 0).toLocaleString("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

let lastAppliedCorner = null;

function applyCornerIfChanged(corner) {
  const next = corner || "top-left";
  if (next === lastAppliedCorner) {
    return;
  }
  lastAppliedCorner = next;
  window.electronAPI?.window?.setCorner(next);
}

async function update() {
  const db = window.electronAPI?.db;
  if (!db) {
    return;
  }

  const [logs, employers, projects, timerState, settings] = await Promise.all([
    db.logs.getAll(),
    db.employers.getAll(),
    db.projects?.getAll() ?? [],
    db.timer.load(),
    db.settings.get()
  ]);

  applyCornerIfChanged(settings?.earningsWindowCorner);

  const { total, hasAnyRate, isRunning, isLiveFixed } = computeEarnings({
    logs,
    employers,
    projects,
    timerState
  });

  const amountEl = document.getElementById("earnAmount");
  const subEl = document.getElementById("earnSub");

  if (!hasAnyRate) {
    amountEl.textContent = "—";
    subEl.classList.remove("live");
    subEl.textContent = "הגדירו תעריף לשעה";
    return;
  }

  amountEl.textContent = formatMoney(total);

  if (isRunning && isLiveFixed) {
    subEl.classList.remove("live");
    subEl.textContent = "פרויקט לפי עבודה";
  } else if (isRunning) {
    subEl.classList.add("live");
    subEl.textContent = "מתעדכן עכשיו";
  } else {
    subEl.classList.remove("live");
    subEl.textContent = "";
  }
}

document.getElementById("earnCloseBtn")?.addEventListener("click", () => {
  window.electronAPI?.window?.close();
});

if (window.electronAPI?.db?.timer?.onCommand) {
  window.electronAPI.db.timer.onCommand(() => update());
}

setInterval(update, 2000);
update();
