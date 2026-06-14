const { formatTimerDuration } = require("./timer-duration");

const TIMER_STATES = Object.freeze({
  IDLE: "idle",
  RUNNING: "running",
  DONE: "done"
});

function createTimerState(initialTimer = null) {
  return {
    activeTimer: initialTimer || null
  };
}

function toIsoTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("timer timestamp must be a valid date");
  }
  return date.toISOString();
}

function defaultNow() {
  return new Date();
}

function createTimerId(startedAt, durationSeconds) {
  return `timer-${startedAt.replace(/[^0-9]/g, "")}-${durationSeconds}s`;
}

function assertNormalizedDuration(normalizedDuration) {
  if (!normalizedDuration || typeof normalizedDuration !== "object") {
    throw new Error("normalized timer duration is required");
  }

  const durationSeconds = Number(normalizedDuration.durationSeconds);
  if (!Number.isSafeInteger(durationSeconds) || durationSeconds <= 0) {
    throw new Error("normalized timer duration must include positive durationSeconds");
  }

  return durationSeconds;
}

function isRunningTimer(timer) {
  return Boolean(timer && timer.state === TIMER_STATES.RUNNING);
}

function startTimer(timerState, normalizedDuration, options = {}) {
  if (!timerState || typeof timerState !== "object") {
    throw new Error("timerState must be an object");
  }

  const durationSeconds = assertNormalizedDuration(normalizedDuration);
  const now = options.now || defaultNow;
  const startedAt = toIsoTimestamp(now());
  const replacedPrevious = isRunningTimer(timerState.activeTimer);
  const id = options.id || createTimerId(startedAt, durationSeconds);
  const displayText = normalizedDuration.displayText || formatTimerDuration(durationSeconds);

  const timer = {
    id,
    durationSeconds,
    remainingSeconds: durationSeconds,
    state: TIMER_STATES.RUNNING,
    startedAt,
    updatedAt: startedAt,
    displayText,
    error: "",
    replacedPrevious
  };

  timerState.activeTimer = timer;
  return timer;
}

module.exports = {
  TIMER_STATES,
  createTimerId,
  createTimerState,
  startTimer
};
