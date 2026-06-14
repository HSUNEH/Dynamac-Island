#!/usr/bin/env node

const assert = require("node:assert");
const { parseTimerDuration } = require("../src/timer-duration");
const {
  TIMER_STATES,
  createTimerId,
  createTimerState,
  resetTimer,
  stopTimer,
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

const runningStopState = createTimerState({ ...replacementTimer });
const stoppedTimer = stopTimer(runningStopState, {
  now: () => "2026-06-14T00:01:30.000Z"
});
assert.deepEqual(
  stoppedTimer,
  {
    id: "timer-custom-id",
    durationSeconds: 90,
    remainingSeconds: 60,
    state: TIMER_STATES.STOPPED,
    startedAt: "2026-06-14T00:01:00.000Z",
    updatedAt: "2026-06-14T00:01:30.000Z",
    displayText: "1m 30s",
    error: "",
    replacedPrevious: true
  },
  "stopping a running timer should preserve deterministic remaining time at the stop instant"
);
assert.strictEqual(runningStopState.activeTimer, stoppedTimer, "stopped timer should remain inspectable as the active timer record");

const startAfterStop = startTimer(runningStopState, parseTimerDuration("1s"), {
  now: () => "2026-06-14T00:02:00.000Z"
});
assert.equal(startAfterStop.replacedPrevious, false, "starting after a stopped timer should not report running replacement");

replacementTimer.remainingSeconds = 12;
replacementTimer.state = "paused";
replacementTimer.error = "stale error";
const resetTimerResult = resetTimer(timerState, {
  now: () => "2026-06-14T00:01:30.000Z"
});
assert.strictEqual(resetTimerResult, timerState.activeTimer, "resetTimer should replace the active timer with the reset timer state");
assert.deepEqual(
  resetTimerResult,
  {
    id: "timer-custom-id",
    durationSeconds: 90,
    remainingSeconds: 90,
    state: TIMER_STATES.RESET,
    startedAt: "2026-06-14T00:01:30.000Z",
    updatedAt: "2026-06-14T00:01:30.000Z",
    displayText: "1m 30s",
    error: "",
    replacedPrevious: true
  },
  "resetTimer should restore the configured initial duration and clear running or paused state"
);

const emptyTimerState = createTimerState();
assert.equal(resetTimer(emptyTimerState), null, "resetTimer should no-op predictably when no timer is configured");
assert.deepEqual(emptyTimerState, { activeTimer: null }, "resetTimer should leave an empty timer state unchanged");

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
  () => resetTimer(null),
  /timerState must be an object/,
  "reset should fail predictably without timer state"
);
assert.throws(
  () => stopTimer(null),
  /timerState must be an object/,
  "stop should fail predictably without timer state"
);
assert.throws(
  () => resetTimer(createTimerState({ durationSeconds: 0 })),
  /normalized timer duration must include positive durationSeconds/,
  "reset should fail predictably when the configured duration is invalid"
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
