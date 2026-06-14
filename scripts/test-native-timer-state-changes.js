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

function writeStatus(payload) {
  fs.writeFileSync(statusPath, JSON.stringify(payload, null, 2));
}

function runningTimerPayload() {
  return {
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
  };
}

function runNativeDump(now) {
  writeStatus(runningTimerPayload());
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

function runNativeStatusChangeDump() {
  writeStatus({ statuses: [] });

  const child = childProcess.spawn(nativePath, {
    cwd: repoRoot,
    env: {
      ...process.env,
      DYNAMAC_NATIVE_SMOKE_TEST: "1",
      DYNAMAC_NATIVE_STATUS_DUMP: "1",
      DYNAMAC_NATIVE_STATUS_DUMP_AFTER_MS: "900",
      DYNAMAC_NATIVE_NOW: "2026-06-14T00:00:01.000Z",
      DYNAMAC_STATUS_FILE: statusPath
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  let wroteRunningStatus = false;
  const writeTimer = setTimeout(() => {
    wroteRunningStatus = true;
    writeStatus(runningTimerPayload());
  }, 120);

  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      clearTimeout(writeTimer);
      child.kill("SIGKILL");
      reject(new Error(`native state-change smoke timed out\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 5000);

    child.on("error", (error) => {
      clearTimeout(timeout);
      clearTimeout(writeTimer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      clearTimeout(writeTimer);
      try {
        assert.equal(code, 0, stderr || stdout);
        assert.equal(wroteRunningStatus, true, "test should write a running Timer status after native readiness");
        resolve(stdout);
      } catch (error) {
        reject(error);
      }
    });
  });
}

(async () => {
  try {
    const tickOutput = runNativeDump("2026-06-14T00:00:01.000Z");
    assert.match(tickOutput, /DYNAMAC_STATUS_DUMP active=timer/, "running Timer should be selected for compact native overlay");
    assert.match(tickOutput, /remainingSeconds=300/, "native dump should preserve serialized Timer status contract");
    assert.match(tickOutput, /compactRemainingText=4:59/, "compact native overlay should derive ticked remaining text from startedAt and current time");
    assert.match(tickOutput, /compactLifecycleState=running/, "compact native overlay should keep running lifecycle during active countdown");
    assert.match(tickOutput, /compactIsRunning=true/, "compact native overlay should mark the ticking timer as running");

    const stateChangeOutput = await runNativeStatusChangeDump();
    assert.match(stateChangeOutput, /DYNAMAC_STATUS_DUMP active=fallback presentation=fallback/, "native smoke should start without an active timer presentation");
    assert.match(stateChangeOutput, /DYNAMAC_STATUS_DUMP active=timer/, "native smoke should reload the changed status file and select Timer");
    assert.match(stateChangeOutput, /presentation=timer/, "running Timer status change should produce the native timer overlay presentation");
    assert.match(stateChangeOutput, /id=timer-native-state-change-test/, "state-change dump should decode the changed Timer status id");
    assert.match(stateChangeOutput, /compactRemainingText=4:59/, "state-change dump should expose the ticked compact timer text");
    assert.match(stateChangeOutput, /compactLifecycleState=running/, "state-change dump should expose running compact lifecycle state");
    assert.match(stateChangeOutput, /compactIsRunning=true/, "state-change dump should mark the changed Timer status as running");

    const doneOutput = runNativeDump("2026-06-14T00:05:01.000Z");
    assert.match(doneOutput, /compactRemainingText=Done/, "compact native overlay should expose stable done text for elapsed timers");
    assert.match(doneOutput, /compactLifecycleState=done/, "compact native overlay should expose done lifecycle once elapsed");
    assert.match(doneOutput, /compactIsRunning=false/, "elapsed compact native timer should no longer be marked running");
    assert.match(doneOutput, /compactIsPaused=false/, "elapsed compact native timer should not be reported as paused");

    console.log("Native Timer state-change overlay test passed.");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
})();
