#!/usr/bin/env node

const assert = require("node:assert");
const { spawnSync } = require("node:child_process");

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(
  npmCommand,
  ["run", "check-status", "--silent", "--", "fixtures/malformed-status.json"],
  {
    encoding: "utf8"
  }
);

assert.notEqual(
  result.status,
  0,
  `malformed status fixture should exit non-zero.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
);
assert.match(
  result.stderr,
  /Status validation failed: .*fixtures[/\\]malformed-status\.json/,
  "malformed fixture should report the failing status path"
);
assert.match(
  result.stderr,
  /Status JSON is invalid:/,
  "malformed fixture should report a JSON parse error"
);

console.log("check-status malformed fixture test passed.");
