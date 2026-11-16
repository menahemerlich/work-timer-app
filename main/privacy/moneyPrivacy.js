const path = require("path");
const { app, BrowserWindow, ipcMain, screen } = require("electron");

// Amounts are hidden everywhere until the user reads "Mizmor LeToda" for GATE_MS.
// Then every window shows amounts for REVEAL_MS ("reveal" mode), or the charts
// page stays open until the user leaves it ("charts" mode).
const GATE_MS = 10 * 1000;
const REVEAL_MS = 15 * 1000;
// The gate window reports completion itself; allow a little clock slack.
const GATE_TOLERANCE_MS = 750;
const MODES = new Set(["reveal", "charts"]);

let revealedUntil = 0;
let hideTimer = null;
let gate = null; // { win, mode, requester: WebContents, openedAt, done }
let standby = null; // { win, ready } — hidden gate window waiting to be shown
let standbyTimer = null;
let shuttingDown = false;
const STANDBY_DELAY_MS = 1500;
// Give the app's own windows a head start before warming the gate up.
const FIRST_STANDBY_DELAY_MS = 5000;

function broadcast(channel, payload) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  });
}

function getState() {
  return { revealedUntil: Date.now() < revealedUntil ? revealedUntil : 0 };
}

function setRevealedUntil(until) {
  revealedUntil = until;
  clearTimeout(hideTimer);
  hideTimer = null;
  if (until > Date.now()) {
    hideTimer = setTimeout(() => setRevealedUntil(0), until - Date.now());
  }
  broadcast("privacy:state", getState());
}

function sendToRequester(channel, payload) {
  const requester = gate?.requester;
  if (requester && !requester.isDestroyed()) {
    requester.send(channel, payload);
  }
}

function closeGate({ completed }) {
  if (!gate) {
    return;
  }
  const current = gate;
  gate = null;
  if (!completed) {
    if (current.requester && !current.requester.isDestroyed()) {
      current.requester.send("privacy:gateCancelled", { mode: current.mode });
    }
  }
  if (current.win && !current.win.isDestroyed()) {
    current.win.destroy();
  }
  scheduleStandby();
}

// Starting a new window process can take several seconds, so a hidden, fully loaded gate
// window is kept ready ("standby") and only shown when the user asks for it.
function createGateWindow(bounds, query) {
  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../../preload/preload.js"),
      backgroundThrottling: false
    }
  });

  win.setAlwaysOnTop(true, "screen-saver");
  win.loadFile(path.join(__dirname, "../../psalm/psalm.html"), { query });
  // Closed some other way (Alt+F4): counts as cancel.
  win.on("closed", () => {
    if (gate?.win === win) {
      closeGate({ completed: false });
    }
    if (standby?.win === win) {
      standby = null;
    }
  });
  return win;
}

function prepareStandby() {
  clearTimeout(standbyTimer);
  standbyTimer = null;
  if (shuttingDown || (standby && !standby.win.isDestroyed())) {
    return;
  }
  const win = createGateWindow(screen.getPrimaryDisplay().workArea, { standby: "1" });
  standby = { win, ready: false };
  win.webContents.once("did-finish-load", () => {
    if (standby?.win === win) {
      standby.ready = true;
    }
  });
}

function scheduleStandby(delay = STANDBY_DELAY_MS) {
  if (!shuttingDown && !standbyTimer) {
    standbyTimer = setTimeout(prepareStandby, delay);
  }
}

function showGate(win) {
  if (!win.isDestroyed()) {
    win.show();
    win.focus();
  }
}

function openGate(mode, requester) {
  if (gate && gate.win && !gate.win.isDestroyed()) {
    showGate(gate.win);
    return;
  }

  const requesterWin = requester ? BrowserWindow.fromWebContents(requester) : null;
  const display =
    requesterWin && !requesterWin.isDestroyed()
      ? screen.getDisplayMatching(requesterWin.getBounds())
      : screen.getPrimaryDisplay();
  const config = { mode, gateMs: GATE_MS, revealMs: REVEAL_MS };

  let win;
  if (standby?.ready && !standby.win.isDestroyed()) {
    win = standby.win;
    standby = null;
    win.setBounds(display.workArea);
    win.webContents.send("privacy:gateStart", config);
    showGate(win);
  } else {
    // No standby ready yet (e.g. right after launch): open a fresh one that starts by itself.
    win = createGateWindow(display.workArea, {
      mode,
      gateMs: String(GATE_MS),
      revealMs: String(REVEAL_MS)
    });
    win.once("ready-to-show", () => showGate(win));
  }
  gate = { win, mode, requester, openedAt: Date.now(), done: false };
}

function isFromGate(event) {
  return Boolean(gate && gate.win && !gate.win.isDestroyed() && event.sender === gate.win.webContents);
}

function registerPrivacyHandlers() {
  app.whenReady().then(() => scheduleStandby(FIRST_STANDBY_DELAY_MS));
  ipcMain.handle("privacy:getState", () => getState());

  ipcMain.on("privacy:requestReveal", (event, mode) => {
    openGate(MODES.has(mode) ? mode : "reveal", event.sender);
  });

  ipcMain.on("privacy:hideNow", () => {
    setRevealedUntil(0);
  });

  ipcMain.on("privacy:gateComplete", (event) => {
    if (!isFromGate(event)) {
      return;
    }
    if (Date.now() - gate.openedAt < GATE_MS - GATE_TOLERANCE_MS) {
      return;
    }
    const { mode } = gate;
    if (mode === "charts") {
      sendToRequester("privacy:chartsUnlocked");
    } else {
      setRevealedUntil(Date.now() + REVEAL_MS);
    }
    closeGate({ completed: true });
  });

  ipcMain.on("privacy:gateCancel", (event) => {
    if (isFromGate(event)) {
      closeGate({ completed: false });
    }
  });
}

/** Called when the app is closing: removes the gate and the hidden standby window. */
function closePrivacyGate() {
  shuttingDown = true;
  clearTimeout(standbyTimer);
  standbyTimer = null;
  closeGate({ completed: false });
  if (standby && !standby.win.isDestroyed()) {
    standby.win.destroy();
  }
  standby = null;
}

module.exports = { registerPrivacyHandlers, closePrivacyGate };
