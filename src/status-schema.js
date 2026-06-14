const STATES = new Set(["idle", "running", "success", "warning", "error"]);
const REQUIRED_FIELDS = ["agent", "state", "task", "updatedAt", "detail"];
const TIMER_STATES = new Set(["idle", "running", "stopped", "reset", "done"]);
const TIMER_REQUIRED_FIELDS = [
  "id",
  "durationSeconds",
  "remainingSeconds",
  "state",
  "startedAt",
  "updatedAt",
  "displayText",
  "error",
  "replacedPrevious"
];

function isValidIsoDateString(value) {
  if (typeof value !== "string" || value.trim() === "") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function validateTimerStatus(status, index, errors) {
  if (status.agent !== "Timer" && status.timer === undefined) return;

  if (!status.timer || typeof status.timer !== "object" || Array.isArray(status.timer)) {
    errors.push(`statuses[${index}].timer must be an object for Timer status items.`);
    return;
  }

  for (const field of TIMER_REQUIRED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(status.timer, field)) {
      errors.push(`statuses[${index}].timer.${field} is required.`);
    }
  }

  if (typeof status.timer.id !== "string" || status.timer.id.trim() === "") {
    errors.push(`statuses[${index}].timer.id must be a non-empty string.`);
  }

  if (!Number.isSafeInteger(status.timer.durationSeconds) || status.timer.durationSeconds <= 0) {
    errors.push(`statuses[${index}].timer.durationSeconds must be a positive integer.`);
  }

  if (!Number.isSafeInteger(status.timer.remainingSeconds) || status.timer.remainingSeconds < 0) {
    errors.push(`statuses[${index}].timer.remainingSeconds must be a non-negative integer.`);
  } else if (
    Number.isSafeInteger(status.timer.durationSeconds) &&
    status.timer.durationSeconds > 0 &&
    status.timer.remainingSeconds > status.timer.durationSeconds
  ) {
    errors.push(`statuses[${index}].timer.remainingSeconds must not exceed durationSeconds.`);
  }

  if (typeof status.timer.state !== "string" || !TIMER_STATES.has(status.timer.state)) {
    errors.push(
      `statuses[${index}].timer.state must be one of ${Array.from(TIMER_STATES).join(", ")}.`
    );
  }

  if (!isValidIsoDateString(status.timer.startedAt)) {
    errors.push(`statuses[${index}].timer.startedAt must be an ISO-8601 UTC timestamp.`);
  }

  if (!isValidIsoDateString(status.timer.updatedAt)) {
    errors.push(`statuses[${index}].timer.updatedAt must be an ISO-8601 UTC timestamp.`);
  }

  if (typeof status.timer.displayText !== "string" || status.timer.displayText.trim() === "") {
    errors.push(`statuses[${index}].timer.displayText must be a non-empty string.`);
  }

  if (typeof status.timer.error !== "string") {
    errors.push(`statuses[${index}].timer.error must be a string.`);
  }

  if (typeof status.timer.replacedPrevious !== "boolean") {
    errors.push(`statuses[${index}].timer.replacedPrevious must be a boolean.`);
  }
}

function normalizeStatusPayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object" && Array.isArray(payload.statuses)) {
    return payload.statuses;
  }

  return null;
}

function validateStatusPayload(payload) {
  const statuses = normalizeStatusPayload(payload);
  const errors = [];

  if (!statuses) {
    return {
      ok: false,
      statuses: [],
      errors: ["Status JSON must be an array or an object with a statuses array."]
    };
  }

  statuses.forEach((status, index) => {
    if (!status || typeof status !== "object" || Array.isArray(status)) {
      errors.push(`statuses[${index}] must be an object.`);
      return;
    }

    for (const field of REQUIRED_FIELDS) {
      if (typeof status[field] !== "string" || status[field].trim() === "") {
        errors.push(`statuses[${index}].${field} must be a non-empty string.`);
      }
    }

    if (typeof status.state === "string" && !STATES.has(status.state)) {
      errors.push(
        `statuses[${index}].state must be one of ${Array.from(STATES).join(", ")}.`
      );
    }

    validateTimerStatus(status, index, errors);
  });

  return {
    ok: errors.length === 0,
    statuses,
    errors
  };
}

module.exports = {
  REQUIRED_FIELDS,
  STATES,
  TIMER_REQUIRED_FIELDS,
  TIMER_STATES,
  validateStatusPayload
};
