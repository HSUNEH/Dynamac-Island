#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createAppState,
  updateAppStateFromStatusPayload
} = require("../src/app-state");
const { loadStatusFile } = require("../src/status-loader");
const { parseTimerDuration } = require("../src/timer-duration");
const {
  createTimerState,
  startTimer
} = require("../src/timer-state");
const {
  refreshTimerStatusSnapshot,
  resetTimerStatusSnapshot,
  stopTimerStatusSnapshot,
  writeTimerStatusSnapshot
} = require("../src/timer-status-store");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dynamac-timer-app-status-"));
const statusPath = path.join(tempDir, "status.json");

function applyStatusFileToAppState(appState, now) {
  const payload = loadStatusFile(statusPath);
  assert.equal(payload.ok, true, `timer status payload should validate before app-state update: ${payload.errors.join(", ")}`);

  updateAppStateFromStatusPayload(appState, payload, { now: () => now });

  assert.equal(appState.status.source, statusPath, "app state should retain the watched status model source path");
  assert.equal(appState.lastAppliedAt, now, "app state should stamp each timer model application deterministically");
  assert.equal(appState.status.statuses.length, 1, "app state should expose exactly one Timer status item to the overlay");
  return appState.status.statuses[0];
}

function assertTimerStatus(status, expected) {
  assert.equal(status.agent, "Timer", "overlay status model should identify the Timer activity");
  assert.equal(status.state, expected.statusState, "overlay status model should expose the current Timer presentation state");
  assert.equal(status.task, expected.task, "overlay status model should expose deterministic compact/expanded task text");
  assert.equal(status.detail, expected.detail, "overlay status model should expose deterministic expanded detail text");
  assert.equal(status.updatedAt, expected.updatedAt, "overlay status model should expose deterministic status update time");

  assert.equal(status.timer.id, expected.id, "timer status model should preserve the stable timer id");
  assert.equal(status.timer.durationSeconds, expected.durationSeconds, "timer status model should expose original durationSeconds");
  assert.equal(status.timer.remainingSeconds, expected.remainingSeconds, "timer status model should expose transition-specific remainingSeconds");
  assert.equal(status.timer.state, expected.timerState, "timer status model should expose transition-specific lifecycle state");
  assert.equal(status.timer.startedAt, expected.startedAt, "timer status model should expose startedAt for native countdown derivation");
  assert.equal(status.timer.updatedAt, expected.updatedAt, "timer status model should expose updatedAt for native freshness checks");
  assert.equal(status.timer.displayText, expected.displayText, "timer status model should expose stable compact display text");
  assert.equal(status.timer.error, "", "valid timer transitions should keep the timer error field stable and empty");
  assert.equal(status.timer.replacedPrevious, expected.replacedPrevious, "timer status model should expose replacement metadata");
}

try {
  const appState = createAppState();
  const timerState = createTimerState();
  const timer = startTimer(timerState, parseTimerDuration("5m"), {
    id: "timer-app-status-model-test",
    now: () => "2026-06-14T00:00:00.000Z"
  });

  writeTimerStatusSnapshot({
    outputPath: statusPath,
    timer,
    now: "2026-06-14T00:01:00.000Z"
  });
  assertTimerStatus(applyStatusFileToAppState(appState, "2026-06-14T00:01:00.500Z"), {
    id: "timer-app-status-model-test",
    statusState: "running",
    timerState: "running",
    task: "Timer · 4m remaining",
    detail: "4m remaining of 5m.",
    durationSeconds: 300,
    remainingSeconds: 240,
    startedAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
    displayText: "5m",
    replacedPrevious: false
  });

  stopTimerStatusSnapshot(timerState, {
    outputPath: statusPath,
    now: () => "2026-06-14T00:02:00.000Z",
    statusNow: "2026-06-14T00:02:00.000Z"
  });
  assertTimerStatus(applyStatusFileToAppState(appState, "2026-06-14T00:02:00.500Z"), {
    id: "timer-app-status-model-test",
    statusState: "idle",
    timerState: "stopped",
    task: "Timer · 3m remaining",
    detail: "3m remaining of 5m.",
    durationSeconds: 300,
    remainingSeconds: 180,
    startedAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:02:00.000Z",
    displayText: "5m",
    replacedPrevious: false
  });

  resetTimerStatusSnapshot(timerState, {
    outputPath: statusPath,
    now: () => "2026-06-14T00:03:00.000Z",
    statusNow: "2026-06-14T00:03:00.000Z"
  });
  assertTimerStatus(applyStatusFileToAppState(appState, "2026-06-14T00:03:00.500Z"), {
    id: "timer-app-status-model-test",
    statusState: "idle",
    timerState: "reset",
    task: "Timer · 5m remaining",
    detail: "5m remaining of 5m.",
    durationSeconds: 300,
    remainingSeconds: 300,
    startedAt: "2026-06-14T00:03:00.000Z",
    updatedAt: "2026-06-14T00:03:00.000Z",
    displayText: "5m",
    replacedPrevious: false
  });

  const doneTimerState = createTimerState();
  startTimer(doneTimerState, parseTimerDuration("2s"), {
    id: "timer-app-status-model-done-test",
    now: () => "2026-06-14T00:04:00.000Z"
  });
  refreshTimerStatusSnapshot(doneTimerState, {
    outputPath: statusPath,
    now: () => "2026-06-14T00:04:03.000Z",
    statusNow: "2026-06-14T00:04:03.000Z"
  });
  assertTimerStatus(applyStatusFileToAppState(appState, "2026-06-14T00:04:03.500Z"), {
    id: "timer-app-status-model-done-test",
    statusState: "success",
    timerState: "done",
    task: "Timer done",
    detail: "2s timer elapsed.",
    durationSeconds: 2,
    remainingSeconds: 0,
    startedAt: "2026-06-14T00:04:00.000Z",
    updatedAt: "2026-06-14T00:04:03.000Z",
    displayText: "Done",
    replacedPrevious: false
  });
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("Timer app/status model transition test passed.");
