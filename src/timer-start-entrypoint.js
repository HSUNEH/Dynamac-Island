const { parseTimerDuration } = require("./timer-duration");
const { startTimer } = require("./timer-state");
const { writeTimerStatusSnapshot } = require("./timer-status-store");

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
  const result = {
    ok: true,
    timer
  };

  if (options.statusPath || options.writeStatusSnapshot) {
    const writeStatus = options.writeStatusSnapshot || writeTimerStatusSnapshot;
    result.status = writeStatus({
      outputPath: options.statusPath,
      timer,
      now: options.statusNow || options.now,
      fs: options.fs
    });
  }

  return result;
}

module.exports = {
  startTimerFromInput
};
