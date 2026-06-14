#!/usr/bin/env node

const assert = require("node:assert");
const { parseTimerDuration } = require("../src/timer-duration");
const {
  TIMER_STATES,
  createTimerId,
  createTimerState,
  startTimer
} = require("../src/timer-state");

const timerState = createTimerState();
assert.deepEqual(timerState, { activeTimer: null }, "timer state should start without an active timer");

const normalizedFiveMinutes = parseTimerDuration("5m");
assert.equal(normalizedFiveMinutes.ok, true, "fixture duration should parse before starting timer");

const startedTimer = startTimer(timerState, normalizedFiveMinutes, {
  now: () => new Date("2026-06-14T00:00:00.000Z")
});

assert.strictEqual(startedTimer, timerState.activeTimer, "startTimer should record and return the running active timer");
assert.deepEqual(
  startedTimer,
  {
    id: "timer-20260614000000000-300s",
    durationSeconds: 300,
    remainingSeconds: 300,
    state: TIMER_STATES.RUNNING,
    startedAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
    displayText: "5m",
    error: "",
    replacedPrevious: false
  },
  "valid normalized duration should produce deterministic running timer state"
);

const replacementTimer = startTimer(timerState, parseTimerDuration("90s"), {
  id: "timer-custom-id",
  now: () => "2026-06-14T00:01:00.000Z"
});

assert.deepEqual(
  replacementTimer,
  {
    id: "timer-custom-id",
    durationSeconds: 90,
    remainingSeconds: 90,
    state: TIMER_STATES.RUNNING,
    startedAt: "2026-06-14T00:01:00.000Z",
    updatedAt: "2026-06-14T00:01:00.000Z",
    displayText: "1m 30s",
    error: "",
    replacedPrevious: true
  },
  "starting while a timer is running should deterministically replace it"
);
assert.strictEqual(timerState.activeTimer, replacementTimer, "replacement should become the only active timer");
assert.equal(createTimerId("2026-06-14T00:01:00.000Z", 90), "timer-20260614000100000-90s");

const doneTimerState = createTimerState({
  id: "done",
  durationSeconds: 1,
  remainingSeconds: 0,
  state: TIMER_STATES.DONE,
  startedAt: "2026-06-14T00:00:00.000Z",
  updatedAt: "2026-06-14T00:00:01.000Z",
  displayText: "Done",
  error: "",
  replacedPrevious: false
});
const afterDoneTimer = startTimer(doneTimerState, parseTimerDuration("1s"), {
  now: () => "2026-06-14T00:02:00.000Z"
});
assert.equal(afterDoneTimer.replacedPrevious, false, "only an actively running timer counts as replaced");

assert.throws(
  () => startTimer(null, normalizedFiveMinutes),
  /timerState must be an object/,
  "missing timer state should fail predictably"
);
assert.throws(
  () => startTimer(createTimerState(), { ok: false, error: "bad" }),
  /normalized timer duration must include positive durationSeconds/,
  "invalid normalized duration should fail predictably"
);
assert.throws(
  () => startTimer(createTimerState(), normalizedFiveMinutes, { now: () => "not-a-date" }),
  /timer timestamp must be a valid date/,
  "invalid clock output should fail predictably"
);

console.log("Timer state test passed.");
