#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createDynamacIslandMainProcess } = require("../src/main-process");
const { createJsonStatusWatcher } = require("../src/status-watcher");

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function statusPayload(codexState) {
  return {
    statuses: [
      {
        agent: "Snuffles",
        state: "idle",
        task: "Monitoring local jobs",
        updatedAt: "2026-06-08T12:00:00.000Z",
        detail: "Snuffles is watching the local status file."
      },
      {
        agent: "Codex",
        state: codexState,
        task: `Codex is ${codexState}`,
        updatedAt: "2026-06-08T12:01:00.000Z",
        detail: `Codex state came from a parsed ${codexState} JSON edit.`
      },
      {
        agent: "Ouroboros",
        state: "success",
        task: "Seed complete",
        updatedAt: "2026-06-08T12:02:00.000Z",
        detail: "Ouroboros has a complete mock job state."
      }
    ]
  };
}

async function waitForUpdate(sentMessages, expectedState) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 1000) {
    const statusUpdate = sentMessages
      .filter((message) => message.channel === "status:update")
      .at(-1);

    if (
      statusUpdate &&
      statusUpdate.payload.ok === true &&
      statusUpdate.payload.statuses.some(
        (status) => status.agent === "Codex" && status.state === expectedState
      )
    ) {
      return statusUpdate.payload;
    }

    await wait(10);
  }

  assert.fail(`Expected a status:update broadcast with Codex state ${expectedState}`);
}

async function run() {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "dynamac-edit-event-"));
  const statusPath = path.join(temporaryDirectory, "status.json");
  const sentMessages = [];
  const subscriberPayloads = [];
  const appEvents = new Map();
  const ipcHandlers = new Map();
  const watchedFiles = new Map();

  fs.writeFileSync(statusPath, JSON.stringify(statusPayload("idle")), "utf8");

  const fakeApp = {
    getAppPath() {
      return temporaryDirectory;
    },
    whenReady() {
      return {
        then(callback) {
          callback();
        }
      };
    },
    on(eventName, callback) {
      appEvents.set(eventName, callback);
    },
    quit() {}
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
    }
  };

  const fakeWindow = {
    isDestroyed() {
      return false;
    },
    webContents: {
      once(eventName, callback) {
        if (eventName === "did-finish-load") {
          callback();
        }
      },
      send(channel, payload) {
        sentMessages.push({ channel, payload });
      }
    }
  };

  const fakeFs = {
    existsSync: fs.existsSync,
    mkdirSync: fs.mkdirSync,
    copyFileSync: fs.copyFileSync,
    watchFile(filePath, options, callback) {
      watchedFiles.set(filePath, { options, callback });
    },
    unwatchFile(filePath) {
      watchedFiles.delete(filePath);
    }
  };

  const mainProcess = createDynamacIslandMainProcess({
    app: fakeApp,
    BrowserWindow: FakeBrowserWindow,
    ipcMain: fakeIpcMain,
    baseDir: path.resolve("src"),
    statusFile: statusPath,
    env: {},
    fs: fakeFs,
    refreshStatusFile() {},
    createJsonStatusWatcher(options) {
      return createJsonStatusWatcher({
        ...options,
        debounceMs: 1,
        pollIntervalMs: 1
      });
    },
    createDynamacIslandWindow() {
      return {
        window: fakeWindow,
        composition: { contentRoot: { view: "dynamac-pill" } }
      };
    }
  });

  mainProcess.subscribeStatusUpdates((payload) => {
    subscriberPayloads.push(payload);
  });

  mainProcess.start();

  assert.equal(ipcHandlers.has("status:read"), true, "status read IPC should be registered");
  assert.equal(watchedFiles.has(statusPath), true, "status file should be watched");

  const initialPayload = await waitForUpdate(sentMessages, "idle");
  assert.equal(initialPayload.ok, true, "initial status JSON should parse successfully");

  const previousStats = fs.statSync(statusPath);
  fs.writeFileSync(statusPath, JSON.stringify(statusPayload("running")), "utf8");
  const currentStats = fs.statSync(statusPath);

  watchedFiles.get(statusPath).callback(currentStats, previousStats);

  const changedPayload = await waitForUpdate(sentMessages, "running");
  assert.deepEqual(
    changedPayload.statuses.map((status) => `${status.agent}:${status.state}`),
    ["Snuffles:idle", "Codex:running", "Ouroboros:success"],
    "simulated watched-file edit should broadcast parsed JSON state changes"
  );
  assert.equal(
    subscriberPayloads.at(-1).statuses.find((status) => status.agent === "Codex").state,
    "running",
    "simulated watched-file edit should publish the parsed JSON state update path"
  );

  appEvents.get("before-quit")();
  assert.equal(watchedFiles.has(statusPath), false, "before-quit should unwatch the status file");

  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  console.log("Status edit event handling test passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
