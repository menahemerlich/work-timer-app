const { ipcMain, BrowserWindow, screen } = require("electron");
const { computeCornerPosition } = require("../windows/windowPosition");

function registerWindowHandlers() {
  ipcMain.on("window:minimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.on("window:close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.on("window:setCorner", (event, corner) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) {
      return;
    }
    const workArea = screen.getPrimaryDisplay().workArea;
    const [width, height] = win.getSize();
    const { x, y } = computeCornerPosition(corner, width, height, workArea);
    win.setPosition(x, y);
  });
}

module.exports = { registerWindowHandlers };
