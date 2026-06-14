#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { loadStatusFile } = require("../src/status-loader");
const { parseTimerDuration } = require("../src/timer-duration");
const { createTimerState, startTimer } = require("../src/timer-state");
const {
  refreshTimerStatusSnapshot,
  resetTimerStatusSnapshot,
  stopTimerStatusSnapshot,
  writeTimerStatusSnapshot
} = require("../src/timer-status-store");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dynamac-timer-status-"));
const outputPath = path.join(tempDir, "nested", "status.json");

try {
  const timerState = createTimerState();
  const timer = startTimer(timerState, parseTimerDuration("2m"), {
    id: "timer-status-store-test",
    now: () => "2026-06-14T00:00:00.000Z"
  });

  const result = writeTimerStatusSnapshot({
    outputPath,
    timer,
    now: "2026-06-14T00:00:15.000Z"
  });

  assert.equal(result.outputPath, outputPath, "status writer should return the native status store path");
  assert.equal(result.payload.statuses.length, 1, "status writer should produce one active Timer status item");
  assert.equal(result.payload.statuses[0].agent, "Timer");
  assert.equal(result.payload.statuses[0].state, "running");
  assert.equal(result.payload.statuses[0].task, "Timer · 1m 45s remaining");
  assert.equal(result.payload.statuses[0].timer.id, "timer-status-store-test");
  assert.equal(result.payload.statuses[0].timer.state, "running");
  assert.equal(result.payload.statuses[0].timer.remainingSeconds, 105);

  const loaded = loadStatusFile(outputPath);
  assert.equal(loaded.ok, true, "written Timer status store should pass the shared native status schema");
  assert.deepEqual(loaded.errors, []);
  assert.deepEqual(loaded.statuses, result.payload.statuses, "native status loader should read the active Timer model back unchanged");

  const stopOutputPath = path.join(tempDir, "nested", "stopped-status.json");
  const stopResult = stopTimerStatusSnapshot(timerState, {
    outputPath: stopOutputPath,
    now: () => "2026-06-14T00:00:30.000Z",
    statusNow: "2026-06-14T00:02:00.000Z"
  });

  assert.strictEqual(stopResult.timer, timerState.activeTimer, "store stop should persist the stopped timer as the inspectable active record");
  assert.equal(stopResult.timer.state, "stopped", "store stop should transition the active timer to stopped");
  assert.equal(stopResult.timer.remainingSeconds, 90, "store stop should freeze remaining time at the stop instant");
  assert.equal(stopResult.timer.updatedAt, "2026-06-14T00:00:30.000Z");
  assert.equal(stopResult.status.outputPath, stopOutputPath, "store stop should write to the requested native status path");
  assert.equal(stopResult.status.payload.statuses.length, 1, "stopped timer should remain visible as one inactive status item");
  assert.equal(stopResult.status.payload.statuses[0].state, "idle", "stopped timer native status should be inactive/idle");
  assert.equal(stopResult.status.payload.statuses[0].task, "Timer · 1m 30s remaining");
  assert.equal(stopResult.status.payload.statuses[0].timer.state, "stopped");
  assert.equal(stopResult.status.payload.statuses[0].timer.remainingSeconds, 90, "stopped timer status should not keep counting down after stop");

  const loadedStopped = loadStatusFile(stopOutputPath);
  assert.equal(loadedStopped.ok, true, "stopped Timer status store should pass the shared native status schema");
  assert.deepEqual(loadedStopped.errors, []);
  assert.deepEqual(loadedStopped.statuses, stopResult.status.payload.statuses, "native status loader should read the stopped Timer model back unchanged");

  const resetOutputPath = path.join(tempDir, "nested", "reset-status.json");
  const resetResult = resetTimerStatusSnapshot(timerState, {
    outputPath: resetOutputPath,
    now: () => "2026-06-14T00:01:00.000Z",
    statusNow: "2026-06-14T00:01:00.000Z"
  });

  assert.strictEqual(resetResult.timer, timerState.activeTimer, "store reset should persist the reset timer as the inspectable active record");
  assert.equal(resetResult.timer.state, "reset", "store reset should transition the active timer to reset");
  assert.equal(resetResult.timer.remainingSeconds, 120, "store reset should restore the full original duration");
  assert.equal(resetResult.timer.startedAt, "2026-06-14T00:01:00.000Z", "store reset should restart the timer timestamp deterministically");
  assert.equal(resetResult.timer.updatedAt, "2026-06-14T00:01:00.000Z", "store reset should stamp the reset update time deterministically");
  assert.equal(resetResult.status.outputPath, resetOutputPath, "store reset should write to the requested native status path");
  assert.equal(resetResult.status.payload.statuses.length, 1, "reset timer should remain visible as one inactive status item");
  assert.equal(resetResult.status.payload.statuses[0].state, "idle", "reset timer native status should be inactive/idle");
  assert.equal(resetResult.status.payload.statuses[0].task, "Timer · 2m remaining");
  assert.equal(resetResult.status.payload.statuses[0].timer.state, "reset");
  assert.equal(resetResult.status.payload.statuses[0].timer.remainingSeconds, 120, "reset timer status should immediately restore the full duration");

  const loadedReset = loadStatusFile(resetOutputPath);
  assert.equal(loadedReset.ok, true, "reset Timer status store should pass the shared native status schema");
  assert.deepEqual(loadedReset.errors, []);
  assert.deepEqual(loadedReset.statuses, resetResult.status.payload.statuses, "native status loader should read the reset Timer model back unchanged");

  const doneTimerState = createTimerState();
  startTimer(doneTimerState, parseTimerDuration("3s"), {
    id: "timer-status-store-done-test",
    now: () => "2026-06-14T00:02:00.000Z"
  });
  const doneOutputPath = path.join(tempDir, "nested", "done-status.json");
  const doneResult = refreshTimerStatusSnapshot(doneTimerState, {
    outputPath: doneOutputPath,
    now: () => "2026-06-14T00:02:03.000Z",
    statusNow: "2026-06-14T00:02:03.000Z"
  });

  assert.strictEqual(doneResult.timer, doneTimerState.activeTimer, "store refresh should persist the completed timer as the active record");
  assert.equal(doneResult.timer.state, "done", "store refresh should transition an elapsed running timer to done");
  assert.equal(doneResult.timer.remainingSeconds, 0, "done timer should persist zero remaining time");
  assert.equal(doneResult.timer.updatedAt, "2026-06-14T00:02:03.000Z", "done timer should be stamped at the completion check time");
  assert.equal(doneResult.status.outputPath, doneOutputPath, "store refresh should write done state to the requested native status path");
  assert.equal(doneResult.status.payload.statuses.length, 1, "done timer should remain visible as one completed status item");
  assert.equal(doneResult.status.payload.statuses[0].state, "success", "done timer native status should emit success");
  assert.equal(doneResult.status.payload.statuses[0].task, "Timer done");
  assert.equal(doneResult.status.payload.statuses[0].detail, "3s timer elapsed.");
  assert.equal(doneResult.status.payload.statuses[0].timer.state, "done");
  assert.equal(doneResult.status.payload.statuses[0].timer.remainingSeconds, 0);
  assert.equal(doneResult.status.payload.statuses[0].timer.updatedAt, "2026-06-14T00:02:03.000Z");

  const loadedDone = loadStatusFile(doneOutputPath);
  assert.equal(loadedDone.ok, true, "done Timer status store should pass the shared native status schema");
  assert.deepEqual(loadedDone.errors, []);
  assert.deepEqual(loadedDone.statuses, doneResult.status.payload.statuses, "native status loader should read the done Timer model back unchanged");

  const noTimerState = createTimerState();
  const emptyStopPath = path.join(tempDir, "nested", "empty-stopped-status.json");
  const emptyStopResult = stopTimerStatusSnapshot(noTimerState, {
    outputPath: emptyStopPath,
    now: () => "2026-06-14T00:03:00.000Z"
  });
  assert.equal(emptyStopResult.timer, null, "store stop should no-op predictably when no local timer is active");
  assert.deepEqual(emptyStopResult.status.payload, { statuses: [] }, "empty store stop should persist an empty additive Timer payload");

  assert.throws(
    () => writeTimerStatusSnapshot({ timer }),
    /outputPath is required/,
    "status writer should fail predictably without a destination store"
  );
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("Timer status store test passed.");
