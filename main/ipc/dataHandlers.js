const { ipcMain, BrowserWindow } = require("electron");
const { STORAGE_KEYS } = require("../../shared/constants/storageKeys.cjs");

let timerCommand = null;

function broadcast(channel, payload) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  });
}

function registerDataHandlers({ localDb, syncEngine }) {
  const afterWrite = () => syncEngine.scheduleSync();

  ipcMain.handle("db:employers:getAll", () => localDb.getAllEmployers());

  ipcMain.handle("db:employers:getById", (_event, id) => localDb.getEmployerById(id));

  ipcMain.handle("db:employers:upsert", (_event, employer) => {
    localDb.upsertEmployer(employer);
    syncEngine.notifyStatus();
    afterWrite();
    return employer;
  });

  ipcMain.handle("db:employers:delete", (_event, id) => {
    localDb.deleteEmployer(id);
    syncEngine.notifyStatus();
    afterWrite();
  });

  ipcMain.handle("db:logs:getAll", () => localDb.getAllLogs());

  ipcMain.handle("db:logs:upsert", (_event, log) => {
    const saved = localDb.upsertLog(log);
    syncEngine.notifyStatus();
    afterWrite();
    return saved;
  });

  ipcMain.handle("db:logs:delete", (_event, id) => {
    localDb.deleteLog(id);
    syncEngine.notifyStatus();
    afterWrite();
  });

  ipcMain.handle("db:logs:clear", () => {
    localDb.clearLogs();
    syncEngine.notifyStatus();
    afterWrite();
  });

  ipcMain.handle("db:settings:get", () => localDb.getSettings());

  ipcMain.handle("db:settings:save", (_event, settings) => {
    localDb.saveSettings(settings);
    syncEngine.notifyStatus();
    afterWrite();
  });

  ipcMain.handle("db:timer:load", () => localDb.loadTimerState());

  ipcMain.handle("db:timer:save", (_event, state, options = {}) => {
    localDb.saveTimerState(state, {
      enqueue: options.enqueue !== false,
      runtime: !!options.runtime
    });
    if (options.enqueue !== false) {
      syncEngine.notifyStatus();
    }
  });

  ipcMain.handle("db:timer:clear", () => {
    localDb.clearTimerState();
    syncEngine.notifyStatus();
    afterWrite();
  });

  ipcMain.handle("db:timer:getCommand", () => timerCommand);

  ipcMain.handle("db:timer:setCommand", (_event, command) => {
    timerCommand = command;
    broadcast("timer:command", command);
  });

  ipcMain.handle("db:timer:clearCommand", () => {
    timerCommand = null;
  });

  ipcMain.handle("db:legacy:import", (_event, payload) => {
    if (localDb.wasLegacyImported()) {
      return { imported: false, reason: "already_imported" };
    }
    localDb.importFromLegacy(payload);
    return { imported: true };
  });

  ipcMain.handle("db:legacy:wasImported", () => localDb.wasLegacyImported());

  ipcMain.handle("db:legacy:readLocalStorage", () => ({
    workLogs: null,
    workTimerSettings: null,
    timerState: null,
    keys: STORAGE_KEYS
  }));
}

module.exports = { registerDataHandlers };
