#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const nodeCommand = process.execPath;
const scriptPath = path.resolve("scripts/timer-start.js");

function runTimerStart(args) {
  return spawnSync(nodeCommand, [scriptPath, ...args], {
    encoding: "utf8"
  });
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dynamac-timer-start-cli-"));
const invalidStatusPath = path.join(tempDir, "invalid-status.json");

const invalidResult = runTimerStart(["abc", "--status", invalidStatusPath]);
assert.equal(invalidResult.status, 1, `abc should exit non-zero. stdout:\n${invalidResult.stdout}\nstderr:\n${invalidResult.stderr}`);
assert.equal(invalidResult.stdout, "", "invalid timer input should not write success output to stdout");
assert.deepEqual(
  JSON.parse(invalidResult.stderr),
  {
    ok: false,
    error: "Timer duration must be a positive whole number followed by s, m, or h."
  },
  "abc should return the stable parser error JSON on stderr"
);
assert.equal(fs.existsSync(invalidStatusPath), false, "invalid timer input must not write a status file");

const zeroResult = runTimerStart(["0s", "--status", path.join(tempDir, "zero-status.json")]);
assert.equal(zeroResult.status, 1, `0s should exit non-zero. stdout:\n${zeroResult.stdout}\nstderr:\n${zeroResult.stderr}`);
assert.deepEqual(
  JSON.parse(zeroResult.stderr),
  {
    ok: false,
    error: "Timer duration must be greater than 0 seconds."
  },
  "0s should return the stable non-positive duration error JSON on stderr"
);

const validStatusPath = path.join(tempDir, "valid-status.json");
const validResult = runTimerStart(["5m", "--status", validStatusPath]);
assert.equal(validResult.status, 0, `5m should exit zero. stdout:\n${validResult.stdout}\nstderr:\n${validResult.stderr}`);
assert.equal(validResult.stderr, "", "valid timer input should not write errors to stderr");
const validOutput = JSON.parse(validResult.stdout);
assert.equal(validOutput.ok, true);
assert.equal(validOutput.timer.durationSeconds, 300);
assert.equal(validOutput.timer.remainingSeconds, 300);
assert.equal(validOutput.timer.state, "running");
assert.equal(validOutput.statusPath, validStatusPath);

const statusPayload = JSON.parse(fs.readFileSync(validStatusPath, "utf8"));
assert.equal(statusPayload.statuses[0].agent, "Timer");
assert.equal(statusPayload.statuses[0].timer.durationSeconds, 300);
assert.equal(statusPayload.statuses[0].timer.state, "running");

console.log("Timer start CLI test passed.");
