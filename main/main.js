const path = require("path");
const { app, Menu, ipcMain } = require("electron");
const { createMainWindow } = require("./windows/MainWindow");
const { createEarningsWindow, closeEarningsWindow } = require("./windows/EarningsWindow");
const {
  startMotivationSchedule,
  restartMotivationSchedule,
  closeMotivationWindow
} = require("./windows/MotivationWindow");
const { registerMiniWindowHandlers } = require("./ipc/miniWindowHandlers");
const { registerWindowHandlers } = require("./ipc/windowHandlers");
const { initDataLayer, startDataServices, stopDataServices, getLocalDb } = require("./bootstrap/dataBootstrap");

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
registerWindowHandlers();

if (gotSingleInstanceLock) {
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    const supabase = initDataLayer();
    startDataServices(supabase);
    const mainWindow = createMainWindow();
    let savedCorner = "top-left";
    try {
      savedCorner = getLocalDb()?.getSettings()?.earningsWindowCorner || "top-left";
    } catch (error) {
      console.error("Failed to read earnings window position:", error);
    }
    createEarningsWindow(savedCorner);

    const getMotivationConfig = () => {
      const settings = getLocalDb()?.getSettings() || {};
      return {
        position: settings.motivationPosition || "top",
        intervalMinutes: settings.motivationIntervalMinutes,
        durationSeconds: settings.motivationDurationSeconds
      };
    };
    startMotivationSchedule(getMotivationConfig);

    ipcMain.on("motivation:configChanged", () => {
      restartMotivationSchedule();
    });

    ipcMain.on("earnings:open", () => {
      let corner = "top-left";
      try {
        corner = getLocalDb()?.getSettings()?.earningsWindowCorner || "top-left";
      } catch (error) {
        console.error("Failed to read earnings window position:", error);
      }
      createEarningsWindow(corner);
    });

    mainWindow.on("closed", () => {
      closeEarningsWindow();
      closeMotivationWindow();
    });

    app.on("activate", () => {
      if (require("electron").BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
        createEarningsWindow();
        startMotivationSchedule();
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
