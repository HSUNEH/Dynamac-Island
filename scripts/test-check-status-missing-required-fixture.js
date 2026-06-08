#!/usr/bin/env node

const assert = require("node:assert");
const { spawnSync } = require("node:child_process");

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(
  npmCommand,
  ["run", "check-status", "--silent", "--", "fixtures/missing-required-status.json"],
  {
    encoding: "utf8"
  }
);

assert.notEqual(
  result.status,
  0,
  `missing required status fixture should exit non-zero.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
);
assert.match(
  result.stderr,
  /Status validation failed: .*fixtures[/\\]missing-required-status\.json/,
  "missing required fixture should report the failing status path"
);
assert.match(
  result.stderr,
  /statuses\[0\]\.task must be a non-empty string\./,
  "missing required fixture should report the omitted required field"
);

console.log("check-status missing required fixture test passed.");
