#!/usr/bin/env node

const assert = require("node:assert");
const { spawnSync } = require("node:child_process");

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npmCommand, ["run", "check-status", "--silent"], {
  encoding: "utf8"
});

assert.equal(
  result.status,
  0,
  `npm run check-status should exit 0.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
);
assert.match(
  result.stdout,
  /Status validation passed: .*status[/\\]status\.json/,
  "npm run check-status should invoke the checker entrypoint against the default status file"
);
assert.match(
  result.stdout,
  /Loaded 3 status item\(s\)\./,
  "npm run check-status should print the checker entrypoint success summary"
);

console.log("check-status npm script test passed.");
