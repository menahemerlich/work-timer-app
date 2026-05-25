const { ipcMain } = require("electron");
const { createMiniWindow } = require("../windows/MiniWindow");

function registerMiniWindowHandlers() {
  ipcMain.on("open-mini-window", () => {
    createMiniWindow();
  });
}

module.exports = { registerMiniWindowHandlers };
