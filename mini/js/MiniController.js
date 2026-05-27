import { TIMER_COMMANDS } from "../../shared/constants/storageKeys.js";

function format(ms) {
  const sec = Math.floor(ms / 1000);
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function getElapsedMs(state) {
  if (!state) {
    return 0;
  }

  let ms = state.elapsedMs || 0;
  if (state.isRunning && !state.isPaused && state.segmentStartTime) {
    ms += Date.now() - new Date(state.segmentStartTime).getTime();
  }
  return ms;
}

async function update() {
  const api = window.electronAPI?.db?.timer;
  const state = api ? await api.load() : null;

  const timeEl = document.getElementById("time");
  const employerEl = document.getElementById("employer");
  const toggleBtn = document.getElementById("toggleBtn");

  if (!state || !state.isRunning) {
    timeEl.textContent = "00:00:00";
    employerEl.textContent = "";
    toggleBtn.style.display = "none";
    return;
  }

  timeEl.textContent = format(getElapsedMs(state));
  employerEl.textContent = state.employerName ? state.employerName : "";

  const hasTime = (state.elapsedMs || 0) > 0;
  toggleBtn.style.display = hasTime ? "inline-block" : "none";
  toggleBtn.textContent = state.isPaused ? "▶ המשך" : "⏸ השהיה";
}

setInterval(update, 500);
update();

document.getElementById("toggleBtn").addEventListener("click", () => {
  window.electronAPI?.db?.timer?.setCommand(TIMER_COMMANDS.TOGGLE);
});

if (window.electronAPI?.db?.timer?.onCommand) {
  window.electronAPI.db.timer.onCommand(() => update());
}
