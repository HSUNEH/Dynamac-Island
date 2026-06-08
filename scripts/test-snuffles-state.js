#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {
  MOCK_SNUFFLES_STATE,
  SNUFFLES_AGENT,
  parseSnufflesState
} = require("../src/snuffles-state");

const validFixturePath = path.resolve("fixtures/valid-status.json");
const validPayload = JSON.parse(fs.readFileSync(validFixturePath, "utf8"));
const validResult = parseSnufflesState(validPayload);

assert.equal(validResult.ok, true, "valid fixture should parse into a Snuffles model");
assert.deepEqual(validResult.errors, [], "valid fixture should not return Snuffles errors");
assert.deepEqual(validResult.snuffles, {
  agent: SNUFFLES_AGENT,
  state: "running",
  task: "Watching desktop context",
  updatedAt: "2026-06-08T12:00:00.000Z",
  detail: "Sampling local status events for the island preview.",
  isMock: false
});

const missingSnufflesResult = parseSnufflesState({
  statuses: [
    {
      agent: "Codex",
      state: "success",
      task: "Finished local check",
      updatedAt: "2026-06-08T12:03:00.000Z",
      detail: "No Snuffles row was emitted by this fixture."
    }
  ]
});

assert.equal(
  missingSnufflesResult.ok,
  true,
  "a watched JSON file without Snuffles should still produce a mock state"
);
assert.deepEqual(
  missingSnufflesResult.snuffles,
  MOCK_SNUFFLES_STATE,
  "missing Snuffles should use the deterministic mock state"
);

const missingFieldsResult = parseSnufflesState({
  statuses: [
    {
      agent: "Snuffles",
      state: "running",
      updatedAt: "2026-06-08T12:04:00.000Z",
      detail: "Task is intentionally absent."
    }
  ]
});

assert.equal(missingFieldsResult.ok, false, "missing Snuffles fields should fail validation");
assert.equal(missingFieldsResult.snuffles, null, "invalid Snuffles input should not return a model");
assert.deepEqual(missingFieldsResult.errors, [
  "statuses[0].task must be a non-empty string."
]);

console.log("Snuffles state test passed.");
