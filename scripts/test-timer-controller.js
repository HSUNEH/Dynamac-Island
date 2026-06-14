#!/usr/bin/env node

const assert = require("node:assert");
const { createTimerController } = require("../src/timer-controller");

const runningPayload = {
  ok: true,
  source: "status/status.json",
  statuses: [
    {
      agent: "Timer",
      state: "running",
      task: "Timer · 1m remaining",
      updatedAt: "2026-06-14T00:00:00.000Z",
      detail: "1m remaining of 1m.",
      timer: {
        id: "timer-controller-stop",
        durationSeconds: 60,
        remainingSeconds: 60,
        state: "running",
        startedAt: "2026-06-14T00:00:00.000Z",
        updatedAt: "2026-06-14T00:00:00.000Z",
        displayText: "1m",
        error: "",
        replacedPrevious: false
      }
    }
  ],
  errors: []
};

const stoppedPayload = {
  ok: true,
  source: "status/status.json",
  statuses: [
    {
      agent: "Timer",
      state: "idle",
      task: "Timer · 45s remaining",
      updatedAt: "2026-06-14T00:00:15.000Z",
      detail: "45s remaining of 1m.",
      timer: {
        ...runningPayload.statuses[0].timer,
        remainingSeconds: 45,
        state: "stopped",
        updatedAt: "2026-06-14T00:00:15.000Z"
      }
    }
  ],
  errors: []
};

const calls = [];
const controller = createTimerController({
  statusFile: "/tmp/dynamac-timer-controller-status.json",
  fs: { mocked: true },
  loadStatusFile(filePath) {
    calls.push(["loadStatusFile", filePath]);
    return calls.filter((call) => call[0] === "loadStatusFile").length === 1
      ? runningPayload
      : stoppedPayload;
  },
  stopTimerStatusSnapshot(timerState, options) {
    calls.push(["stopTimerStatusSnapshot", timerState, options]);
    assert.deepEqual(timerState, { activeTimer: runningPayload.statuses[0].timer });
    assert.equal(options.outputPath, "/tmp/dynamac-timer-controller-status.json");
    assert.equal(options.now, "2026-06-14T00:00:15.000Z");
    assert.equal(options.statusNow, "2026-06-14T00:00:15.000Z");
    assert.deepEqual(options.fs, { mocked: true });
    return {
      timer: stoppedPayload.statuses[0].timer,
      status: {
        outputPath: options.outputPath,
        payload: { statuses: stoppedPayload.statuses }
      }
    };
  },
  broadcastStatus(payload) {
    calls.push(["broadcastStatus", payload]);
  }
});

const stopResult = controller.stopActiveTimer({
  timerId: "timer-controller-stop",
  now: "2026-06-14T00:00:15.000Z",
  statusNow: "2026-06-14T00:00:15.000Z"
});

assert.deepEqual(
  stopResult,
  {
    ok: true,
    timer: stoppedPayload.statuses[0].timer,
    status: {
      outputPath: "/tmp/dynamac-timer-controller-status.json",
      payload: { statuses: stoppedPayload.statuses }
    },
    payload: stoppedPayload
  },
  "controller stop should return the stopped timer, store snapshot, and emitted status payload"
);
assert.deepEqual(
  calls.map((call) => call[0]),
  ["loadStatusFile", "stopTimerStatusSnapshot", "loadStatusFile", "broadcastStatus"],
  "controller stop should load current status, invoke store stop, reload persisted status, then emit it"
);
assert.deepEqual(calls.at(-1), ["broadcastStatus", stoppedPayload]);

const noRunningController = createTimerController({
  statusFile: "/tmp/dynamac-timer-controller-status.json",
  loadStatusFile() {
    return { ok: true, source: "status/status.json", statuses: [], errors: [] };
  },
  stopTimerStatusSnapshot() {
    throw new Error("stop store should not be called without a running timer");
  },
  broadcastStatus() {
    throw new Error("stop should not broadcast when no timer changes");
  }
});

assert.deepEqual(
  noRunningController.stopActiveTimer(),
  {
    ok: false,
    error: "No running timer to stop.",
    payload: { ok: true, source: "status/status.json", statuses: [], errors: [] }
  },
  "controller stop should fail predictably without a running timer"
);

const mismatchedIdController = createTimerController({
  statusFile: "/tmp/dynamac-timer-controller-status.json",
  loadStatusFile() {
    return runningPayload;
  },
  stopTimerStatusSnapshot() {
    throw new Error("stop store should not be called for a mismatched timer id");
  },
  broadcastStatus() {
    throw new Error("stop should not broadcast for a mismatched timer id");
  }
});

assert.deepEqual(
  mismatchedIdController.stopActiveTimer({ timerId: "other-timer" }),
  {
    ok: false,
    error: "Requested timer is not the running timer.",
    payload: runningPayload
  },
  "controller stop should reject stale UI requests against a different running timer"
);

console.log("Timer controller stop test passed.");
