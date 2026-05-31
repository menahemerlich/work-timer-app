const path = require("path");
const { BrowserWindow, screen } = require("electron");
const { pickRandomReminderPhrase } = require("../data/reminderPhrases");

const HEIGHT = 120;
const EXIT_ANIMATION_MS = 680;
const FIRST_SHOW_DELAY_MS = 8 * 1000;

const DEFAULT_INTERVAL_MIN = 3;
const DEFAULT_DURATION_SEC = 15;
const DEFAULT_POSITION = "top";

let motivationWindow = null;
let getConfigFn = () => ({});
let cycleTimer = null;
let hideTimer = null;
let exitTimer = null;
let active = false;
let showing = false;

function resolveConfig() {
  let raw = {};
  try {
    raw = getConfigFn() || {};
  } catch (error) {
    console.error("Failed to read motivation config:", error);
  }

  const intervalMin = Number(raw.intervalMinutes);
  const durationSec = Number(raw.durationSeconds);
  const position = raw.position === "bottom" ? "bottom" : DEFAULT_POSITION;

  return {
    position,
    intervalMs:
      Number.isFinite(intervalMin) && intervalMin > 0
        ? intervalMin * 60 * 1000
        : DEFAULT_INTERVAL_MIN * 60 * 1000,
    durationMs:
      Number.isFinite(durationSec) && durationSec > 0
        ? durationSec * 1000
        : DEFAULT_DURATION_SEC * 1000
  };
}

function positionWindow(position) {
  if (!motivationWindow || motivationWindow.isDestroyed()) {
    return;
  }
  const workArea = screen.getPrimaryDisplay().workArea;
  motivationWindow.setBounds({
    x: workArea.x,
    y:
      position === "bottom"
        ? Math.round(workArea.y + workArea.height - HEIGHT - 24)
        : Math.round(workArea.y + 24),
    width: workArea.width,
    height: HEIGHT
  });
}

function createMotivationWindow() {
  const workArea = screen.getPrimaryDisplay().workArea;

  motivationWindow = new BrowserWindow({
    width: workArea.width,
    height: HEIGHT,
    x: workArea.x,
    y: Math.round(workArea.y + 24),
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    useContentSize: true,
    webPreferences: {
      preload: path.join(__dirname, "../../preload/preload.js"),
      backgroundThrottling: false
    }
  });

  motivationWindow.setAlwaysOnTop(true, "screen-saver");
  motivationWindow.setIgnoreMouseEvents(true);
  motivationWindow.loadFile(path.join(__dirname, "../../motivation/motivation.html"));

  motivationWindow.on("closed", () => {
    motivationWindow = null;
  });

  return motivationWindow;
}

function destroyMotivationWindow() {
  if (motivationWindow && !motivationWindow.isDestroyed()) {
    motivationWindow.destroy();
  }
  motivationWindow = null;
}

// Creates the window on demand, shows a phrase, then destroys the window so it
// does not keep a renderer process alive between appearances (saves memory).
function runCycle() {
  if (!active) {
    return;
  }

  const config = resolveConfig();
  showing = true;

  const win = createMotivationWindow();
  const phrase = pickRandomReminderPhrase();

  const present = () => {
    if (!win || win.isDestroyed()) {
      showing = false;
      return;
    }

    positionWindow(config.position);
    win.webContents.send("motivation:show", { phrase, position: config.position });
    win.showInactive();

    hideTimer = setTimeout(() => {
      if (win && !win.isDestroyed()) {
        win.webContents.send("motivation:hide");
      }
      exitTimer = setTimeout(() => {
        destroyMotivationWindow();
        showing = false;
        if (active) {
          cycleTimer = setTimeout(runCycle, config.intervalMs);
        }
      }, EXIT_ANIMATION_MS);
    }, config.durationMs);
  };

  if (win.webContents.isLoading()) {
    win.webContents.once("did-finish-load", present);
  } else {
    present();
  }
}

function startMotivationSchedule(getConfig) {
  if (typeof getConfig === "function") {
    getConfigFn = getConfig;
  }
  active = true;
  clearTimeout(cycleTimer);
  cycleTimer = setTimeout(runCycle, FIRST_SHOW_DELAY_MS);
}

function restartMotivationSchedule() {
  if (!active || showing) {
    return;
  }
  const config = resolveConfig();
  clearTimeout(cycleTimer);
  cycleTimer = setTimeout(runCycle, config.intervalMs);
}

function stopMotivationSchedule() {
  active = false;
  showing = false;
  clearTimeout(cycleTimer);
  clearTimeout(hideTimer);
  clearTimeout(exitTimer);
  cycleTimer = null;
}

function closeMotivationWindow() {
  stopMotivationSchedule();
  destroyMotivationWindow();
}

module.exports = {
  startMotivationSchedule,
  restartMotivationSchedule,
  stopMotivationSchedule,
  closeMotivationWindow
};
