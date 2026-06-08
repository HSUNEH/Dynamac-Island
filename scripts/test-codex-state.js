#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {
  CODEX_AGENT,
  MOCK_CODEX_STATE,
  parseCodexState
} = require("../src/codex-state");

const validFixturePath = path.resolve("fixtures/valid-status.json");
const validPayload = JSON.parse(fs.readFileSync(validFixturePath, "utf8"));
const validResult = parseCodexState(validPayload);

assert.equal(validResult.ok, true, "valid fixture should parse into a Codex model");
assert.deepEqual(validResult.errors, [], "valid fixture should not return Codex errors");
assert.deepEqual(validResult.codex, {
  agent: CODEX_AGENT,
  state: "success",
  task: "Built MVP shell",
  updatedAt: "2026-06-08T12:01:00.000Z",
  detail: "Renderer, preload, and status validation are wired.",
  isMock: false
});

const missingCodexResult = parseCodexState({
  statuses: [
    {
      agent: "Snuffles",
      state: "running",
      task: "Watching desktop context",
      updatedAt: "2026-06-08T12:00:00.000Z",
      detail: "No Codex row was emitted by this fixture."
    }
  ]
});

assert.equal(
  missingCodexResult.ok,
  true,
  "a watched JSON file without Codex should still produce a mock state"
);
assert.deepEqual(
  missingCodexResult.codex,
  MOCK_CODEX_STATE,
  "missing Codex should use the deterministic mock state"
);

const missingFieldsResult = parseCodexState({
  statuses: [
    {
      agent: "Codex",
      state: "running",
      updatedAt: "2026-06-08T12:04:00.000Z",
      detail: "Task is intentionally absent."
    }
  ]
});

assert.equal(missingFieldsResult.ok, false, "missing Codex fields should fail validation");
assert.equal(missingFieldsResult.codex, null, "invalid Codex input should not return a model");
assert.deepEqual(missingFieldsResult.errors, [
  "statuses[0].task must be a non-empty string."
]);

console.log("Codex state test passed.");
