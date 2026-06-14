#!/usr/bin/env node

const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const nativePath = path.join(repoRoot, ".build", "dynamac-native");
const runningStatusPath = path.join(repoRoot, "fixtures", "timer-running-status.json");
const stoppedStatusPath = path.join(repoRoot, "fixtures", "timer-stopped-status.json");
const resetStatusPath = path.join(repoRoot, "fixtures", "timer-reset-status.json");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dynamac-native-timer-presentation-"));
const stoppedWithMediaStatusPath = path.join(tempDir, "timer-stopped-with-media-status.json");
const resetWithMediaStatusPath = path.join(tempDir, "timer-reset-with-media-status.json");

const stoppedWithMediaPayload = JSON.parse(fs.readFileSync(stoppedStatusPath, "utf8"));
stoppedWithMediaPayload.statuses.push({
  agent: "Now Playing",
  state: "running",
  task: "Background track after stopped timer",
  updatedAt: "2026-06-14T00:00:30.000Z",
  detail: "A stopped timer must not keep the compact overlay presentation from falling through to media.",
  media: {
    source: "spotify",
    title: "Stopped Timer Fallthrough",
    artist: "Dynamac",
    durationSeconds: 180,
    positionSeconds: 30,
    playbackState: "playing"
  }
});
fs.writeFileSync(stoppedWithMediaStatusPath, JSON.stringify(stoppedWithMediaPayload, null, 2));

const resetWithMediaPayload = JSON.parse(fs.readFileSync(resetStatusPath, "utf8"));
resetWithMediaPayload.statuses.push({
  agent: "Now Playing",
  state: "running",
  task: "Background track after reset timer",
  updatedAt: "2026-06-14T00:01:00.000Z",
  detail: "A reset timer must serialize immediately while releasing compact overlay priority.",
  media: {
    source: "spotify",
    title: "Reset Timer Fallthrough",
    artist: "Dynamac",
    durationSeconds: 180,
    positionSeconds: 30,
    playbackState: "playing"
  }
});
fs.writeFileSync(resetWithMediaStatusPath, JSON.stringify(resetWithMediaPayload, null, 2));

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
assert.match(runningOutput, /presentation=timer/, "running timer should own the native overlay presentation");
assert.match(runningOutput, /agent=Timer/, "native dump should preserve Timer status agent");
assert.match(runningOutput, /id=timer-native-contract-test/, "native dump should decode the timer identifier");
assert.match(runningOutput, /durationSeconds=300/, "native dump should decode original timer duration");
assert.match(runningOutput, /remainingSeconds=270/, "native dump should decode remaining timer duration");
assert.match(runningOutput, /state=running/, "native dump should decode running timer state");
assert.match(runningOutput, /startedAt=2026-06-14T00:00:00.000Z/, "native dump should preserve running timer start timestamp");
assert.match(runningOutput, /updatedAt=2026-06-14T00:00:00.000Z/, "native dump should preserve running timer update timestamp");
assert.match(runningOutput, /displayText=4m 30s/, "native dump should preserve overlay display text");
assert.match(runningOutput, /error=\s/, "native dump should preserve empty running timer error text");
assert.match(runningOutput, /replacedPrevious=true/, "native dump should preserve replacement metadata");
assert.match(runningOutput, /compactIsActive=true/, "running timer status should map to the active compact native timer model");
assert.match(runningOutput, /compactRemainingText=4:30/, "native dump should expose compact timer remaining text from the overlay view model");
assert.match(runningOutput, /compactLifecycleState=running/, "native dump should expose compact timer lifecycle state from the overlay view model");
assert.match(runningOutput, /compactIsRunning=true/, "running timer compact model should mark the timer as running");
assert.match(runningOutput, /compactIsPaused=false/, "running timer compact model should not mark the timer as paused");

