const path = require("path");
const { BrowserWindow } = require("electron");

let miniWindow = null;

function createMiniWindow() {
  if (miniWindow) {
    miniWindow.focus();
    return miniWindow;
  }

  miniWindow = new BrowserWindow({
    width: 240,
    height: 96,
    alwaysOnTop: true,
    resizable: false,
    useContentSize: true,
    webPreferences: {
      preload: path.join(__dirname, "../../preload/preload.js")
    }
  });

  miniWindow.loadFile(path.join(__dirname, "../../mini/mini.html"));

  miniWindow.on("closed", () => {
    miniWindow = null;
  });

  return miniWindow;
}

module.exports = { createMiniWindow };
