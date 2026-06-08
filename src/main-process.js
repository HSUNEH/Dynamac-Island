const fs = require("node:fs");
const path = require("node:path");
const { loadStatusFile } = require("./status-loader");
const { createDynamacIslandWindow } = require("./app-composition");
const { createJsonStatusWatcher } = require("./status-watcher");

function isPackagedAsarPath(appPath) {
  return path.basename(appPath) === "app.asar";
}

function resolveDefaultStatusFile(electronApp, appPath) {
  if (isPackagedAsarPath(appPath)) {
    return path.join(electronApp.getPath("userData"), "status", "status.json");
  }

  return path.join(appPath, "status", "status.json");
}

function ensureWritableStatusFile(options) {
  const statusFile = options.statusFile;
  const bundledStatusFile = options.bundledStatusFile;
  const fileSystem = options.fs || fs;

  if (fileSystem.existsSync(statusFile)) {
    return;
  }

  fileSystem.mkdirSync(path.dirname(statusFile), { recursive: true });

  if (bundledStatusFile && fileSystem.existsSync(bundledStatusFile)) {
    fileSystem.copyFileSync(bundledStatusFile, statusFile);
  }
}

function createDynamacIslandMainProcess(dependencies) {
  const electronApp = dependencies.app;
  const BrowserWindow = dependencies.BrowserWindow;
  const ipcMain = dependencies.ipcMain;
  const platform = dependencies.platform || process.platform;
  const env = dependencies.env || process.env;
  const baseDir = dependencies.baseDir || __dirname;
  const appPath = dependencies.appPath || electronApp.getAppPath();
  const bundledStatusFile = dependencies.bundledStatusFile || path.join(appPath, "status", "status.json");
  const statusFile = dependencies.statusFile || resolveDefaultStatusFile(electronApp, appPath);
  const fileSystem = dependencies.fs || fs;
  const loadStatus = dependencies.loadStatusFile || loadStatusFile;
  const createStatusWatcher = dependencies.createJsonStatusWatcher || createJsonStatusWatcher;
  const createWindowFromComposition =
    dependencies.createDynamacIslandWindow || createDynamacIslandWindow;

  let mainWindow;
  let statusWatcher;
  let currentStatus;
  const statusSubscribers = new Set();

  function readStatusFile() {
    ensureWritableStatusFile({
      statusFile,
      bundledStatusFile,
      fs: fileSystem
    });
    currentStatus = loadStatus(statusFile);
    return currentStatus;
  }

  function broadcastStatus(payload = currentStatus || readStatusFile()) {
    if (!mainWindow || mainWindow.isDestroyed()) {
      publishStatus(payload);
      return;
    }

    mainWindow.webContents.send("status:update", payload);
    publishStatus(payload);
  }

  function publishStatus(payload) {
    for (const subscriber of statusSubscribers) {
      subscriber(payload);
    }
  }

  function subscribeStatusUpdates(subscriber) {
    if (typeof subscriber !== "function") {
      throw new Error("status update subscriber must be a function");
    }

    statusSubscribers.add(subscriber);
    return () => {
      statusSubscribers.delete(subscriber);
    };
  }

  function reloadChangedStatusFile() {
    const payload = readStatusFile();
    broadcastStatus(payload);
    return payload;
  }

  function watchStatusFile() {
    ensureWritableStatusFile({
      statusFile,
      bundledStatusFile,
      fs: fileSystem
    });
    statusWatcher = createStatusWatcher({
      statusPath: statusFile,
      onReload: reloadChangedStatusFile,
      fs: fileSystem
    });
  }

  function createWindow() {
    const appWindow = createWindowFromComposition(BrowserWindow, {
      preloadPath: path.join(baseDir, "preload.js"),
      indexPath: path.join(baseDir, "index.html")
    });
    mainWindow = appWindow.window;

    mainWindow.webContents.once("did-finish-load", () => {
      broadcastStatus();

      if (env.DYNAMAC_SMOKE_TEST === "1") {
        console.log("DYNAMAC_SMOKE_READY");
        setTimeout(() => electronApp.quit(), 100);
      }
    });

    return appWindow;
  }

  function start() {
    electronApp.whenReady().then(() => {
      ipcMain.handle("status:read", readStatusFile);
      createWindow();
      watchStatusFile();

      electronApp.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          createWindow();
        }
      });
    });

    electronApp.on("window-all-closed", () => {
      if (platform !== "darwin") {
        electronApp.quit();
      }
    });

    electronApp.on("before-quit", () => {
      if (statusWatcher) {
        statusWatcher.close();
      }
    });
  }

  return {
    start,
    readStatusFile,
    broadcastStatus,
    reloadChangedStatusFile,
    createWindow,
    watchStatusFile,
    subscribeStatusUpdates
  };
}

module.exports = {
  createDynamacIslandMainProcess,
  resolveDefaultStatusFile,
  ensureWritableStatusFile
};
