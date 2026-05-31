import { isInCurrentMonth } from "../../renderer/js/core/utils/dateParse.js";
import { UNKNOWN_EMPLOYER, TIMER_COMMANDS } from "../../shared/constants/storageKeys.js";

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

function buildRateMap(employers) {
  const map = new Map();
  employers.forEach((employer) => {
    if (employer?.name != null) {
      map.set(employer.name, employer.hourlyRate ?? null);
    }
  });
  return map;
}

function accumulateMonthHours(logs) {
  const byEmployer = new Map();
  logs.forEach((log) => {
    if (!isInCurrentMonth(log.date)) {
      return;
    }
    const key = log.employerName || UNKNOWN_EMPLOYER;
    byEmployer.set(key, (byEmployer.get(key) || 0) + (log.durationMs || 0));
  });
  return byEmployer;
}

function computeEarnings({ logs, employers, timerState }) {
  const rates = buildRateMap(employers);
  const msByEmployer = accumulateMonthHours(logs);

  const liveMs = getLiveElapsedMs(timerState);
  const isRunning = Boolean(timerState?.isRunning);
  if (isRunning && liveMs > 0) {
    const key = timerState.employerName || UNKNOWN_EMPLOYER;
    msByEmployer.set(key, (msByEmployer.get(key) || 0) + liveMs);
  }

  let total = 0;
  let hasAnyRate = false;
  msByEmployer.forEach((ms, name) => {
    const rate = rates.get(name);
    if (rate !== null && rate !== undefined) {
      hasAnyRate = true;
      total += (ms / 3600000) * rate;
    }
  });

  return { total, hasAnyRate, isRunning };
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

  const [logs, employers, timerState, settings] = await Promise.all([
    db.logs.getAll(),
    db.employers.getAll(),
    db.timer.load(),
    db.settings.get()
  ]);

  applyCornerIfChanged(settings?.earningsWindowCorner);

  const { total, hasAnyRate, isRunning } = computeEarnings({ logs, employers, timerState });

  const amountEl = document.getElementById("earnAmount");
  const subEl = document.getElementById("earnSub");

  if (!hasAnyRate) {
    amountEl.textContent = "—";
    subEl.classList.remove("live");
    subEl.textContent = "הגדירו תעריף לשעה";
    return;
  }

  amountEl.textContent = formatMoney(total);

  if (isRunning) {
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
