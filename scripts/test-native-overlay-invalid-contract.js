#!/usr/bin/env node

const assert = require("node:assert");
const {
  activeNativeTimerStatus,
  validateNativeOverlayStatusContract
} = require("../src/native-overlay-contract");

function assertRejectedWithoutThrow(name, payload, expectedErrors) {
  assert.doesNotThrow(
    () => validateNativeOverlayStatusContract(payload),
    `${name} should be rejected through contract errors instead of throwing`
  );

  const result = validateNativeOverlayStatusContract(payload);
  assert.equal(result.ok, false, `${name} should fail the native overlay Timer contract`);
  assert.equal(result.activeTimerStatus, null, `${name} should not expose an active Timer status`);
  assert.ok(Array.isArray(result.statuses), `${name} should return a safe statuses array`);

  for (const expectedError of expectedErrors) {
    assert.ok(
      result.errors.includes(expectedError),
      `${name} should include stable error: ${expectedError}\nActual errors: ${result.errors.join("\n")}`
    );
  }
}

assertRejectedWithoutThrow("null payload", null, [
  "Status JSON must be an array or an object with a statuses array."
]);

assertRejectedWithoutThrow("non-array statuses", { statuses: "invalid" }, [
  "Status JSON must be an array or an object with a statuses array."
]);

assertRejectedWithoutThrow("missing Timer details", {
  statuses: [
    {
      agent: "Now Playing",
      state: "running",
      task: "Song",
      updatedAt: "2026-06-14T00:00:00.000Z",
      detail: "No Timer payload"
    }
  ]
}, [
  "Native overlay status contract must include a Timer status item with timer details."
]);

assertRejectedWithoutThrow("Timer item with non-object timer", {
  statuses: [
    {
      agent: "Timer",
      state: "running",
      task: "Timer · invalid",
      updatedAt: "2026-06-14T00:00:00.000Z",
      detail: "Invalid Timer payload",
      timer: "invalid"
    }
  ]
}, [
  "statuses[0].timer must be an object for Timer status items."
]);

assertRejectedWithoutThrow("Timer item with invalid field values", {
  statuses: [
    {
      agent: "Timer",
      state: "running",
      task: "Timer · invalid",
      updatedAt: "2026-06-14T00:00:00.000Z",
      detail: "Invalid Timer payload",
      timer: {
        id: "",
        durationSeconds: 0,
        remainingSeconds: 5,
        state: "paused",
        startedAt: "not-a-date",
        updatedAt: "2026-06-14T00:00:00.000Z",
        displayText: "",
        error: 404,
        replacedPrevious: "no"
      }
    }
  ]
}, [
  "statuses[0].timer.id must be a non-empty string.",
  "statuses[0].timer.durationSeconds must be a positive integer.",
  "statuses[0].timer.state must be one of idle, running, stopped, reset, done.",
  "statuses[0].timer.startedAt must be an ISO-8601 UTC timestamp.",
  "statuses[0].timer.displayText must be a non-empty string.",
  "statuses[0].timer.error must be a string.",
  "statuses[0].timer.replacedPrevious must be a boolean."
]);

assert.equal(activeNativeTimerStatus(null), null, "helper should safely ignore null status lists");
assert.equal(activeNativeTimerStatus({}), null, "helper should safely ignore non-array status lists");
assert.equal(activeNativeTimerStatus([]), undefined, "helper should preserve find() semantics for empty valid lists");

console.log("Native overlay invalid Timer contract test passed.");
