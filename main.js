const { app, BrowserWindow, ipcMain } = require("electron");

let mainWindow = null;
let miniWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: __dirname + "/preload.js"
    }
  });

  mainWindow.loadFile("index.html");
}

function createMiniWindow() {
  if (miniWindow) {
    miniWindow.focus();
    return;
  }

  miniWindow = new BrowserWindow({
    width: 220,
    height: 140,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      preload: __dirname + "/preload.js"
    }
  });

  miniWindow.loadFile("mini.html");

  miniWindow.on("closed", () => {
    miniWindow = null;
  });
}

ipcMain.on("open-mini-window", () => {
  createMiniWindow();
});

app.whenReady().then(createMainWindow);
