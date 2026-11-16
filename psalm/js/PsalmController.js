const params = new URLSearchParams(window.location.search);
// A standby copy gets its settings from the main process when it is opened.
let mode = "reveal";
let gateMs = 10000;
let revealMs = 15000;

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const DONE_PAUSE_MS = 450;
const CLOSE_ANIMATION_MS = 320;

const ring = document.getElementById("ring");
const progressEl = document.getElementById("ringProgress");
const countEl = document.getElementById("ringCount");
const hintEl = document.getElementById("hint");
const cancelBtn = document.getElementById("cancelBtn");

progressEl.style.strokeDasharray = `${CIRCUMFERENCE}`;
progressEl.style.strokeDashoffset = "0";

let started = false;
let startedAt = null;
let lastShown = null;
let finished = false;

function start(config = {}) {
  if (started) {
    return;
  }
  started = true;
  mode = config.mode === "charts" ? "charts" : "reveal";
  gateMs = Number(config.gateMs) || gateMs;
  revealMs = Number(config.revealMs) || revealMs;

  hintEl.textContent =
    mode === "charts"
      ? "בסיום הטיימר ייפתח דף הגרפים, והוא יישאר גלוי עד שתצאו ממנו."
      : `בסיום הטיימר יוצגו כל הסכומים למשך ${Math.round(revealMs / 1000)} שניות.`;
  document.documentElement.classList.remove("standby");
  requestAnimationFrame(frame);
}

function close(send) {
  if (finished) {
    return;
  }
  finished = true;
  document.body.classList.add("closing");
  setTimeout(send, CLOSE_ANIMATION_MS);
}

function complete() {
  ring.classList.add("done");
  ring.setAttribute("aria-label", "הסתיים");
  setTimeout(() => close(() => window.electronAPI?.privacy?.gateComplete()), DONE_PAUSE_MS);
}

function frame(now) {
  if (finished) {
    return;
  }
  if (startedAt === null) {
    startedAt = now;
  }

  const remaining = Math.max(0, gateMs - (now - startedAt));
  // The ring starts full and shrinks as the seconds pass.
  progressEl.style.strokeDashoffset = `${CIRCUMFERENCE * (1 - remaining / gateMs)}`;

  const seconds = Math.ceil(remaining / 1000);
  if (seconds !== lastShown) {
    lastShown = seconds;
    countEl.textContent = String(seconds);
    ring.setAttribute("aria-label", `${seconds} שניות`);
    countEl.classList.remove("tick");
    void countEl.offsetWidth;
    countEl.classList.add("tick");
  }

  if (remaining <= 0) {
    complete();
    return;
  }
  requestAnimationFrame(frame);
}

cancelBtn.addEventListener("click", () => close(() => window.electronAPI?.privacy?.gateCancel()));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && started) {
    cancelBtn.click();
  }
});

if (params.has("standby")) {
  window.electronAPI?.privacy?.onGateStart((config) => start(config));
} else {
  start({
    mode: params.get("mode"),
    gateMs: params.get("gateMs"),
    revealMs: params.get("revealMs")
  });
}
