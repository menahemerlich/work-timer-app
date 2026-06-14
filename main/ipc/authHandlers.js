const { ipcMain } = require("electron");

function mapUser(supabase) {
  return supabase.getSessionUser();
}

function scheduleBackgroundSync({ supabase, syncEngine, localDb }) {
  void (async () => {
    const userId = supabase.getUserId();
    if (userId) {
      await syncEngine.bootstrapLocalDataToCloud(userId);
    }
    await syncEngine.fullSync();
  })().catch((error) => {
    console.error("Background sync failed:", error);
  });
}

function registerAuthHandlers({ supabase, syncEngine, localDb }) {
  ipcMain.handle("auth:signIn", async (_event, identifier, password) => {
    await supabase.signIn(identifier, password);
    scheduleBackgroundSync({ supabase, syncEngine, localDb });
    return mapUser(supabase);
  });

  ipcMain.handle("auth:signUp", async (_event, email, password, username) => {
    const result = await supabase.signUp(email, password, username);
    if (result.session) {
      scheduleBackgroundSync({ supabase, syncEngine, localDb });
    }
    return {
      user: result.user ? mapUser(supabase) : null,
      needsConfirmation: !result.session
    };
  });

  ipcMain.handle("auth:signOut", async () => {
    await supabase.signOut();
    syncEngine.notifyStatus();
  });

  ipcMain.handle("auth:getSession", () => mapUser(supabase));

  ipcMain.handle("auth:isConfigured", () => supabase.isConfigured());
}

module.exports = { registerAuthHandlers };
