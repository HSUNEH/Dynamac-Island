const STATES = new Set(["idle", "running", "success", "warning", "error"]);
const REQUIRED_FIELDS = ["agent", "state", "task", "updatedAt", "detail"];

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
  validateStatusPayload
};
