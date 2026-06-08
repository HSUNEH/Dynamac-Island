#!/usr/bin/env node

const assert = require("node:assert");
const path = require("node:path");
const { createDynamacIslandMainProcess } = require("../src/main-process");

let readyCallback;
const appEvents = new Map();
const ipcHandlers = new Map();
const watcher = { closed: false, close: () => { watcher.closed = true; } };
const calls = [];
const subscriberPayloads = [];
let watcherReload;
const fakeScreen = { getPrimaryDisplay() {} };
const loadedPayloads = [
  { ok: true, statuses: [{ agent: "Codex", state: "idle" }] },
  { ok: false, statuses: [], errors: ["Status JSON is invalid: fixture error"] }
];

const fakeApp = {
  getAppPath() {
    return path.resolve(".");
  },
  whenReady() {
    return {
      then(callback) {
        readyCallback = callback;
      }
    };
  },
  on(eventName, callback) {
    appEvents.set(eventName, callback);
  },
  quit() {
    calls.push(["app.quit"]);
  }
};

class FakeBrowserWindow {
  static getAllWindows() {
    return FakeBrowserWindow.windows;
  }
}

FakeBrowserWindow.windows = [{}];

const fakeIpcMain = {
  handle(channel, callback) {
    ipcHandlers.set(channel, callback);
    calls.push(["ipc.handle", channel]);
  }
};

const fakeFs = {
  existsSync() {
    return true;
  },
  mkdirSync() {},
  copyFileSync() {}
};

const fakeWindow = {
  destroyed: false,
  isDestroyed() {
    return this.destroyed;
  },
  webContents: {
    once(eventName, callback) {
      calls.push(["webContents.once", eventName]);
      fakeWindow.finishLoad = callback;
    },
    send(channel, payload) {
      calls.push(["webContents.send", channel, payload]);
    }
  }
};

const mainProcess = createDynamacIslandMainProcess({
  app: fakeApp,
  BrowserWindow: FakeBrowserWindow,
  ipcMain: fakeIpcMain,
  screen: fakeScreen,
  baseDir: path.resolve("src"),
  statusFile: path.resolve("status/status.json"),
  env: {},
  fs: fakeFs,
  refreshStatusFile(options) {
    calls.push(["refreshStatusFile", options.outputPath]);
  },
  loadStatusFile(filePath) {
    calls.push(["loadStatusFile", filePath]);
    return loadedPayloads.shift();
  },
  createJsonStatusWatcher(options) {
    calls.push(["createJsonStatusWatcher", options.statusPath, options.fs === fakeFs]);
    watcherReload = options.onReload;
    return watcher;
  },
  createDynamacIslandWindow(BrowserWindow, options) {
    calls.push(["createDynamacIslandWindow", BrowserWindow.name, options]);
    return {
      window: fakeWindow,
      composition: { contentRoot: { view: "dynamac-pill" } }
    };
  }
});

const unsubscribeStatusUpdates = mainProcess.subscribeStatusUpdates((payload) => {
  subscriberPayloads.push(payload);
});

assert.throws(
  () => mainProcess.subscribeStatusUpdates("not a function"),
  /status update subscriber must be a function/,
  "status subscriptions should reject non-function subscribers"
);

mainProcess.start();

assert.equal(typeof readyCallback, "function", "start should register an app readiness callback");
assert.equal(typeof appEvents.get("window-all-closed"), "function");
assert.equal(typeof appEvents.get("before-quit"), "function");

readyCallback();

assert.equal(ipcHandlers.has("status:read"), true, "startup should register status IPC");
assert.equal(typeof appEvents.get("activate"), "function", "startup should register macOS activate handler");

const launchCall = calls.find((call) => call[0] === "createDynamacIslandWindow");
assert.ok(launchCall, "app startup should invoke the app composition window factory");
assert.equal(launchCall[1], "FakeBrowserWindow");
assert.deepEqual(launchCall[2], {
  preloadPath: path.resolve("src/preload.js"),
  indexPath: path.resolve("src/index.html"),
  screen: fakeScreen
});

assert.deepEqual(
  calls.filter((call) => call[0] === "createJsonStatusWatcher"),
  [
    ["createJsonStatusWatcher", path.resolve("status/status.json"), true]
  ],
  "startup should create the JSON status watcher"
);

fakeWindow.finishLoad();

assert.deepEqual(
  calls.filter((call) => call[0] === "webContents.send"),
  [["webContents.send", "status:update", { ok: true, statuses: [{ agent: "Codex", state: "idle" }] }]],
  "finished window load should broadcast the current status"
);
assert.deepEqual(
  subscriberPayloads,
  [{ ok: true, statuses: [{ agent: "Codex", state: "idle" }] }],
  "finished window load should publish the current status to subscribers"
);

assert.equal(typeof watcherReload, "function", "status watcher should receive a reload callback");
const changedPayload = watcherReload({ eventType: "change" });
assert.equal(
  calls.filter((call) => call[0] === "refreshStatusFile").length,
  2,
  "watcher reload should load the changed file as-is instead of overwriting it with a regenerated snapshot"
);
assert.deepEqual(
  changedPayload,
  { ok: false, statuses: [], errors: ["Status JSON is invalid: fixture error"] },
  "watcher reload callback should return the changed file payload"
);
assert.deepEqual(
  calls.filter((call) => call[0] === "webContents.send").at(-1),
  ["webContents.send", "status:update", { ok: false, statuses: [], errors: ["Status JSON is invalid: fixture error"] }],
  "watcher reload callback should broadcast the changed file payload"
);
assert.deepEqual(
  subscriberPayloads.at(-1),
  { ok: false, statuses: [], errors: ["Status JSON is invalid: fixture error"] },
  "watcher reload callback should publish the reloaded app state to subscribers"
);

unsubscribeStatusUpdates();
mainProcess.broadcastStatus({ ok: true, statuses: [{ agent: "Ouroboros", state: "success" }] });
assert.equal(
  subscriberPayloads.length,
  2,
  "unsubscribed status subscribers should not receive later broadcasts"
);

FakeBrowserWindow.windows = [];
appEvents.get("activate")();
assert.equal(
  calls.filter((call) => call[0] === "createDynamacIslandWindow").length,
  2,
  "activate should recreate the composition window when none are open"
);

appEvents.get("before-quit")();
assert.equal(watcher.closed, true, "before-quit should close the status watcher");

console.log("Main process launch wiring test passed.");
