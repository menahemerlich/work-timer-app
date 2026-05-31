const path = require("path");
const { BrowserWindow, screen } = require("electron");
const { computeCornerPosition } = require("./windowPosition");

const WIDTH = 240;
const HEIGHT = 140;

let earningsWindow = null;

function createEarningsWindow(corner = "top-left") {
  if (earningsWindow) {
    earningsWindow.show();
    return earningsWindow;
  }

  const workArea = screen.getPrimaryDisplay().workArea;
  const { x, y } = computeCornerPosition(corner, WIDTH, HEIGHT, workArea);

  earningsWindow = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    useContentSize: true,
    webPreferences: {
      preload: path.join(__dirname, "../../preload/preload.js")
    }
  });

  earningsWindow.loadFile(path.join(__dirname, "../../earnings/earnings.html"));

  earningsWindow.on("closed", () => {
    earningsWindow = null;
  });

  return earningsWindow;
}

function closeEarningsWindow() {
  if (earningsWindow && !earningsWindow.isDestroyed()) {
    earningsWindow.close();
  }
  earningsWindow = null;
}

module.exports = { createEarningsWindow, closeEarningsWindow };
