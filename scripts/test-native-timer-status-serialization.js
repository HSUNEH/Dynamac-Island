#!/usr/bin/env node

const assert = require("node:assert");
const childProcess = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const nativePath = path.join(repoRoot, ".build", "dynamac-native");
const runningStatusPath = path.join(repoRoot, "fixtures", "timer-running-status.json");
const stoppedStatusPath = path.join(repoRoot, "fixtures", "timer-stopped-status.json");

function runNativeStatusDump(statusPath) {
  const result = childProcess.spawnSync(nativePath, {
    cwd: repoRoot,
    env: {
      ...process.env,
      DYNAMAC_NATIVE_SMOKE_TEST: "1",
      DYNAMAC_NATIVE_NOW: "2026-06-14T00:00:00.000Z",
      DYNAMAC_NATIVE_STATUS_DUMP: "1",
      DYNAMAC_STATUS_FILE: statusPath
    },
    encoding: "utf8",
    timeout: 5000
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /DYNAMAC_NATIVE_READY/, "native smoke path should still report readiness");
  return result.stdout;
}

const runningOutput = runNativeStatusDump(runningStatusPath);
assert.match(runningOutput, /DYNAMAC_STATUS_DUMP active=timer/, "native smoke should report Timer as the active overlay payload");
assert.match(runningOutput, /agent=Timer/, "native dump should preserve Timer status agent");
assert.match(runningOutput, /id=timer-native-contract-test/, "native dump should decode the timer identifier");
assert.match(runningOutput, /durationSeconds=300/, "native dump should decode original timer duration");
assert.match(runningOutput, /remainingSeconds=270/, "native dump should decode remaining timer duration");
assert.match(runningOutput, /state=running/, "native dump should decode running timer state");
assert.match(runningOutput, /displayText=4m 30s/, "native dump should preserve overlay display text");
assert.match(runningOutput, /replacedPrevious=true/, "native dump should preserve replacement metadata");
assert.match(runningOutput, /compactRemainingText=4:30/, "native dump should expose compact timer remaining text from the overlay view model");
assert.match(runningOutput, /compactLifecycleState=running/, "native dump should expose compact timer lifecycle state from the overlay view model");
assert.match(runningOutput, /compactIsRunning=true/, "running timer compact model should mark the timer as running");
assert.match(runningOutput, /compactIsPaused=false/, "running timer compact model should not mark the timer as paused");

const stoppedOutput = runNativeStatusDump(stoppedStatusPath);
assert.match(stoppedOutput, /DYNAMAC_STATUS_DUMP active=timer/, "native smoke should still decode a stopped Timer status payload");
assert.match(stoppedOutput, /statusState=idle/, "stopped timer status should remain inactive/idle in the native payload");
assert.match(stoppedOutput, /id=timer-native-stopped-contract-test/, "native dump should decode the stopped timer identifier");
assert.match(stoppedOutput, /durationSeconds=300/, "native dump should decode stopped timer duration");
assert.match(stoppedOutput, /remainingSeconds=270/, "native dump should preserve the frozen stopped remaining duration");
assert.match(stoppedOutput, /state=stopped/, "native dump should decode stopped timer lifecycle state");
assert.match(stoppedOutput, /displayText=5m/, "native dump should preserve stopped timer display text");
assert.match(stoppedOutput, /replacedPrevious=false/, "native dump should preserve stopped timer replacement metadata");
assert.match(stoppedOutput, /compactRemainingText=\s/, "stopped timer should not expose active compact countdown text");
assert.match(stoppedOutput, /compactLifecycleState=\s/, "stopped timer should not expose an active compact lifecycle state");
assert.match(stoppedOutput, /compactIsRunning=false/, "stopped timer compact model must not mark the timer as running");
assert.match(stoppedOutput, /compactIsPaused=false/, "stopped timer should not expose active paused countdown metadata");

console.log("Native timer status serialization smoke test passed.");
