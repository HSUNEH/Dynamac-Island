const fs = require("node:fs");
const path = require("node:path");
const { loadStatusFile } = require("./status-loader");
const { createDynamacIslandWindow } = require("./app-composition");
const { createJsonStatusWatcher } = require("./status-watcher");
const { writeHermesStatusSnapshot } = require("./hermes-status");
const { createTimerState, TIMER_STATES } = require("./timer-state");
const { createTimerController } = require("./timer-controller");
const { resetTimerStatusSnapshot } = require("./timer-status-store");
const { setWindowMode } = require("./window-config");

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
  const screen = dependencies.screen;
  const platform = dependencies.platform || process.platform;
  const env = dependencies.env || process.env;
  const baseDir = dependencies.baseDir || __dirname;
  const appPath = dependencies.appPath || electronApp.getAppPath();
  const bundledStatusFile = dependencies.bundledStatusFile || path.join(appPath, "status", "status.json");
  const statusFile = dependencies.statusFile || resolveDefaultStatusFile(electronApp, appPath);
  const fileSystem = dependencies.fs || fs;
  const loadStatus = dependencies.loadStatusFile || loadStatusFile;
  const createStatusWatcher = dependencies.createJsonStatusWatcher || createJsonStatusWatcher;
  const refreshStatusFile = dependencies.refreshStatusFile || writeHermesStatusSnapshot;
  const resetTimerSnapshot = dependencies.resetTimerStatusSnapshot || resetTimerStatusSnapshot;
  const resizeWindowForMode = dependencies.setWindowMode || setWindowMode;
  const createWindowFromComposition =
    dependencies.createDynamacIslandWindow || createDynamacIslandWindow;
  const timerController = dependencies.timerController || createTimerController({
    statusFile,
    fs: fileSystem,
    loadStatusFile: loadCurrentStatusFile,
    stopTimerStatusSnapshot: dependencies.stopTimerStatusSnapshot,
    broadcastStatus
  });

  let mainWindow;
  let statusWatcher;
  let currentStatus;
  const statusSubscribers = new Set();

  function loadCurrentStatusFile() {
    currentStatus = loadStatus(statusFile);
    return currentStatus;
  }

  function readStatusFile() {
    refreshStatusFile({ outputPath: statusFile });
    return loadCurrentStatusFile();
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
    const payload = loadCurrentStatusFile();
    broadcastStatus(payload);
    return payload;
  }

  function watchStatusFile() {
    refreshStatusFile({ outputPath: statusFile });
    statusWatcher = createStatusWatcher({
      statusPath: statusFile,
      onReload: reloadChangedStatusFile,
      fs: fileSystem
    });
  }

  function createWindow() {
    const appWindow = createWindowFromComposition(BrowserWindow, {
      preloadPath: path.join(baseDir, "preload.js"),
      indexPath: path.join(baseDir, "index.html"),
      screen
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

  function setIslandMode(mode) {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { ok: false, mode };
    }

    resizeWindowForMode(mainWindow, screen, mode);
    return { ok: true, mode };
  }

  function findRunningTimerStatus(payload) {
    if (!payload || !Array.isArray(payload.statuses)) return null;

    return payload.statuses.find((status) => {
      const isTimer =
        status &&
        typeof status.agent === "string" &&
        status.agent.trim().toLowerCase() === "timer";
      return isTimer && status.timer && status.timer.state === TIMER_STATES.RUNNING;
    }) || null;
  }

  function resetActiveTimer(options = {}) {
    const payload = currentStatus || loadCurrentStatusFile();
    const timerStatus = findRunningTimerStatus(payload);

    if (!timerStatus) {
      return {
        ok: false,
        error: "No running timer to reset.",
        payload
      };
    }

    const requestedTimerId = options.timerId ? String(options.timerId) : "";
    if (requestedTimerId && requestedTimerId !== String(timerStatus.timer.id || "")) {
      return {
        ok: false,
        error: "Requested timer is not the running timer.",
        payload
      };
    }

    resetTimerSnapshot(createTimerState(timerStatus.timer), {
      outputPath: statusFile,
      now: options.now,
      statusNow: options.statusNow,
      fs: fileSystem
    });
    const nextPayload = loadCurrentStatusFile();
    broadcastStatus(nextPayload);

    return {
      ok: true,
      payload: nextPayload
    };
  }

  function stopActiveTimer(options = {}) {
    return timerController.stopActiveTimer(options);
  }

  function start() {
    electronApp.whenReady().then(() => {
      ipcMain.handle("status:read", readStatusFile);
      ipcMain.handle("window:set-mode", (_event, mode) => setIslandMode(mode));
      ipcMain.handle("timer:reset", (_event, options) => resetActiveTimer(options));
      ipcMain.handle("timer:stop", (_event, options) => stopActiveTimer(options));
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
    setIslandMode,
    resetActiveTimer,
    stopActiveTimer,
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
