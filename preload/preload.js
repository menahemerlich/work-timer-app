const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  openMiniWindow: () => ipcRenderer.send("open-mini-window"),

  db: {
    employers: {
      getAll: () => ipcRenderer.invoke("db:employers:getAll"),
      getById: (id) => ipcRenderer.invoke("db:employers:getById", id),
      upsert: (employer) => ipcRenderer.invoke("db:employers:upsert", employer),
      delete: (id) => ipcRenderer.invoke("db:employers:delete", id)
    },
    logs: {
      getAll: () => ipcRenderer.invoke("db:logs:getAll"),
      upsert: (log) => ipcRenderer.invoke("db:logs:upsert", log),
      delete: (id) => ipcRenderer.invoke("db:logs:delete", id),
      clear: () => ipcRenderer.invoke("db:logs:clear")
    },
    settings: {
      get: () => ipcRenderer.invoke("db:settings:get"),
      save: (settings) => ipcRenderer.invoke("db:settings:save", settings)
    },
    timer: {
      load: () => ipcRenderer.invoke("db:timer:load"),
      save: (state, options) => ipcRenderer.invoke("db:timer:save", state, options),
      clear: () => ipcRenderer.invoke("db:timer:clear"),
      getCommand: () => ipcRenderer.invoke("db:timer:getCommand"),
      setCommand: (command) => ipcRenderer.invoke("db:timer:setCommand", command),
      clearCommand: () => ipcRenderer.invoke("db:timer:clearCommand"),
      onCommand: (callback) => {
        const listener = (_event, command) => callback(command);
        ipcRenderer.on("timer:command", listener);
        return () => ipcRenderer.removeListener("timer:command", listener);
      }
    },
    legacy: {
      import: (payload) => ipcRenderer.invoke("db:legacy:import", payload),
      wasImported: () => ipcRenderer.invoke("db:legacy:wasImported")
    }
  },

  auth: {
    signIn: (email, password) => ipcRenderer.invoke("auth:signIn", email, password),
    signUp: (email, password, username) =>
      ipcRenderer.invoke("auth:signUp", email, password, username),
    signOut: () => ipcRenderer.invoke("auth:signOut"),
    getSession: () => ipcRenderer.invoke("auth:getSession"),
    isConfigured: () => ipcRenderer.invoke("auth:isConfigured")
  },

  sync: {
    getStatus: () => ipcRenderer.invoke("sync:getStatus"),
    forceSync: () => ipcRenderer.invoke("sync:forceSync"),
    isOnline: () => ipcRenderer.invoke("sync:isOnline"),
    hardPullReplaceLocal: (password) => ipcRenderer.invoke("sync:hardPullReplaceLocal", password),
    onStatus: (callback) => {
      const listener = (_event, status) => callback(status);
      ipcRenderer.on("sync:status", listener);
      return () => ipcRenderer.removeListener("sync:status", listener);
    }
  }
});
