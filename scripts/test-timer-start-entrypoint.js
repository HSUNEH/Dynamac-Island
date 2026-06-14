#!/usr/bin/env node

const assert = require("node:assert");
const { createTimerState } = require("../src/timer-state");
const { startTimerFromInput } = require("../src/timer-start-entrypoint");

const timerState = createTimerState();
const parseCalls = [];
const forwardedDurations = [];

const result = startTimerFromInput(timerState, " 5m ", {
  now: () => new Date("2026-06-14T00:00:00.000Z"),
  parseDuration: (rawInput) => {
    parseCalls.push(rawInput);
    return {
      ok: true,
      input: String(rawInput).trim(),
      durationSeconds: 300,
      displayText: "5m"
    };
  },
  startTimer: (state, normalizedDuration, options) => {
    forwardedDurations.push(normalizedDuration);
    return {
      id: "timer-entrypoint-test",
      durationSeconds: normalizedDuration.durationSeconds,
      remainingSeconds: normalizedDuration.durationSeconds,
      state: "running",
      startedAt: options.now().toISOString(),
      updatedAt: options.now().toISOString(),
      displayText: normalizedDuration.displayText,
      error: "",
      replacedPrevious: false,
      stateWasForwarded: state === timerState
    };
  }
});

assert.deepEqual(parseCalls, [" 5m "], "start entrypoint should pass the raw user input to the parser unchanged");
assert.deepEqual(
  forwardedDurations,
  [
    {
      ok: true,
      input: "5m",
      durationSeconds: 300,
      displayText: "5m"
    }
  ],
  "start entrypoint should forward the successful normalized duration to the timer core"
);
assert.deepEqual(
  result,
  {
    ok: true,
    timer: {
      id: "timer-entrypoint-test",
      durationSeconds: 300,
      remainingSeconds: 300,
      state: "running",
      startedAt: "2026-06-14T00:00:00.000Z",
      updatedAt: "2026-06-14T00:00:00.000Z",
      displayText: "5m",
      error: "",
      replacedPrevious: false,
      stateWasForwarded: true
    }
  },
  "valid input should return the started timer"
);

const invalidState = createTimerState();
const invalidForwards = [];
const invalidResult = startTimerFromInput(invalidState, "abc", {
  parseDuration: (rawInput) => {
    assert.equal(rawInput, "abc", "invalid input should still reach parser in raw form");
    return {
      ok: false,
      error: "Timer duration must be a positive whole number followed by s, m, or h."
    };
  },
  startTimer: (...args) => invalidForwards.push(args)
});

assert.deepEqual(invalidForwards, [], "start entrypoint must not forward failed parse results to startTimer");
assert.deepEqual(
  invalidResult,
  {
    ok: false,
    error: "Timer duration must be a positive whole number followed by s, m, or h."
  },
  "invalid input should return the stable parser error"
);
assert.deepEqual(invalidState, { activeTimer: null }, "invalid input should not mutate timer state");

const realState = createTimerState();
const realResult = startTimerFromInput(realState, "90s", {
  id: "timer-real-path",
  now: () => "2026-06-14T00:01:00.000Z"
});

assert.equal(realResult.ok, true, "real parser + core path should start a valid timer");
assert.deepEqual(realResult.timer, {
  id: "timer-real-path",
  durationSeconds: 90,
  remainingSeconds: 90,
  state: "running",
  startedAt: "2026-06-14T00:01:00.000Z",
  updatedAt: "2026-06-14T00:01:00.000Z",
  displayText: "1m 30s",
  error: "",
  replacedPrevious: false
});
assert.strictEqual(realState.activeTimer, realResult.timer, "real path should record the active timer");

console.log("Timer start entrypoint integration test passed.");
