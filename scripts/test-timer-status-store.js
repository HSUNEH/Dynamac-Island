#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { loadStatusFile } = require("../src/status-loader");
const { parseTimerDuration } = require("../src/timer-duration");
const { createTimerState, startTimer } = require("../src/timer-state");
const { writeTimerStatusSnapshot } = require("../src/timer-status-store");

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

  assert.throws(
    () => writeTimerStatusSnapshot({ timer }),
    /outputPath is required/,
    "status writer should fail predictably without a destination store"
  );
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("Timer status store test passed.");
