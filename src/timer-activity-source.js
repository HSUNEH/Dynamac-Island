const { ACTIVITY_PRIORITIES } = require("./activity-router");
const { TIMER_STATES, completeTimerIfElapsed } = require("./timer-state");
const { timerToNativeStatus } = require("./timer-status");

const DEFAULT_SOURCE = "local-timer-mvp";

function timestampMs(value, fieldName) {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(String(value || ""));
  if (!Number.isFinite(timestamp)) {
    throw new Error(`${fieldName} must be a valid timestamp`);
  }
  return timestamp;
}

function clampProgress(remainingSeconds, durationSeconds) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  const elapsed = Math.max(0, durationSeconds - Math.max(0, remainingSeconds));
  return Number(Math.min(1, elapsed / durationSeconds).toFixed(3));
}

function timerActivityState(status) {
  if (status.timer.state === TIMER_STATES.DONE || status.state === "success") return "completed";
  if (status.timer.state === TIMER_STATES.RUNNING && status.state === "running") return "active";
  return "idle";
}

function buildTimerActivityFromStatus(status, options = {}) {
  if (!status || typeof status !== "object" || !status.timer || typeof status.timer !== "object") {
    throw new Error("timer status with timer payload is required");
  }

  const timer = status.timer;
  const source = String(options.source || status.source || DEFAULT_SOURCE).trim() || DEFAULT_SOURCE;
  const createdAt = timestampMs(timer.startedAt, "timer.startedAt");
  const updatedAt = timestampMs(timer.updatedAt || status.updatedAt, "timer.updatedAt");
  const durationSeconds = Number(timer.durationSeconds);
  const remainingSeconds = Number(timer.remainingSeconds);
  const displayText = timer.displayText || status.task || "Timer";
  const activityState = timerActivityState(status);

  return {
    activityId: `timer-${String(timer.id || "unknown")}`,
    activityType: "timer",
    priority: ACTIVITY_PRIORITIES.timer,
    createdAt,
    updatedAt,
    expiresAt: null,
    isTransient: false,
    status: {
      id: String(timer.id || ""),
      state: activityState,
      timerState: String(timer.state || ""),
      presentationState: String(status.state || "idle"),
      durationSeconds,
      remainingSeconds,
      startedAt: timer.startedAt,
      updatedAt: timer.updatedAt || status.updatedAt,
      displayText,
      task: status.task || "Timer",
      detail: status.detail || "",
      error: timer.error || "",
      replacedPrevious: timer.replacedPrevious === true
    },
    compactSurface: {
      glyph: activityState === "completed" ? "timer.done" : "timer",
      label: activityState === "completed" ? "Done" : displayText,
      progress: clampProgress(remainingSeconds, durationSeconds)
    },
    expandedSurface: {
      title: activityState === "completed" ? "Timer done" : "Timer",
      subtitle: status.detail || status.task || displayText,
      valueLabel: activityState === "completed" ? "Done" : displayText
    },
    source,
    metadata: {
      inputKind: "timer",
      timerState: String(timer.state || ""),
      presentationState: String(status.state || "idle")
    },
    revealReadyPath: "",
    persisted: false
  };
}

function collectTimerActivityStatus(options = {}) {
  const now = options.now || new Date();
  const source = String(options.source || DEFAULT_SOURCE).trim() || DEFAULT_SOURCE;
  const timerState = options.timerState || null;
  const timer = timerState
    ? (options.completeTimerIfElapsed || completeTimerIfElapsed)(timerState, { now: () => now })
    : (options.timer || null);

  if (!timer) return null;

  const status = timerToNativeStatus(timer, { now });
  const activity = buildTimerActivityFromStatus({ ...status, source }, { source });
  return {
    ...status,
    activityType: "timer",
    source,
    activity
  };
}

module.exports = {
  buildTimerActivityFromStatus,
  collectTimerActivityStatus
};
