import { STORAGE_KEYS, TIMER_COMMANDS } from "../../shared/constants/storageKeys.js";

function format(ms) {
  const sec = Math.floor(ms / 1000);
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function update() {
  const raw = localStorage.getItem(STORAGE_KEYS.TIMER_STATE);
  const state = raw ? JSON.parse(raw) : null;

  const timeEl = document.getElementById("time");
  const employerEl = document.getElementById("employer");
  const toggleBtn = document.getElementById("toggleBtn");

  if (!state || !state.isRunning) {
    timeEl.textContent = "00:00:00";
    employerEl.textContent = "";
    toggleBtn.style.display = "none";
    return;
  }

  timeEl.textContent = format(state.elapsedMs || 0);
  employerEl.textContent = state.employerName ? state.employerName : "";

  const hasTime = (state.elapsedMs || 0) > 0;
  toggleBtn.style.display = hasTime ? "inline-block" : "none";
  toggleBtn.textContent = state.isPaused ? "▶ המשך" : "⏸ השהיה";
}

setInterval(update, 500);
update();

document.getElementById("toggleBtn").addEventListener("click", () => {
  localStorage.setItem(STORAGE_KEYS.TIMER_COMMAND, TIMER_COMMANDS.TOGGLE);
});
