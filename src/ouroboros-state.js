const { STATES, validateStatusPayload } = require("./status-schema");

const OUROBOROS_AGENT = "Ouroboros";
const STATE_LABELS = Object.freeze({
  idle: "Idle",
  running: "Running",
  success: "Success",
  warning: "Warning",
  error: "Error"
});

const MOCK_OUROBOROS_STATE = Object.freeze({
  agent: OUROBOROS_AGENT,
  state: "idle",
  task: "No Ouroboros status",
  updatedAt: "mock",
  detail: "Ouroboros is not present in the watched status file.",
  isMock: true
});

function parseOuroborosState(payload) {
  const validation = validateStatusPayload(payload);

  if (!validation.ok) {
    return {
      ok: false,
      ouroboros: null,
      errors: validation.errors
    };
  }

  const sourceStatus = validation.statuses.find(
    (status) => status.agent.trim().toLowerCase() === OUROBOROS_AGENT.toLowerCase()
  );

  if (!sourceStatus) {
    return {
      ok: true,
      ouroboros: { ...MOCK_OUROBOROS_STATE },
      errors: []
    };
  }

  return {
    ok: true,
    ouroboros: toOuroborosState(sourceStatus, false),
    errors: []
  };
}

function toOuroborosState(status, isMock) {
  return {
    agent: OUROBOROS_AGENT,
    state: status.state,
    task: status.task,
    updatedAt: status.updatedAt,
    detail: status.detail,
    isMock
  };
}

function toOuroborosViewModel(parsedOuroborosState) {
  if (!parsedOuroborosState || parsedOuroborosState.ok !== true || !parsedOuroborosState.ouroboros) {
    return {
      ok: false,
      agent: OUROBOROS_AGENT,
      title: "Ouroboros status unavailable",
      state: "error",
      stateLabel: STATE_LABELS.error,
      task: "Invalid Ouroboros status",
      detail: formatErrors(parsedOuroborosState && parsedOuroborosState.errors),
      updatedAt: "unknown",
      isMock: false,
      cssClass: "status-card error",
      dotClass: "state-dot error",
      summary: "Ouroboros status input needs attention",
      ariaLabel: "Ouroboros error: Invalid Ouroboros status"
    };
  }

  const ouroboros = parsedOuroborosState.ouroboros;
  const stateLabel = STATE_LABELS[ouroboros.state] || ouroboros.state;
  const task = ouroboros.isMock ? `${ouroboros.task} (mock)` : ouroboros.task;

  return {
    ok: true,
    agent: ouroboros.agent,
    title: ouroboros.agent,
    state: ouroboros.state,
    stateLabel,
    task,
    detail: ouroboros.detail,
    updatedAt: ouroboros.updatedAt,
    isMock: ouroboros.isMock,
    cssClass: `status-card ${ouroboros.state}${ouroboros.isMock ? " mock" : ""}`,
    dotClass: `state-dot ${ouroboros.state}`,
    summary: `${ouroboros.agent} is ${stateLabel.toLowerCase()}`,
    ariaLabel: `${ouroboros.agent} ${stateLabel}: ${task}`
  };
}

function formatErrors(errors) {
  if (Array.isArray(errors) && errors.length > 0) {
    return errors.join(" ");
  }

  return "Ouroboros state could not be derived from the watched status data.";
}

module.exports = {
  MOCK_OUROBOROS_STATE,
  OUROBOROS_AGENT,
  OUROBOROS_STATES: STATES,
  parseOuroborosState,
  toOuroborosViewModel
};
