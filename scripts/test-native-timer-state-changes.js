#!/usr/bin/env node

const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const nativePath = path.join(repoRoot, ".build", "dynamac-native");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dynamac-native-timer-state-"));
const statusPath = path.join(tempDir, "status.json");

fs.writeFileSync(statusPath, JSON.stringify({
  statuses: [
    {
      agent: "Timer",
      state: "running",
      task: "Timer · 5m remaining",
      updatedAt: "2026-06-14T00:00:00.000Z",
      detail: "5m remaining of 5m.",
      timer: {
        id: "timer-native-state-change-test",
        durationSeconds: 300,
        remainingSeconds: 300,
        state: "running",
        startedAt: "2026-06-14T00:00:00.000Z",
        updatedAt: "2026-06-14T00:00:00.000Z",
        displayText: "5m",
        error: "",
        replacedPrevious: false
      }
    }
  ]
}, null, 2));

function runNativeDump(now) {
  const result = childProcess.spawnSync(nativePath, {
    cwd: repoRoot,
    env: {
      ...process.env,
      DYNAMAC_NATIVE_SMOKE_TEST: "1",
      DYNAMAC_NATIVE_STATUS_DUMP: "1",
      DYNAMAC_NATIVE_NOW: now,
      DYNAMAC_STATUS_FILE: statusPath
    },
    encoding: "utf8",
    timeout: 5000
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /DYNAMAC_NATIVE_READY/, "native smoke path should report readiness");
  return result.stdout;
}

const tickOutput = runNativeDump("2026-06-14T00:00:01.000Z");
assert.match(tickOutput, /DYNAMAC_STATUS_DUMP active=timer/, "running Timer should be selected for compact native overlay");
assert.match(tickOutput, /remainingSeconds=300/, "native dump should preserve serialized Timer status contract");
assert.match(tickOutput, /compactRemainingText=4:59/, "compact native overlay should derive ticked remaining text from startedAt and current time");
assert.match(tickOutput, /compactLifecycleState=running/, "compact native overlay should keep running lifecycle during active countdown");
assert.match(tickOutput, /compactIsRunning=true/, "compact native overlay should mark the ticking timer as running");

const doneOutput = runNativeDump("2026-06-14T00:05:01.000Z");
assert.match(doneOutput, /compactRemainingText=Done/, "compact native overlay should expose stable done text for elapsed timers");
assert.match(doneOutput, /compactLifecycleState=done/, "compact native overlay should expose done lifecycle once elapsed");
assert.match(doneOutput, /compactIsRunning=false/, "elapsed compact native timer should no longer be marked running");
assert.match(doneOutput, /compactIsPaused=false/, "elapsed compact native timer should not be reported as paused");

fs.rmSync(tempDir, { recursive: true, force: true });
console.log("Native Timer state-change overlay test passed.");
