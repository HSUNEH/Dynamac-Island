#!/usr/bin/env node

const assert = require("node:assert");
const childProcess = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const nativePath = path.join(repoRoot, ".build", "dynamac-native");
const statusPath = path.join(repoRoot, "fixtures", "timer-running-status.json");

const result = childProcess.spawnSync(nativePath, {
  cwd: repoRoot,
  env: {
    ...process.env,
    DYNAMAC_NATIVE_SMOKE_TEST: "1",
    DYNAMAC_NATIVE_STATUS_DUMP: "1",
    DYNAMAC_STATUS_FILE: statusPath
  },
  encoding: "utf8",
  timeout: 5000
});

assert.equal(result.status, 0, result.stderr || result.stdout);
assert.match(result.stdout, /DYNAMAC_NATIVE_READY/, "native smoke path should still report readiness");
assert.match(result.stdout, /DYNAMAC_STATUS_DUMP active=timer/, "native smoke should report Timer as the active overlay payload");
assert.match(result.stdout, /agent=Timer/, "native dump should preserve Timer status agent");
assert.match(result.stdout, /id=timer-native-contract-test/, "native dump should decode the timer identifier");
assert.match(result.stdout, /durationSeconds=300/, "native dump should decode original timer duration");
assert.match(result.stdout, /remainingSeconds=270/, "native dump should decode remaining timer duration");
assert.match(result.stdout, /state=running/, "native dump should decode running timer state");
assert.match(result.stdout, /displayText=4m 30s/, "native dump should preserve overlay display text");
assert.match(result.stdout, /replacedPrevious=true/, "native dump should preserve replacement metadata");

console.log("Native timer status serialization smoke test passed.");
