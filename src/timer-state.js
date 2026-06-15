const { formatTimerDuration } = require("./timer-duration");

const TIMER_STATES = Object.freeze({
  IDLE: "idle",
  RUNNING: "running",
  PAUSED: "paused",
  STOPPED: "stopped",
  RESET: "reset",
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

function toTimerDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("timer timestamp must be a valid date");
  }
  return date;
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

function remainingSecondsAt(timer, now) {
  const durationSeconds = assertNormalizedDuration({
    durationSeconds: timer.durationSeconds
  });
  const startedAt = toTimerDate(timer.startedAt);
  const nowDate = toTimerDate(now);
  const elapsedSeconds = Math.max(0, Math.floor((nowDate.getTime() - startedAt.getTime()) / 1000));
  const reportedRemaining = Number.isSafeInteger(Number(timer.remainingSeconds))
    ? Number(timer.remainingSeconds)
    : durationSeconds;

  return Math.max(0, Math.min(reportedRemaining, durationSeconds - elapsedSeconds));
}

function assertTimerState(timerState) {
  if (!timerState || typeof timerState !== "object") {
    throw new Error("timerState must be an object");
  }
}

function startTimer(timerState, normalizedDuration, options = {}) {
  assertTimerState(timerState);

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

function resetTimer(timerState, options = {}) {
  assertTimerState(timerState);

  const activeTimer = timerState.activeTimer;
  if (!activeTimer) return null;

  const durationSeconds = assertNormalizedDuration({
    durationSeconds: activeTimer.durationSeconds
  });
  const now = options.now || defaultNow;
  const updatedAt = toIsoTimestamp(now());
  const displayText = activeTimer.displayText || formatTimerDuration(durationSeconds);

  const resetTimerState = {
    ...activeTimer,
    durationSeconds,
    remainingSeconds: durationSeconds,
    state: TIMER_STATES.RESET,
    startedAt: updatedAt,
    updatedAt,
    displayText,
    error: ""
  };

  timerState.activeTimer = resetTimerState;
  return resetTimerState;
}

function stopTimer(timerState, options = {}) {
  assertTimerState(timerState);

  const activeTimer = timerState.activeTimer;
  if (!isRunningTimer(activeTimer)) return activeTimer || null;

  const now = options.now || defaultNow;
  const stoppedAt = toIsoTimestamp(now());
  const stoppedTimerState = {
    ...activeTimer,
    remainingSeconds: remainingSecondsAt(activeTimer, stoppedAt),
    state: TIMER_STATES.STOPPED,
    updatedAt: stoppedAt,
    error: ""
  };

  timerState.activeTimer = stoppedTimerState;
  return stoppedTimerState;
}

function pauseTimer(timerState, options = {}) {
  assertTimerState(timerState);

  const activeTimer = timerState.activeTimer;
  if (!isRunningTimer(activeTimer)) return activeTimer || null;

  const now = options.now || defaultNow;
  const pausedAt = toIsoTimestamp(now());
  const pausedTimerState = {
    ...activeTimer,
    remainingSeconds: remainingSecondsAt(activeTimer, pausedAt),
    state: TIMER_STATES.PAUSED,
    updatedAt: pausedAt,
    error: ""
  };

  timerState.activeTimer = pausedTimerState;
  return pausedTimerState;
}

function completeTimerIfElapsed(timerState, options = {}) {
  assertTimerState(timerState);

  const activeTimer = timerState.activeTimer;
  if (!isRunningTimer(activeTimer)) return activeTimer || null;

  const now = options.now || defaultNow;
  const completedAt = toIsoTimestamp(now());
  const remainingSeconds = remainingSecondsAt(activeTimer, completedAt);
  if (remainingSeconds > 0) return activeTimer;

  const completedTimerState = {
    ...activeTimer,
    remainingSeconds: 0,
    state: TIMER_STATES.DONE,
    updatedAt: completedAt,
    error: ""
  };

  timerState.activeTimer = completedTimerState;
  return completedTimerState;
}

module.exports = {
  TIMER_STATES,
  completeTimerIfElapsed,
  createTimerId,
  createTimerState,
  isRunningTimer,
  pauseTimer,
  resetTimer,
  stopTimer,
  startTimer
};
