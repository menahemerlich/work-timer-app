const path = require("path");
const { app } = require("electron");
const { createMainWindow } = require("./windows/MainWindow");
const { registerMiniWindowHandlers } = require("./ipc/miniWindowHandlers");
const { initDataLayer, startDataServices, stopDataServices } = require("./bootstrap/dataBootstrap");

app.setPath("userData", path.join(app.getPath("appData"), "WorkTimer"));
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
app.commandLine.appendSwitch("disk-cache-size", "0");

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const { BrowserWindow } = require("electron");
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      const mainWindow = windows[0];
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });
}

registerMiniWindowHandlers();

if (gotSingleInstanceLock) {
  app.whenReady().then(() => {
    const supabase = initDataLayer();
    startDataServices(supabase);
    createMainWindow();

    app.on("activate", () => {
      if (require("electron").BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("before-quit", () => {
    stopDataServices();
  });
}
