(function timerCountdownFactory(root) {
  const RUNNING = "running";
  const DONE = "done";

  function createTimerCountdown(timer, options = {}) {
    if (!timer || typeof timer !== "object") {
      throw new Error("timer is required");
    }

    const durationSeconds = positiveInteger(timer.durationSeconds, "timer.durationSeconds");
    const reportedRemaining = nonNegativeInteger(timer.remainingSeconds, durationSeconds);
    const timerState = String(timer.state || "idle");
    const remainingSeconds = timerState === RUNNING
      ? runningRemainingSeconds(timer, durationSeconds, reportedRemaining, options.now || new Date())
      : clamp(reportedRemaining, 0, durationSeconds);
    const elapsedSeconds = durationSeconds - remainingSeconds;
    const isDone = timerState === DONE || remainingSeconds <= 0;

    return {
      durationSeconds,
      remainingSeconds,
      elapsedSeconds,
      progressPercent: clamp(Math.round((elapsedSeconds / durationSeconds) * 100), 0, 100),
      state: isDone ? DONE : timerState,
      isDone,
      compactText: formatTimerClock(remainingSeconds)
    };
  }

  function runningRemainingSeconds(timer, durationSeconds, reportedRemaining, now) {
    const startedAt = toDate(timer.startedAt, "timer.startedAt");
    const nowDate = toDate(now, "now");
    const elapsedSeconds = Math.max(0, Math.floor((nowDate.getTime() - startedAt.getTime()) / 1000));
    return clamp(Math.min(reportedRemaining, durationSeconds - elapsedSeconds), 0, durationSeconds);
  }

  function formatTimerClock(totalSeconds) {
    const seconds = nonNegativeInteger(totalSeconds, 0);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
    }

    return `${minutes}:${String(remainder).padStart(2, "0")}`;
  }

  function toDate(value, fieldName) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`${fieldName} must be a valid date`);
    }
    return date;
  }

  function positiveInteger(value, fieldName) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number <= 0) {
      throw new Error(`${fieldName} must be a positive integer`);
    }
    return number;
  }

  function nonNegativeInteger(value, fallback) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  const api = {
    createTimerCountdown,
    formatTimerClock
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.DynamacTimerCountdown = api;
})(typeof window !== "undefined" ? window : globalThis);
