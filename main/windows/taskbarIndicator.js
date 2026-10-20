const path = require("path");
const { nativeImage } = require("electron");
const { getMainWindow } = require("./MainWindow");

// Taskbar integration for the main window:
// - While the timer is running, a green dot blinks in the corner of the taskbar icon.
//   Paused or stopped: no dot. An overlay is used rather than swapping the window icon,
//   because Windows shows the installed shortcut's icon and ignores window icon changes.
// - A "stop" button in the taskbar hover preview. Clicking it asks the renderer to stop
//   (or just shows the window when no session is open). It is set once and always enabled:
//   updating thumbar buttons after the first set is unreliable on Windows.
const BLINK_INTERVAL_MS = 1000;

const assetPath = (name) => path.join(__dirname, "../assets", name);
const runningBadge = nativeImage.createFromPath(assetPath("timer-running.png"));
const stopIcon = nativeImage.createFromPath(assetPath("stop.png"));

let blinkTimer = null;
let badgeVisible = false;
let stopButtonAdded = false;

function getWindow() {
  const win = getMainWindow();
  return win && !win.isDestroyed() ? win : null;
}

function setBadge(visible) {
  const win = getWindow();
  if (!win) {
    return;
  }
  badgeVisible = visible;
  win.setOverlayIcon(visible ? runningBadge : null, visible ? "הטיימר פועל" : "");
}

function setTimerRunning(running) {
  if (running) {
    if (blinkTimer) {
      return;
    }
    console.log("Taskbar indicator: timer running, blinking badge");
    setBadge(true);
    blinkTimer = setInterval(() => setBadge(!badgeVisible), BLINK_INTERVAL_MS);
    return;
  }

  if (blinkTimer) {
    console.log("Taskbar indicator: timer stopped/paused, badge off");
    clearInterval(blinkTimer);
    blinkTimer = null;
  }
  setBadge(false);
}

function addStopButton() {
  const win = getWindow();
  if (!win || stopButtonAdded) {
    return;
  }
  stopButtonAdded = win.setThumbarButtons([
    {
      tooltip: "סיום עבודה",
      icon: stopIcon,
      click: () => {
        console.log("Taskbar indicator: stop clicked");
        getWindow()?.webContents.send("taskbar:stop");
      }
    }
  ]);
  console.log("Taskbar indicator: stop button added =", stopButtonAdded);
}

function updateFromTimerState(state) {
  addStopButton();
  setTimerRunning(Boolean(state && state.isRunning && !state.isPaused));
}

module.exports = { updateFromTimerState };
