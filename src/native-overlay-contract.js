const { TIMER_REQUIRED_FIELDS, TIMER_STATES, validateStatusPayload } = require("./status-schema");

const NATIVE_TIMER_CONTRACT = Object.freeze({
  agent: "Timer",
  requiredTimerFields: TIMER_REQUIRED_FIELDS,
  lifecycleStates: TIMER_STATES
});

function activeNativeTimerStatus(statuses) {
  if (!Array.isArray(statuses)) return null;
  return statuses.find((status) => status.agent === NATIVE_TIMER_CONTRACT.agent && status.timer);
}

function validateNativeOverlayStatusContract(payload) {
  const validation = validateStatusPayload(payload);
  const errors = [...validation.errors];

  if (!validation.ok) {
    return {
      ok: false,
      statuses: validation.statuses,
      activeTimerStatus: null,
      errors
    };
  }

  const timerStatus = activeNativeTimerStatus(validation.statuses);
  if (!timerStatus) {
    errors.push("Native overlay status contract must include a Timer status item with timer details.");
  }

  return {
    ok: errors.length === 0,
    statuses: validation.statuses,
    activeTimerStatus: timerStatus || null,
    errors
  };
}

module.exports = {
  NATIVE_TIMER_CONTRACT,
  activeNativeTimerStatus,
  validateNativeOverlayStatusContract
};
