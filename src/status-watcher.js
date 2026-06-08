const fs = require("node:fs");
const path = require("node:path");
const { loadStatusFile } = require("./status-loader");

function createJsonStatusWatcher(options) {
  const statusPath = options.statusPath;
  const onReload = options.onReload;
  const fileSystem = options.fs || fs;
  const loadStatus = options.loadStatusFile || loadStatusFile;
  const debounceMs = options.debounceMs ?? 80;
  const pollIntervalMs = options.pollIntervalMs ?? 100;
  const setTimer = options.setTimeout || setTimeout;
  const clearTimer = options.clearTimeout || clearTimeout;

  if (!statusPath) {
    throw new Error("statusPath is required");
  }

  if (typeof onReload !== "function") {
    throw new Error("onReload callback is required");
  }

  const directory = path.dirname(statusPath);
  const filename = path.basename(statusPath);
  let debounceTimer;
  let closed = false;

  fileSystem.mkdirSync(directory, { recursive: true });

  function scheduleReload(eventType) {
    if (closed) {
      return;
    }

    clearTimer(debounceTimer);
    debounceTimer = setTimer(() => {
      debounceTimer = undefined;
      onReload({
        statusPath,
        eventType,
        filename,
        payload: loadStatus(statusPath)
      });
    }, debounceMs);
  }

  fileSystem.watchFile(statusPath, { interval: pollIntervalMs }, (currentStats, previousStats) => {
    if (
      currentStats.mtimeMs === previousStats.mtimeMs &&
      currentStats.size === previousStats.size
    ) {
      return;
    }

    scheduleReload("change");
  });

  return {
    close() {
      closed = true;
      clearTimer(debounceTimer);
      fileSystem.unwatchFile(statusPath);
    }
  };
}

module.exports = {
  createJsonStatusWatcher
};
