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

function stoppedTimerPayload() {
  return {
    statuses: [
      {
        agent: "Timer",
        state: "idle",
        task: "Timer stopped",
        updatedAt: "2026-06-14T00:00:30.000Z",
        detail: "Stopped with 4m 30s remaining of 5m.",
        timer: {
          id: "timer-native-stopped-state-change-test",
          durationSeconds: 300,
          remainingSeconds: 270,
          state: "stopped",
          startedAt: "2026-06-14T00:00:00.000Z",
          updatedAt: "2026-06-14T00:00:30.000Z",
          displayText: "5m",
          error: "",
          replacedPrevious: false
        }
      }
    ]
  };
}

function resetTimerPayload() {
  return {
    statuses: [
      {
        agent: "Timer",
        state: "idle",
        task: "Timer · 5m remaining",
        updatedAt: "2026-06-14T00:01:00.000Z",
        detail: "5m remaining of 5m.",
        timer: {
          id: "timer-native-reset-state-change-test",
          durationSeconds: 300,
          remainingSeconds: 300,
          state: "reset",
          startedAt: "2026-06-14T00:01:00.000Z",
          updatedAt: "2026-06-14T00:01:00.000Z",
          displayText: "5m",
          error: "",
          replacedPrevious: false
        }
      }
    ]
  };
}

