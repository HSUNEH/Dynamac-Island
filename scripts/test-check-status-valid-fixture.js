#!/usr/bin/env node

const assert = require("node:assert");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const fixturePath = "fixtures/valid-status.json";
const result = spawnSync(npmCommand, ["run", "check-status", "--silent", "--", fixturePath], {
  encoding: "utf8"
});
const resolvedFixturePath = path.resolve(fixturePath);

assert.equal(
  result.status,
  0,
  `npm run check-status should exit 0 for ${fixturePath}.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
);
assert.match(
  result.stdout,
  new RegExp(`Status validation passed: ${resolvedFixturePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
  "npm run check-status should validate the provided valid fixture path"
);
assert.match(
  result.stdout,
  /Loaded 3 status item\(s\)\./,
  "npm run check-status should print the success summary for the valid fixture"
);

console.log(`check-status valid fixture integration test passed: ${resolvedFixturePath}`);
