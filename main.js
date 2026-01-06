const { app, BrowserWindow } = require("electron");

let mainWindow;
let miniWindow;

function createWindows() {
  // חלון ראשי
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      contextIsolation: false
    }
  });

  // חלון קטן
  miniWindow = new BrowserWindow({
    width: 300,
    height: 200,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      contextIsolation: false
    }
  });

  mainWindow.loadFile("index.html");
  miniWindow.loadFile("mini.html");
}

app.whenReady().then(createWindows);
