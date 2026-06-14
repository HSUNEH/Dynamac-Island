#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {
  REQUIRED_FIELDS,
  STATES,
  TIMER_REQUIRED_FIELDS,
  TIMER_STATES,
  validateStatusPayload
} = require("../src/status-schema");

const validFixturePath = path.resolve("fixtures/valid-status.json");
const parsedFixture = JSON.parse(fs.readFileSync(validFixturePath, "utf8"));
const result = validateStatusPayload(parsedFixture);

assert.equal(result.ok, true, "parsed valid fixture should pass status validation");
assert.deepEqual(result.errors, [], "parsed valid fixture should not report errors");
assert.equal(result.statuses.length, 3, "parsed valid fixture should expose three statuses");

for (const [index, status] of result.statuses.entries()) {
  for (const field of REQUIRED_FIELDS) {
    assert.equal(
      typeof status[field],
      "string",
      `statuses[${index}].${field} should be a string`
    );
    assert.notEqual(status[field].trim(), "", `statuses[${index}].${field} should not be empty`);
  }

  assert.equal(STATES.has(status.state), true, `statuses[${index}].state should be allowed`);
}

assert.deepEqual(
  result.statuses.map((status) => status.agent),
  ["Snuffles", "Codex", "Ouroboros"],
  "fixture should include the MVP sample agents"
);

const timerFixturePath = path.resolve("fixtures/timer-running-status.json");
const parsedTimerFixture = JSON.parse(fs.readFileSync(timerFixturePath, "utf8"));
const timerResult = validateStatusPayload(parsedTimerFixture);
const timerStatus = timerResult.statuses.find((status) => status.agent === "Timer");

assert.equal(timerResult.ok, true, "timer fixture should pass deterministic Timer status validation");
assert.deepEqual(timerResult.errors, [], "timer fixture should not report timer validation errors");
assert.ok(timerStatus, "timer fixture should expose a Timer status item");

for (const field of TIMER_REQUIRED_FIELDS) {
  assert.equal(
    Object.prototype.hasOwnProperty.call(timerStatus.timer, field),
    true,
    `timer fixture should include timer.${field}`
  );
}

assert.equal(TIMER_STATES.has(timerStatus.timer.state), true, "timer lifecycle state should be allowed");

const invalidTimerResult = validateStatusPayload({
  statuses: [
    {
      agent: "Timer",
      state: "running",
      task: "Timer · invalid",
      updatedAt: "2026-06-14T00:00:00.000Z",
      detail: "Invalid timer payload should be rejected.",
      timer: {
        id: "",
        durationSeconds: 300,
        remainingSeconds: 301,
        state: "playing",
        startedAt: "bad-date",
        updatedAt: "2026-06-14T00:00:00.000Z",
        displayText: "",
        error: null,
        replacedPrevious: "false"
      }
    }
  ]
});

assert.equal(invalidTimerResult.ok, false, "invalid Timer status artifact should fail validation");
assert.deepEqual(
  invalidTimerResult.errors,
  [
    "statuses[0].timer.id must be a non-empty string.",
    "statuses[0].timer.remainingSeconds must not exceed durationSeconds.",
    "statuses[0].timer.state must be one of idle, running, stopped, reset, done.",
    "statuses[0].timer.startedAt must be an ISO-8601 UTC timestamp.",
    "statuses[0].timer.displayText must be a non-empty string.",
    "statuses[0].timer.error must be a string.",
    "statuses[0].timer.replacedPrevious must be a boolean."
  ],
  "invalid Timer status artifacts should report stable deterministic errors"
);

console.log(`Status schema test passed: ${validFixturePath}`);
