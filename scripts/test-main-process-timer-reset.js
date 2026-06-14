#!/usr/bin/env node

const assert = require("node:assert");
const path = require("node:path");
const { createDynamacIslandMainProcess } = require("../src/main-process");

const completedPayload = {
  ok: true,
  source: "status/status.json",
  statuses: [
    {
      agent: "Timer",
      state: "success",
      task: "Timer done",
      updatedAt: "2026-06-14T00:05:00.000Z",
      detail: "5m timer elapsed.",
      timer: {
        id: "timer-main-reset-done",
        durationSeconds: 300,
        remainingSeconds: 0,
        state: "done",
        startedAt: "2026-06-14T00:00:00.000Z",
        updatedAt: "2026-06-14T00:05:00.000Z",
        displayText: "5m",
        error: "",
        replacedPrevious: false
      }
    }
  ],
  errors: []
};

const resetPayload = {
  ok: true,
  source: "status/status.json",
  statuses: [
    {
      agent: "Timer",
      state: "idle",
      task: "Timer · 5m remaining",
      updatedAt: "2026-06-14T00:06:00.000Z",
      detail: "5m remaining of 5m.",
      timer: {
        ...completedPayload.statuses[0].timer,
        remainingSeconds: 300,
        state: "reset",
        startedAt: "2026-06-14T00:06:00.000Z",
        updatedAt: "2026-06-14T00:06:00.000Z"
      }
    }
  ],
  errors: []
};

let readyCallback;
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
  on() {},
  quit() {}
};

class FakeBrowserWindow {
  static getAllWindows() {
    return [];
  }
}

const calls = [];
const statusFile = path.resolve("status/status.json");
const mainProcess = createDynamacIslandMainProcess({
  app: fakeApp,
  BrowserWindow: FakeBrowserWindow,
  ipcMain: { handle() {} },
  screen: {},
  baseDir: path.resolve("src"),
  statusFile,
  fs: { mocked: true },
  refreshStatusFile() {},
  loadStatusFile(filePath) {
    calls.push(["loadStatusFile", filePath]);
    return calls.filter((call) => call[0] === "loadStatusFile").length === 1
      ? completedPayload
      : resetPayload;
  },
  resetTimerStatusSnapshot(timerState, options) {
    calls.push(["resetTimerStatusSnapshot", timerState, options]);
    assert.deepEqual(timerState, { activeTimer: completedPayload.statuses[0].timer });
    assert.equal(options.outputPath, statusFile);
    assert.equal(options.now, "2026-06-14T00:06:00.000Z");
    assert.equal(options.statusNow, "2026-06-14T00:06:00.000Z");
    assert.deepEqual(options.fs, { mocked: true });
    return {
      timer: resetPayload.statuses[0].timer,
      status: {
        outputPath: options.outputPath,
        payload: { statuses: resetPayload.statuses }
      }
    };
  },
  createDynamacIslandWindow() {
    throw new Error("timer reset operation test should not create a window");
  },
  createJsonStatusWatcher() {
    throw new Error("timer reset operation test should not create a watcher");
  }
});

const subscriberPayloads = [];
mainProcess.subscribeStatusUpdates((payload) => subscriberPayloads.push(payload));

const result = mainProcess.resetActiveTimer({
  timerId: "timer-main-reset-done",
  now: "2026-06-14T00:06:00.000Z",
  statusNow: "2026-06-14T00:06:00.000Z"
});

assert.equal(readyCallback, undefined, "direct reset test should not start the Electron app");
assert.deepEqual(
  result,
  {
    ok: true,
    payload: resetPayload
  },
  "main reset operation should reset a completed Timer and return the reloaded payload"
);
assert.deepEqual(
  calls.map((call) => call[0]),
  ["loadStatusFile", "resetTimerStatusSnapshot", "loadStatusFile"],
  "main reset operation should load current status, invoke reset store, then reload persisted status"
);
assert.deepEqual(subscriberPayloads, [resetPayload], "main reset operation should publish the reset payload");

const mismatchedIdProcess = createDynamacIslandMainProcess({
  app: fakeApp,
  BrowserWindow: FakeBrowserWindow,
  ipcMain: { handle() {} },
  screen: {},
  statusFile,
  loadStatusFile() {
    return completedPayload;
  },
  resetTimerStatusSnapshot() {
    throw new Error("reset store should not be called for a stale completed timer id");
  }
});
assert.deepEqual(
  mismatchedIdProcess.resetActiveTimer({ timerId: "other-timer" }),
  {
    ok: false,
    error: "Requested timer is not the resettable timer.",
    payload: completedPayload
  },
  "main reset operation should reject stale UI requests against a different completed timer"
);

console.log("Main process Timer completed reset test passed.");
