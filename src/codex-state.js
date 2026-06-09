const { STATES, validateStatusPayload } = require("./status-schema");

const CODEX_AGENT = "Codex";
const STATE_LABELS = Object.freeze({
  idle: "Idle",
  running: "Running",
  success: "Success",
  warning: "Warning",
  error: "Error"
});

function parseCodexState(payload) {
  const validation = validateStatusPayload(payload);

  if (!validation.ok) {
    return {
      ok: false,
      codex: null,
      errors: validation.errors
    };
  }

  const sourceStatus = validation.statuses.find(
    (status) => status.agent.trim().toLowerCase() === CODEX_AGENT.toLowerCase()
  );

  if (!sourceStatus) {
    return {
      ok: true,
      codex: null,
      errors: []
    };
  }

  return {
    ok: true,
    codex: toCodexState(sourceStatus, false),
    errors: []
  };
}

function toCodexState(status, isMock) {
  return {
    agent: CODEX_AGENT,
    state: status.state,
    task: status.task,
    updatedAt: status.updatedAt,
    detail: status.detail,
    isMock
  };
}

function toCodexViewModel(parsedCodexState) {
  if (!parsedCodexState || parsedCodexState.ok !== true || !parsedCodexState.codex) {
    return {
      ok: false,
      agent: CODEX_AGENT,
      title: "Codex status unavailable",
      state: "error",
      stateLabel: STATE_LABELS.error,
      task: "Invalid Codex status",
      detail: formatErrors(parsedCodexState && parsedCodexState.errors),
      updatedAt: "unknown",
      isMock: false,
      cssClass: "status-card error",
      dotClass: "state-dot error",
      summary: "Codex status input needs attention",
      ariaLabel: "Codex error: Invalid Codex status"
    };
  }

  const codex = parsedCodexState.codex;
  const stateLabel = STATE_LABELS[codex.state] || codex.state;
  const task = codex.task;

  return {
    ok: true,
    agent: codex.agent,
    title: codex.agent,
    state: codex.state,
    stateLabel,
    task,
    detail: codex.detail,
    updatedAt: codex.updatedAt,
    isMock: false,
    cssClass: `status-card ${codex.state}`,
    dotClass: `state-dot ${codex.state}`,
    summary: `${codex.agent} is ${stateLabel.toLowerCase()}`,
    ariaLabel: `${codex.agent} ${stateLabel}: ${task}`
  };
}

function formatErrors(errors) {
  if (Array.isArray(errors) && errors.length > 0) {
    return errors.join(" ");
  }

  return "Codex state could not be derived from the watched status data.";
}

module.exports = {
  CODEX_AGENT,
  CODEX_STATES: STATES,
  parseCodexState,
  toCodexViewModel
};