const stoppedOutput = runNativeStatusDump(stoppedStatusPath);
assert.match(stoppedOutput, /DYNAMAC_STATUS_DUMP active=timer/, "native smoke should still decode a stopped Timer status payload");
assert.match(stoppedOutput, /presentation=fallback/, "stopped timer without another active source should remove the active timer presentation");
assert.match(stoppedOutput, /statusState=idle/, "stopped timer status should remain inactive/idle in the native payload");
assert.match(stoppedOutput, /id=timer-native-stopped-contract-test/, "native dump should decode the stopped timer identifier");
assert.match(stoppedOutput, /durationSeconds=300/, "native dump should decode stopped timer duration");
assert.match(stoppedOutput, /remainingSeconds=270/, "native dump should preserve the frozen stopped remaining duration");
assert.match(stoppedOutput, /state=stopped/, "native dump should decode stopped timer lifecycle state");
assert.match(stoppedOutput, /startedAt=2026-06-14T00:00:00.000Z/, "native dump should preserve stopped timer start timestamp");
assert.match(stoppedOutput, /updatedAt=2026-06-14T00:00:30.000Z/, "native dump should preserve stopped timer update timestamp");
assert.match(stoppedOutput, /displayText=5m/, "native dump should preserve stopped timer display text");
assert.match(stoppedOutput, /error=\s/, "native dump should preserve empty stopped timer error text");
assert.match(stoppedOutput, /replacedPrevious=false/, "native dump should preserve stopped timer replacement metadata");
assert.match(stoppedOutput, /compactIsActive=false/, "stopped timer domain state should map to a non-active compact native timer model");
assert.match(stoppedOutput, /compactRemainingText=\s/, "stopped timer should not expose active compact countdown text");
assert.match(stoppedOutput, /compactLifecycleState=\s/, "stopped timer should not expose an active compact lifecycle state");
assert.match(stoppedOutput, /compactIsRunning=false/, "stopped timer compact model must not mark the timer as running");
assert.match(stoppedOutput, /compactIsPaused=false/, "stopped timer should not expose active paused countdown metadata");

const stoppedWithMediaOutput = runNativeStatusDump(stoppedWithMediaStatusPath);
assert.match(stoppedWithMediaOutput, /DYNAMAC_STATUS_DUMP active=timer/, "native smoke should still decode stopped Timer payloads even when media is present");
assert.match(stoppedWithMediaOutput, /presentation=media/, "stopped timer should release the native overlay presentation to the next active model");
assert.match(stoppedWithMediaOutput, /statusState=idle/, "stopped timer should remain inactive when the presentation falls through to media");
assert.match(stoppedWithMediaOutput, /compactIsActive=false/, "stopped timer with media should not expose an active compact timer view model");

const resetOutput = runNativeStatusDump(resetStatusPath);
assert.match(resetOutput, /DYNAMAC_STATUS_DUMP active=timer/, "native smoke should decode a reset Timer status payload immediately after reset");
assert.match(resetOutput, /presentation=fallback/, "reset timer without another active source should remove the active timer presentation");
assert.match(resetOutput, /statusState=idle/, "reset timer native status should be inactive\/idle");
assert.match(resetOutput, /id=timer-native-reset-contract-test/, "native dump should decode the reset timer identifier");
assert.match(resetOutput, /durationSeconds=300/, "native dump should decode reset timer duration");
assert.match(resetOutput, /remainingSeconds=300/, "native dump should restore full reset timer duration");
assert.match(resetOutput, /state=reset/, "native dump should decode reset timer lifecycle state");
assert.match(resetOutput, /startedAt=2026-06-14T00:01:00.000Z/, "native dump should preserve reset timer restarted timestamp");
assert.match(resetOutput, /updatedAt=2026-06-14T00:01:00.000Z/, "native dump should preserve reset timer update timestamp");
assert.match(resetOutput, /displayText=5m/, "native dump should preserve reset timer display text");
assert.match(resetOutput, /error=\s/, "native dump should preserve empty reset timer error text");
assert.match(resetOutput, /replacedPrevious=false/, "native dump should preserve reset timer replacement metadata");
assert.match(resetOutput, /compactIsActive=false/, "reset timer domain state should map to a non-active compact native timer model");
assert.match(resetOutput, /compactRemainingText=\s/, "reset timer should not expose active compact countdown text");
assert.match(resetOutput, /compactLifecycleState=\s/, "reset timer should not expose an active compact lifecycle state");
assert.match(resetOutput, /compactIsRunning=false/, "reset timer compact model must not mark the timer as running");
assert.match(resetOutput, /compactIsPaused=false/, "reset timer should not expose active paused countdown metadata");

const resetWithMediaOutput = runNativeStatusDump(resetWithMediaStatusPath);
assert.match(resetWithMediaOutput, /DYNAMAC_STATUS_DUMP active=timer/, "native smoke should still decode reset Timer payloads even when media is present");
assert.match(resetWithMediaOutput, /presentation=media/, "reset timer should release the native overlay presentation to the next active model");
assert.match(resetWithMediaOutput, /statusState=idle/, "reset timer should remain inactive when the presentation falls through to media");
assert.match(resetWithMediaOutput, /compactIsActive=false/, "reset timer with media should not expose an active compact timer view model");

fs.rmSync(tempDir, { recursive: true, force: true });

console.log("Native timer status serialization smoke test passed.");
