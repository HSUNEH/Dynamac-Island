#!/usr/bin/env node

const assert = require("node:assert");
const { formatTimerDuration, parseTimerDuration } = require("../src/timer-duration");

const validCases = [
  ["5m", 300, "5m"],
  ["90s", 90, "1m 30s"],
  ["2h", 7200, "2h"],
  [" 15 minutes ", 900, "15m"],
  ["1 hr", 3600, "1h"]
];

for (const [input, durationSeconds, displayText] of validCases) {
  assert.deepEqual(
    parseTimerDuration(input),
    {
      ok: true,
      input: String(input).trim(),
      durationSeconds,
      displayText
    },
    `${input} should normalize to ${durationSeconds} seconds`
  );
}

assert.equal(formatTimerDuration(3661), "1h 1m 1s");
assert.equal(formatTimerDuration(60), "1m");
assert.equal(formatTimerDuration(1), "1s");

const invalidCases = [
  ["abc", "Timer duration must be a positive whole number followed by s, m, or h."],
  ["0s", "Timer duration must be greater than 0 seconds."],
  ["5d", "Timer duration unit must be s, m, or h."],
  ["1.5m", "Timer duration must be a positive whole number followed by s, m, or h."]
];

for (const [input, error] of invalidCases) {
  assert.deepEqual(
    parseTimerDuration(input),
    { ok: false, error },
    `${input} should fail with a stable parser error`
  );
}

console.log("Timer duration parser test passed.");
