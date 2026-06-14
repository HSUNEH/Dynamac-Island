#!/usr/bin/env node

const assert = require("node:assert");
const {
  createTimerCountdown,
  formatTimerClock
} = require("../src/timer-countdown");

const runningTimer = {
  id: "timer-countdown-test",
  durationSeconds: 300,
  remainingSeconds: 300,
  state: "running",
  startedAt: "2026-06-14T00:00:00.000Z",
  updatedAt: "2026-06-14T00:00:00.000Z",
  displayText: "5m",
  error: "",
  replacedPrevious: false
};

const advancedCountdown = createTimerCountdown(runningTimer, {
  now: "2026-06-14T00:01:05.900Z"
});

assert.deepEqual(
  advancedCountdown,
  {
    durationSeconds: 300,
    remainingSeconds: 235,
    elapsedSeconds: 65,
    progressPercent: 22,
    state: "running",
    isDone: false,
    compactText: "3:55"
  },
  "running timer countdown should derive compact text and progress from the supplied clock"
);

assert.deepEqual(
  createTimerCountdown(runningTimer, { now: "2026-06-14T00:05:01.000Z" }),
  {
    durationSeconds: 300,
    remainingSeconds: 0,
    elapsedSeconds: 300,
    progressPercent: 100,
    state: "done",
    isDone: true,
    compactText: "0:00"
  },
  "elapsed running timer should clamp to done countdown text"
);

const stoppedCountdown = createTimerCountdown(
  {
    ...runningTimer,
    state: "stopped",
    remainingSeconds: 42
  },
  { now: "2026-06-14T00:04:30.000Z" }
);
assert.equal(stoppedCountdown.remainingSeconds, 42, "non-running timer should preserve stored remaining time");
assert.equal(stoppedCountdown.compactText, "0:42", "non-running compact text should still format stored remaining time");
assert.equal(stoppedCountdown.state, "stopped");

assert.equal(formatTimerClock(3661), "1:01:01", "compact clock should include hours when needed");
assert.throws(
  () => createTimerCountdown({ ...runningTimer, durationSeconds: 0 }, { now: "2026-06-14T00:00:00.000Z" }),
  /timer.durationSeconds must be a positive integer/,
  "invalid timer duration should fail predictably"
);
assert.throws(
  () => createTimerCountdown({ ...runningTimer, startedAt: "bad" }, { now: "2026-06-14T00:00:00.000Z" }),
  /timer.startedAt must be a valid date/,
  "invalid running timer timestamp should fail predictably"
);

console.log("Timer countdown test passed.");
