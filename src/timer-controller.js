const fs = require("node:fs");
const { loadStatusFile } = require("./status-loader");
const { createTimerState, TIMER_STATES } = require("./timer-state");
const { stopTimerStatusSnapshot } = require("./timer-status-store");

function createTimerController(dependencies = {}) {
  const statusFile = dependencies.statusFile;
  const fileSystem = dependencies.fs || fs;
  const loadStatus = dependencies.loadStatusFile || loadStatusFile;
  const stopTimerSnapshot = dependencies.stopTimerStatusSnapshot || stopTimerStatusSnapshot;
  const broadcastStatus = dependencies.broadcastStatus || (() => {});

  if (typeof statusFile !== "string" || statusFile.trim() === "") {
    throw new Error("statusFile is required");
  }

  function loadCurrentStatusFile() {
    return loadStatus(statusFile);
  }

  function stopActiveTimer(options = {}) {
    const payload = options.payload || loadCurrentStatusFile();
    const timerStatus = findRunningTimerStatus(payload);

    if (!timerStatus) {
      return {
        ok: false,
        error: "No running timer to stop.",
        payload
      };
    }

    const requestedTimerId = options.timerId ? String(options.timerId) : "";
    const runningTimerId = String(timerStatus.timer.id || "");
    if (requestedTimerId && requestedTimerId !== runningTimerId) {
      return {
        ok: false,
        error: "Requested timer is not the running timer.",
        payload
      };
    }

    const status = stopTimerSnapshot(createTimerState(timerStatus.timer), {
      outputPath: statusFile,
      now: options.now,
      statusNow: options.statusNow,
      fs: fileSystem
    });
    const nextPayload = loadCurrentStatusFile();
    broadcastStatus(nextPayload);

    return {
      ok: true,
      timer: status.timer,
      status: status.status,
      payload: nextPayload
    };
  }

  return {
    stopActiveTimer
  };
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

module.exports = {
  createTimerController,
  findRunningTimerStatus
};
