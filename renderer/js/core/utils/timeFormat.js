export function formatTime(date) {
  return date.toLocaleTimeString("he-IL", { hour12: false });
}

export function formatDuration(ms) {
  const sec = Math.floor(ms / 1000);
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function parseDurationToMs(str) {
  const parts = str.split(":").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return 0;
  }

  return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
}
