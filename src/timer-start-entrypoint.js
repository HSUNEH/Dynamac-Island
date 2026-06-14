const { parseTimerDuration } = require("./timer-duration");
const { startTimer } = require("./timer-state");

function startTimerFromInput(timerState, rawInput, options = {}) {
  const parseDuration = options.parseDuration || parseTimerDuration;
  const start = options.startTimer || startTimer;
  const parsedDuration = parseDuration(rawInput);

  if (!parsedDuration || parsedDuration.ok !== true) {
    return {
      ok: false,
      error: parsedDuration && typeof parsedDuration.error === "string"
        ? parsedDuration.error
        : "Timer duration could not be parsed."
    };
  }

  const timer = start(timerState, parsedDuration, options);
  return {
    ok: true,
    timer
  };
}

module.exports = {
  startTimerFromInput
};
