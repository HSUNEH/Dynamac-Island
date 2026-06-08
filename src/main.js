const { app, BrowserWindow, ipcMain } = require("electron");
const { createDynamacIslandMainProcess } = require("./main-process");

createDynamacIslandMainProcess({
  app,
  BrowserWindow,
  ipcMain
}).start();
