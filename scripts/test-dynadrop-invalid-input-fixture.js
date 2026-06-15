#!/usr/bin/env node

const assert = require("node:assert");
const { spawnSync } = require("node:child_process");

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npmCommand, ["run", "dynadrop:invalid-input-fixture", "--silent"], {
  encoding: "utf8"
});

assert.notEqual(
  result.status,
  0,
  `DynaDrop invalid-input fixture should exit non-zero.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
);
assert.match(
  result.stderr,
  /DynaDrop invalid input fixture failed as expected:/,
  "fixture should describe the deterministic invalid-input failure"
);
assert.match(
  result.stderr,
  /"code":"dropped-file-path-required"/,
  "fixture should expose the stable DynaDrop error code"
);
assert.match(
  result.stderr,
  /"persisted":false/,
  "fixture should make non-persistence explicit"
);
assert.equal(
  result.stdout.trim(),
  "",
  "invalid fixture should keep stdout empty so stderr carries the failure contract"
);

console.log("DynaDrop invalid-input fixture command test passed.");
