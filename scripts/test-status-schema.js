#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { REQUIRED_FIELDS, STATES, validateStatusPayload } = require("../src/status-schema");

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
  "fixture should include the MVP mock agents"
);

console.log(`Status schema test passed: ${validFixturePath}`);
