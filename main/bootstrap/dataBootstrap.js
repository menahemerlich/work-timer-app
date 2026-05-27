const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const { app, BrowserWindow } = require("electron");
const { createLocalDatabase } = require("../db/LocalDatabaseService");
const { SupabaseService } = require("../db/SupabaseService");
const authSession = require("../db/authSession");
const { SyncQueue } = require("../sync/SyncQueue");
const { SyncEngine } = require("../sync/SyncEngine");
const { NetworkMonitor } = require("../sync/NetworkMonitor");
const { registerDataHandlers } = require("../ipc/dataHandlers");
const { registerAuthHandlers } = require("../ipc/authHandlers");
const { registerSyncHandlers } = require("../ipc/syncHandlers");

let localDb = null;
let syncEngine = null;
let networkMonitor = null;

function broadcastSyncStatus(status) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send("sync:status", status);
    }
  });
}

function initDataLayer() {
  const userDataPath = app.getPath("userData");
  localDb = createLocalDatabase(userDataPath);

  const supabase = new SupabaseService({
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
    userDataPath,
    authSession
  });

  const syncQueue = new SyncQueue(localDb);
  syncEngine = new SyncEngine({
    localDb,
    supabase,
    syncQueue,
    onStatusChange: broadcastSyncStatus
  });

  networkMonitor = new NetworkMonitor({
    pingFn: async () => {
      if (!supabase.isConfigured()) {
        return true;
      }
      return supabase.ping();
    },
    onOnline: () => {
      syncEngine.onNetworkOnline().catch((error) => {
        console.error("Sync on online failed:", error);
      });
    },
    onOffline: () => {
      syncEngine.notifyStatus();
    }
  });

  syncEngine.setNetworkMonitor(networkMonitor);

  registerDataHandlers({ localDb, syncEngine });
  registerAuthHandlers({ supabase, syncEngine, localDb });
  registerSyncHandlers({ syncEngine, networkMonitor });

  return supabase;
}

function startDataServices(supabase) {
  supabase.restoreSession().then(async () => {
    syncEngine.notifyStatus();
    if (networkMonitor.isOnline && supabase.getSession()) {
      const userId = supabase.getUserId();
      if (userId) {
        await syncEngine.bootstrapLocalDataToCloud(userId);
      }
      await syncEngine.fullSync().catch((error) => {
        console.error("Initial sync failed:", error);
      });
    }
  });

  networkMonitor.start();

  syncEngine.startPeriodicSync({
    isOnlineFn: () => networkMonitor.isOnline,
    hasSessionFn: () => Boolean(supabase.getSession())
  });
}

function stopDataServices() {
  syncEngine?.stopPeriodicSync();
  networkMonitor?.stop();
  localDb?.close();
}

module.exports = { initDataLayer, startDataServices, stopDataServices };
