const { app, BrowserWindow, ipcMain, screen } = require("electron");
const { createDynamacIslandMainProcess } = require("./main-process");

createDynamacIslandMainProcess({
  app,
  BrowserWindow,
  ipcMain,
  screen
}).start();
