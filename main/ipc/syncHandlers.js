const { ipcMain } = require("electron");

function registerSyncHandlers({ syncEngine, networkMonitor }) {
  ipcMain.handle("sync:getStatus", () => syncEngine.getStatus());

  ipcMain.handle("sync:forceSync", async () => {
    await networkMonitor.checkNow();
    return syncEngine.fullSync();
  });

  ipcMain.handle("sync:isOnline", () => networkMonitor.isOnline);

  ipcMain.handle("sync:hardPullReplaceLocal", async (_event, password) => {
    const expected = process.env.HARD_PULL_PASSWORD || "";
    if (!expected) {
      throw new Error("פעולה זו לא מוגדרת. יש להגדיר HARD_PULL_PASSWORD בקובץ .env");
    }
    if (String(password || "") !== expected) {
      throw new Error("סיסמה שגויה.");
    }

    await networkMonitor.checkNow();
    return syncEngine.hardPullReplaceLocal();
  });
}

module.exports = { registerSyncHandlers };
