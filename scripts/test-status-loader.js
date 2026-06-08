#!/usr/bin/env node

const assert = require("node:assert");
const path = require("node:path");
const { loadStatusFile } = require("../src/status-loader");

const validFixturePath = path.resolve("fixtures/valid-status.json");
const result = loadStatusFile(validFixturePath);

assert.equal(result.ok, true, "valid fixture should load and validate");
assert.equal(result.source, validFixturePath);
assert.equal(result.errors.length, 0, "valid fixture should not report errors");
assert.equal(result.statuses.length, 3, "valid fixture should contain three statuses");
assert.deepEqual(
  result.statuses.map((status) => status.agent),
  ["Snuffles", "Codex", "Ouroboros"]
);
assert.deepEqual(
  result.statuses.map((status) => status.state),
  ["running", "success", "warning"]
);

console.log(`Status loader test passed: ${validFixturePath}`);
