const fs = require("node:fs");
const path = require("node:path");
const { completeTimerIfElapsed, resetTimer, stopTimer } = require("./timer-state");
const { buildTimerStatusPayload } = require("./timer-status");

function atomicWriteJson(fileSystem, outputPath, payload) {
  const directory = path.dirname(outputPath);
  fileSystem.mkdirSync(directory, { recursive: true });
  const tempPath = path.join(
    directory,
    `.${path.basename(outputPath)}.${process.pid}.${Date.now()}.tmp`
  );
  fileSystem.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`);
  fileSystem.renameSync(tempPath, outputPath);
}

function writeTimerStatusSnapshot(options = {}) {
  const outputPath = options.outputPath;
  if (typeof outputPath !== "string" || outputPath.trim() === "") {
    throw new Error("outputPath is required");
  }

  const fileSystem = options.fs || fs;
  const payload = buildTimerStatusPayload(options.timer, { now: options.now });
  atomicWriteJson(fileSystem, outputPath, payload);

  return {
    outputPath,
    payload
  };
}

function stopTimerStatusSnapshot(timerState, options = {}) {
  const stop = options.stopTimer || stopTimer;
  const stoppedTimer = stop(timerState, options);

  return {
    timer: stoppedTimer,
    status: writeTimerStatusSnapshot({
      outputPath: options.outputPath,
      timer: stoppedTimer,
      now: options.statusNow || options.now,
      fs: options.fs
    })
  };
}

function resetTimerStatusSnapshot(timerState, options = {}) {
  const reset = options.resetTimer || resetTimer;
  const resetTimerResult = reset(timerState, options);

  return {
    timer: resetTimerResult,
    status: writeTimerStatusSnapshot({
      outputPath: options.outputPath,
      timer: resetTimerResult,
      now: options.statusNow || options.now,
      fs: options.fs
    })
  };
}

function refreshTimerStatusSnapshot(timerState, options = {}) {
  const completeElapsed = options.completeTimerIfElapsed || completeTimerIfElapsed;
  const timer = completeElapsed(timerState, options);

  return {
    timer,
    status: writeTimerStatusSnapshot({
      outputPath: options.outputPath,
      timer,
      now: options.statusNow || options.now,
      fs: options.fs
    })
  };
}

module.exports = {
  refreshTimerStatusSnapshot,
  resetTimerStatusSnapshot,
  stopTimerStatusSnapshot,
  writeTimerStatusSnapshot
};