function doneTimerPayload() {
  return {
    statuses: [
      {
        agent: "Timer",
        state: "success",
        task: "Timer done",
        updatedAt: "2026-06-14T00:05:00.000Z",
        detail: "5m timer elapsed.",
        timer: {
          id: "timer-native-done-state-change-test",
          durationSeconds: 300,
          remainingSeconds: 0,
          state: "done",
          startedAt: "2026-06-14T00:00:00.000Z",
          updatedAt: "2026-06-14T00:05:00.000Z",
          displayText: "Done",
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
    timeout: 10000
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
    }, 10000);

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

function runNativeStoppedStatusChangeDump() {
  writeStatus(runningTimerPayload());

  const child = childProcess.spawn(nativePath, {
    cwd: repoRoot,
    env: {
      ...process.env,
      DYNAMAC_NATIVE_SMOKE_TEST: "1",
      DYNAMAC_NATIVE_STATUS_DUMP: "1",
      DYNAMAC_NATIVE_STATUS_DUMP_AFTER_MS: "900",
      DYNAMAC_NATIVE_NOW: "2026-06-14T00:00:31.000Z",
      DYNAMAC_STATUS_FILE: statusPath
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  let wroteStoppedStatus = false;
  const writeTimer = setTimeout(() => {
    wroteStoppedStatus = true;
    writeStatus(stoppedTimerPayload());
  }, 120);

  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      clearTimeout(writeTimer);
      child.kill("SIGKILL");
      reject(new Error(`native stopped state-change smoke timed out\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 10000);

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
        assert.equal(wroteStoppedStatus, true, "test should write a stopped Timer status after native readiness");
        resolve(stdout);
      } catch (error) {
        reject(error);
      }
    });
  });
}

function runNativeResetStatusChangeDump() {
  writeStatus(runningTimerPayload());

  const child = childProcess.spawn(nativePath, {
    cwd: repoRoot,
    env: {
      ...process.env,
      DYNAMAC_NATIVE_SMOKE_TEST: "1",
      DYNAMAC_NATIVE_STATUS_DUMP: "1",
      DYNAMAC_NATIVE_STATUS_DUMP_AFTER_MS: "900",
      DYNAMAC_NATIVE_NOW: "2026-06-14T00:01:01.000Z",
      DYNAMAC_STATUS_FILE: statusPath
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  let wroteResetStatus = false;
  const writeTimer = setTimeout(() => {
    wroteResetStatus = true;
    writeStatus(resetTimerPayload());
  }, 120);

  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      clearTimeout(writeTimer);
      child.kill("SIGKILL");
      reject(new Error(`native reset state-change smoke timed out\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 10000);

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
        assert.equal(wroteResetStatus, true, "test should write a reset Timer status after native readiness");
        resolve(stdout);
      } catch (error) {
        reject(error);
      }
    });
  });
}

function runNativeDoneStatusChangeDump() {
  writeStatus(runningTimerPayload());

  const child = childProcess.spawn(nativePath, {
    cwd: repoRoot,
    env: {
      ...process.env,
      DYNAMAC_NATIVE_SMOKE_TEST: "1",
      DYNAMAC_NATIVE_STATUS_DUMP: "1",
      DYNAMAC_NATIVE_STATUS_DUMP_AFTER_MS: "900",
      DYNAMAC_NATIVE_NOW: "2026-06-14T00:05:00.000Z",
      DYNAMAC_STATUS_FILE: statusPath
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  let wroteDoneStatus = false;
  const writeTimer = setTimeout(() => {
    wroteDoneStatus = true;
    writeStatus(doneTimerPayload());
  }, 120);

  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      clearTimeout(writeTimer);
      child.kill("SIGKILL");
      reject(new Error(`native done state-change smoke timed out\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 10000);

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
        assert.equal(wroteDoneStatus, true, "test should write a done Timer status after native readiness");
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
    assert.match(tickOutput, /renderedCompactText=⏱ 4:59/, "native render smoke should expose the compact Timer notch text drawn from the status model");
    assert.match(tickOutput, /renderedExpandedTitle=4:59/, "native render smoke should expose the expanded Timer title drawn from the status model");
    assert.match(tickOutput, /renderedProgressPercent=0\.33/, "native render smoke should expose updated Timer progress from elapsed status time");

    const stateChangeOutput = await runNativeStatusChangeDump();
    assert.match(stateChangeOutput, /DYNAMAC_STATUS_DUMP active=fallback presentation=fallback/, "native smoke should start without an active timer presentation");
    assert.match(stateChangeOutput, /DYNAMAC_STATUS_DUMP active=timer/, "native smoke should reload the changed status file and select Timer");
    assert.match(stateChangeOutput, /presentation=timer/, "running Timer status change should produce the native timer overlay presentation");
    assert.match(stateChangeOutput, /id=timer-native-state-change-test/, "state-change dump should decode the changed Timer status id");
    assert.match(stateChangeOutput, /compactRemainingText=4:59/, "state-change dump should expose the ticked compact timer text");
    assert.match(stateChangeOutput, /compactLifecycleState=running/, "state-change dump should expose running compact lifecycle state");
    assert.match(stateChangeOutput, /compactIsRunning=true/, "state-change dump should mark the changed Timer status as running");
    assert.match(stateChangeOutput, /renderedCompactText=⏱ 4:59/, "state-change dump should prove the changed Timer status updates rendered compact notch output");
    assert.match(stateChangeOutput, /renderedExpandedTitle=4:59/, "state-change dump should prove the changed Timer status updates rendered expanded notch output");

    const stoppedStateChangeOutput = await runNativeStoppedStatusChangeDump();
    assert.match(stoppedStateChangeOutput, /DYNAMAC_STATUS_DUMP active=timer presentation=timer/, "native smoke should start with a running Timer presentation before the stopped change");
    assert.match(stoppedStateChangeOutput, /DYNAMAC_STATUS_DUMP active=timer presentation=fallback/, "stopped Timer status change should release the native overlay presentation");
    assert.match(stoppedStateChangeOutput, /statusState=idle/, "stopped Timer status change should expose inactive native status state");
    assert.match(stoppedStateChangeOutput, /id=timer-native-stopped-state-change-test/, "stopped state-change dump should decode the changed Timer status id");
    assert.match(stoppedStateChangeOutput, /remainingSeconds=270/, "stopped state-change dump should preserve frozen remaining seconds");
    assert.match(stoppedStateChangeOutput, /state=stopped/, "stopped state-change dump should decode the stopped lifecycle state");
    assert.match(stoppedStateChangeOutput, /compactIsActive=false/, "stopped Timer status change should not expose an active compact timer model");
    assert.match(stoppedStateChangeOutput, /compactRemainingText=\s/, "stopped Timer status change should clear active compact countdown text");
    assert.match(stoppedStateChangeOutput, /compactLifecycleState=\s/, "stopped Timer status change should clear active compact lifecycle state");
    assert.match(stoppedStateChangeOutput, /compactIsRunning=false/, "stopped Timer status change should not mark the compact model as running");
    assert.match(stoppedStateChangeOutput, /compactIsPaused=false/, "stopped Timer status change should not expose paused compact metadata");

    const resetStateChangeOutput = await runNativeResetStatusChangeDump();
    assert.match(resetStateChangeOutput, /DYNAMAC_STATUS_DUMP active=timer presentation=timer/, "native smoke should start with a running Timer presentation before the reset change");
    assert.match(resetStateChangeOutput, /DYNAMAC_STATUS_DUMP active=timer presentation=fallback/, "reset Timer status change should release the native overlay presentation");
    assert.match(resetStateChangeOutput, /statusState=idle/, "reset Timer status change should expose inactive native status state");
    assert.match(resetStateChangeOutput, /id=timer-native-reset-state-change-test/, "reset state-change dump should decode the changed Timer status id");
    assert.match(resetStateChangeOutput, /remainingSeconds=300/, "reset state-change dump should restore full remaining seconds");
    assert.match(resetStateChangeOutput, /state=reset/, "reset state-change dump should decode the reset lifecycle state");
    assert.match(resetStateChangeOutput, /compactIsActive=false/, "reset Timer status change should not expose an active compact timer model");
    assert.match(resetStateChangeOutput, /compactRemainingText=\s/, "reset Timer status change should clear active compact countdown text");
    assert.match(resetStateChangeOutput, /compactLifecycleState=\s/, "reset Timer status change should clear active compact lifecycle state");
    assert.match(resetStateChangeOutput, /compactIsRunning=false/, "reset Timer status change should not mark the compact model as running");
    assert.match(resetStateChangeOutput, /compactIsPaused=false/, "reset Timer status change should not expose paused compact metadata");

    const doneStateChangeOutput = await runNativeDoneStatusChangeDump();
    assert.match(doneStateChangeOutput, /DYNAMAC_STATUS_DUMP active=timer presentation=timer/, "native smoke should start with a running Timer presentation before the done change");
    assert.match(doneStateChangeOutput, /statusState=success/, "done Timer status change should expose completed native status state");
    assert.match(doneStateChangeOutput, /id=timer-native-done-state-change-test/, "done state-change dump should decode the changed Timer status id");
    assert.match(doneStateChangeOutput, /remainingSeconds=0/, "done state-change dump should preserve zero remaining seconds");
    assert.match(doneStateChangeOutput, /state=done/, "done state-change dump should decode the done lifecycle state");
    assert.match(doneStateChangeOutput, /displayText=Done/, "done state-change dump should preserve stable Timer display text");
    assert.match(doneStateChangeOutput, /compactIsActive=true/, "done Timer status change should keep the compact done model visible");
    assert.match(doneStateChangeOutput, /compactRemainingText=Done/, "done Timer status change should update compact countdown text to Done");
    assert.match(doneStateChangeOutput, /compactLifecycleState=done/, "done Timer status change should update compact lifecycle state to done");
    assert.match(doneStateChangeOutput, /compactIsRunning=false/, "done Timer status change should not mark the compact model as running");
    assert.match(doneStateChangeOutput, /compactIsPaused=false/, "done Timer status change should not expose paused compact metadata");
    assert.match(doneStateChangeOutput, /renderedCompactText=⏱ Done/, "done Timer status change should update rendered compact notch output");
    assert.match(doneStateChangeOutput, /renderedExpandedTitle=0:00/, "done Timer status change should update rendered expanded notch output");
    assert.match(doneStateChangeOutput, /renderedProgressPercent=100\.00/, "done Timer status change should update rendered progress output to complete");

    const doneOutput = runNativeDump("2026-06-14T00:05:01.000Z");
    assert.match(doneOutput, /compactRemainingText=Done/, "compact native overlay should expose stable done text for elapsed timers");
    assert.match(doneOutput, /compactLifecycleState=done/, "compact native overlay should expose done lifecycle once elapsed");
    assert.match(doneOutput, /compactIsRunning=false/, "elapsed compact native timer should no longer be marked running");
    assert.match(doneOutput, /compactIsPaused=false/, "elapsed compact native timer should not be reported as paused");
    assert.match(doneOutput, /renderedCompactText=⏱ Done/, "elapsed Timer should update rendered compact notch output to Done");
    assert.match(doneOutput, /renderedExpandedTitle=0:00/, "elapsed Timer should update rendered expanded notch output to zero remaining");
    assert.match(doneOutput, /renderedProgressPercent=100\.00/, "elapsed Timer should update rendered progress output to complete");

    console.log("Native Timer state-change overlay test passed.");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
})();
