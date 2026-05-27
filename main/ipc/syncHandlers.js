const { ipcMain } = require("electron");

function registerSyncHandlers({ syncEngine, networkMonitor }) {
  ipcMain.handle("sync:getStatus", () => syncEngine.getStatus());

  ipcMain.handle("sync:forceSync", async () => {
    await networkMonitor.checkNow();
    return syncEngine.fullSync();
  });

  ipcMain.handle("sync:isOnline", () => networkMonitor.isOnline);
}

module.exports = { registerSyncHandlers };
