const { ipcMain } = require("electron");

function registerEmailHandlers({ emailService }) {
  ipcMain.handle("email:getConfig", () => emailService.getConfig());
  ipcMain.handle("email:saveConfig", (_event, patch) => emailService.saveConfig(patch));
  ipcMain.handle("email:verify", () => emailService.verify());
  ipcMain.handle("email:send", (_event, mail) => emailService.send(mail));
  ipcMain.handle("email:markSent", (_event, key) => {
    emailService.markSent(key);
    return true;
  });
}

module.exports = { registerEmailHandlers };
