const UNIT_SECONDS = new Map([
  ["s", 1],
  ["sec", 1],
  ["secs", 1],
  ["second", 1],
  ["seconds", 1],
  ["m", 60],
  ["min", 60],
  ["mins", 60],
  ["minute", 60],
  ["minutes", 60],
  ["h", 3600],
  ["hr", 3600],
  ["hrs", 3600],
  ["hour", 3600],
  ["hours", 3600]
]);

const DURATION_PATTERN = /^(\d+)\s*([a-zA-Z]+)$/;

function formatTimerDuration(totalSeconds) {
  const seconds = Number(totalSeconds);
  if (!Number.isInteger(seconds) || seconds <= 0) {
    return "0s";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  const parts = [];

  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds}s`);

  return parts.join(" ");
}

function parseTimerDuration(input) {
  const rawInput = String(input ?? "").trim();
  const match = rawInput.match(DURATION_PATTERN);

  if (!match) {
    return {
      ok: false,
      error: "Timer duration must be a positive whole number followed by s, m, or h."
    };
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const unitSeconds = UNIT_SECONDS.get(unit);

  if (!unitSeconds) {
    return {
      ok: false,
      error: "Timer duration unit must be s, m, or h."
    };
  }

  const durationSeconds = amount * unitSeconds;
  if (!Number.isSafeInteger(durationSeconds) || durationSeconds <= 0) {
    return {
      ok: false,
      error: "Timer duration must be greater than 0 seconds."
    };
  }

  return {
    ok: true,
    input: rawInput,
    durationSeconds,
    displayText: formatTimerDuration(durationSeconds)
  };
}

module.exports = {
  formatTimerDuration,
  parseTimerDuration,
  UNIT_SECONDS
};
