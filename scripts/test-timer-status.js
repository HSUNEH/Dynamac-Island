#!/usr/bin/env node

const assert = require("node:assert");
const { validateStatusPayload } = require("../src/status-schema");
const { parseTimerDuration } = require("../src/timer-duration");
const { createTimerState, startTimer } = require("../src/timer-state");
const {
  buildTimerStatusPayload,
  remainingSecondsForTimer,
  timerToNativeStatus
} = require("../src/timer-status");

const timerState = createTimerState();
const timer = startTimer(timerState, parseTimerDuration("5m"), {
  now: () => "2026-06-14T00:00:00.000Z"
});

assert.equal(
  remainingSecondsForTimer(timer, "2026-06-14T00:00:30.250Z"),
  270,
  "remaining duration should be derived from startedAt and the supplied clock"
);

const status = timerToNativeStatus(timer, {
  now: "2026-06-14T00:00:30.250Z"
});

assert.deepEqual(
  status,
  {
    agent: "Timer",
    state: "running",
    task: "Timer · 4m 30s remaining",
    updatedAt: "2026-06-14T00:00:00.000Z",
    detail: "4m 30s remaining of 5m.",
    timer: {
      id: "timer-20260614000000000-300s",
      durationSeconds: 300,
      remainingSeconds: 270,
      state: "running",
      startedAt: "2026-06-14T00:00:00.000Z",
      updatedAt: "2026-06-14T00:00:00.000Z",
      displayText: "5m",
      error: "",
      replacedPrevious: false
    }
  },
  "running timer should map to a deterministic native status item with remaining duration fields"
);

const replacementTimer = startTimer(timerState, parseTimerDuration("90s"), {
  now: () => "2026-06-14T00:01:00.000Z"
});
const replacementStatus = timerToNativeStatus(replacementTimer, {
  now: "2026-06-14T00:01:15.000Z"
});
assert.equal(replacementStatus.state, "running");
assert.equal(replacementStatus.timer.remainingSeconds, 75);
assert.equal(replacementStatus.timer.replacedPrevious, true, "replacement metadata should survive status mapping");

const payload = buildTimerStatusPayload(timer, {
  now: "2026-06-14T00:00:30.250Z"
});
const validation = validateStatusPayload(payload);
assert.equal(validation.ok, true, "timer status payload should pass shared status schema validation");
assert.deepEqual(validation.errors, []);
assert.equal(validation.statuses[0].timer.remainingSeconds, 270);
assert.equal(validation.statuses[0].timer.durationSeconds, 300);

assert.deepEqual(buildTimerStatusPayload(null), { statuses: [] }, "no active timer should map to an empty additive payload");
assert.throws(
  () => timerToNativeStatus({ ...timer, durationSeconds: 0 }, { now: "2026-06-14T00:00:00.000Z" }),
  /timer\.durationSeconds must be a positive integer/,
  "invalid timer status inputs should fail predictably"
);
assert.throws(
  () => timerToNativeStatus({ ...timer, startedAt: "bad" }, { now: "2026-06-14T00:00:00.000Z" }),
  /timer\.startedAt must be a valid date/,
  "invalid timer timestamps should fail predictably"
);

console.log("Timer native status mapping test passed.");
