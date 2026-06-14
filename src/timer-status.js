const { TIMER_STATES } = require("./timer-state");
const { formatTimerDuration } = require("./timer-duration");

function toDate(value, fieldName) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date`);
  }
  return date;
}

function remainingSecondsForTimer(timer, now) {
  const durationSeconds = Number(timer.durationSeconds);
  if (!Number.isSafeInteger(durationSeconds) || durationSeconds <= 0) {
    throw new Error("timer.durationSeconds must be a positive integer");
  }

  const reportedRemaining = Number.isSafeInteger(Number(timer.remainingSeconds))
    ? Number(timer.remainingSeconds)
    : durationSeconds;

  if (timer.state === TIMER_STATES.DONE) return 0;
  if (timer.state !== TIMER_STATES.RUNNING) {
    return Math.max(0, Math.min(reportedRemaining, durationSeconds));
  }

  const startedAt = toDate(timer.startedAt, "timer.startedAt");
  const nowDate = toDate(now, "now");
  const elapsedSeconds = Math.max(0, Math.floor((nowDate.getTime() - startedAt.getTime()) / 1000));
  return Math.max(0, Math.min(reportedRemaining, durationSeconds - elapsedSeconds));
}

function timerStatusState(timer, remainingSeconds) {
  if (timer.state === TIMER_STATES.DONE || remainingSeconds <= 0) return "success";
  if (timer.state === TIMER_STATES.RUNNING) return "running";
  return "idle";
}

function timerStatusTask(timer, remainingSeconds) {
  if (remainingSeconds <= 0 || timer.state === TIMER_STATES.DONE) return "Timer done";
  return `Timer · ${formatTimerDuration(remainingSeconds)} remaining`;
}

function timerStatusDetail(timer, remainingSeconds) {
  const original = formatTimerDuration(timer.durationSeconds);
  if (remainingSeconds <= 0 || timer.state === TIMER_STATES.DONE) {
    return `${original} timer elapsed.`;
  }
  return `${formatTimerDuration(remainingSeconds)} remaining of ${original}.`;
}

function timerToNativeStatus(timer, options = {}) {
  if (!timer || typeof timer !== "object") {
    throw new Error("timer is required");
  }

  const now = options.now || new Date();
  const nowIso = toDate(now, "now").toISOString();
  const remainingSeconds = remainingSecondsForTimer(timer, now);
  const state = timerStatusState(timer, remainingSeconds);
  const updatedAt = timer.updatedAt || nowIso;
  const timerState = remainingSeconds <= 0 ? TIMER_STATES.DONE : timer.state;
  const displayText = timerState === TIMER_STATES.DONE
    ? "Done"
    : timer.displayText || formatTimerDuration(timer.durationSeconds);

  return {
    agent: "Timer",
    state,
    task: timerStatusTask(timer, remainingSeconds),
    updatedAt,
    detail: timerStatusDetail(timer, remainingSeconds),
    timer: {
      id: String(timer.id || ""),
      durationSeconds: Number(timer.durationSeconds),
      remainingSeconds,
      state: timerState,
      startedAt: toDate(timer.startedAt, "timer.startedAt").toISOString(),
      updatedAt,
      displayText,
      error: timer.error || "",
      replacedPrevious: timer.replacedPrevious === true
    }
  };
}

function buildTimerStatusPayload(timer, options = {}) {
  if (!timer) return { statuses: [] };
  return {
    statuses: [timerToNativeStatus(timer, options)]
  };
}

module.exports = {
  buildTimerStatusPayload,
  remainingSecondsForTimer,
  timerToNativeStatus
};
