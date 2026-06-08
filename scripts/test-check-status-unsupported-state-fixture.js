#!/usr/bin/env node

const assert = require("node:assert");
const { spawnSync } = require("node:child_process");

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(
  npmCommand,
  ["run", "check-status", "--silent", "--", "fixtures/unsupported-state-status.json"],
  {
    encoding: "utf8"
  }
);

assert.notEqual(
  result.status,
  0,
  `unsupported state fixture should exit non-zero.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
);
assert.match(
  result.stderr,
  /Status validation failed: .*fixtures[/\\]unsupported-state-status\.json/,
  "unsupported state fixture should report the failing status path"
);
assert.match(
  result.stderr,
  /statuses\[0\]\.state must be one of idle, running, success, warning, error\./,
  "unsupported state fixture should report the allowed state set"
);

console.log("check-status unsupported state fixture test passed.");
