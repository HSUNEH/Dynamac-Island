#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {
  OUROBOROS_AGENT,
  parseOuroborosState
} = require("../src/ouroboros-state");

const validFixturePath = path.resolve("fixtures/valid-status.json");
const validPayload = JSON.parse(fs.readFileSync(validFixturePath, "utf8"));
const validResult = parseOuroborosState(validPayload);

assert.equal(validResult.ok, true, "valid fixture should parse into an Ouroboros model");
assert.deepEqual(validResult.errors, [], "valid fixture should not return Ouroboros errors");
assert.deepEqual(validResult.ouroboros, {
  agent: OUROBOROS_AGENT,
  state: "warning",
  task: "Waiting for handoff",
  updatedAt: "2026-06-08T12:02:00.000Z",
  detail: "Runbook is ready; external integrations are intentionally out of scope.",
  isMock: false
});

const missingOuroborosResult = parseOuroborosState({
  statuses: [
    {
      agent: "Codex",
      state: "success",
      task: "Finished local check",
      updatedAt: "2026-06-08T12:03:00.000Z",
      detail: "No Ouroboros row was emitted by this fixture."
    }
  ]
});

assert.equal(
  missingOuroborosResult.ok,
  true,
  "a watched JSON file without Ouroboros should parse without inventing a fallback state"
);
assert.deepEqual(
  missingOuroborosResult.ouroboros,
  null,
  "missing Ouroboros should not create synthetic status data"
);

const missingFieldsResult = parseOuroborosState({
  statuses: [
    {
      agent: "Ouroboros",
      state: "running",
      updatedAt: "2026-06-08T12:04:00.000Z",
      detail: "Task is intentionally absent."
    }
  ]
});

assert.equal(missingFieldsResult.ok, false, "missing Ouroboros fields should fail validation");
assert.equal(
  missingFieldsResult.ouroboros,
  null,
  "invalid Ouroboros input should not return a model"
);
assert.deepEqual(missingFieldsResult.errors, [
  "statuses[0].task must be a non-empty string."
]);

console.log("Ouroboros state test passed.");
