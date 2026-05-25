const path = require("path");
const { BrowserWindow } = require("electron");

let mainWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 920,
    height: 680,
    minWidth: 720,
    minHeight: 620,
    webPreferences: {
      preload: path.join(__dirname, "../../preload/preload.js"),
      backgroundThrottling: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "../../renderer/index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}

module.exports = { createMainWindow };
