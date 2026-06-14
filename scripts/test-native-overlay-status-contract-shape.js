#!/usr/bin/env node

const assert = require("node:assert");
const {
  NATIVE_TIMER_CONTRACT,
  activeNativeTimerStatus,
  validateNativeOverlayStatusContract
} = require("../src/native-overlay-contract");

const validNativeTimerPayload = {
  statuses: [
    {
      agent: "Timer",
      state: "running",
      task: "Timer · 5m",
      updatedAt: "2026-06-14T00:00:00.000Z",
      detail: "Timer running · 4m 30s remaining",
      timer: {
        id: "timer-native-valid-contract-shape",
        durationSeconds: 300,
        remainingSeconds: 270,
        state: "running",
        startedAt: "2026-06-14T00:00:00.000Z",
        updatedAt: "2026-06-14T00:00:00.000Z",
        displayText: "4m 30s",
        error: "",
        replacedPrevious: true
      }
    }
  ]
};

const result = validateNativeOverlayStatusContract(validNativeTimerPayload);
assert.equal(result.ok, true, "native overlay contract module should accept a valid Timer status contract shape");
assert.deepEqual(result.errors, [], "valid native Timer status shape should not emit contract errors");
assert.equal(result.statuses.length, 1, "valid native Timer payload should expose the decoded status item");

const timerStatus = result.activeTimerStatus;
assert.ok(timerStatus, "valid native Timer payload should expose an active Timer status item");
assert.equal(timerStatus.agent, NATIVE_TIMER_CONTRACT.agent, "native contract should select the Timer agent");
assert.equal(timerStatus.state, "running", "native contract should preserve the status lifecycle state");
assert.equal(timerStatus.task, "Timer · 5m", "native contract should preserve user-visible task text");
assert.equal(timerStatus.updatedAt, "2026-06-14T00:00:00.000Z", "native contract should preserve the status timestamp");
assert.equal(timerStatus.detail, "Timer running · 4m 30s remaining", "native contract should preserve status detail text");

for (const field of NATIVE_TIMER_CONTRACT.requiredTimerFields) {
  assert.equal(
    Object.prototype.hasOwnProperty.call(timerStatus.timer, field),
    true,
    `valid native Timer payload should include timer.${field}`
  );
}

assert.equal(timerStatus.timer.id, "timer-native-valid-contract-shape", "native contract should preserve timer id");
assert.equal(timerStatus.timer.durationSeconds, 300, "native contract should accept numeric durationSeconds");
assert.equal(timerStatus.timer.remainingSeconds, 270, "native contract should accept numeric remainingSeconds");
assert.equal(
  NATIVE_TIMER_CONTRACT.lifecycleStates.has(timerStatus.timer.state),
  true,
  "native contract should accept an allowed Timer lifecycle state"
);
assert.equal(timerStatus.timer.startedAt, "2026-06-14T00:00:00.000Z", "native contract should preserve startedAt");
assert.equal(timerStatus.timer.updatedAt, "2026-06-14T00:00:00.000Z", "native contract should preserve timer updatedAt");
assert.equal(timerStatus.timer.displayText, "4m 30s", "native contract should preserve displayText");
assert.equal(timerStatus.timer.error, "", "native contract should accept an empty error string for valid timers");
assert.equal(timerStatus.timer.replacedPrevious, true, "native contract should preserve replacement metadata");

assert.equal(
  activeNativeTimerStatus(result.statuses),
  timerStatus,
  "native contract helper should select the same Timer status item from decoded statuses"
);

console.log("Native overlay Timer status contract shape test passed.");
