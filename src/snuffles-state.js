const { STATES, validateStatusPayload } = require("./status-schema");

const SNUFFLES_AGENT = "Snuffles";
const STATE_LABELS = Object.freeze({
  idle: "Idle",
  running: "Running",
  success: "Success",
  warning: "Warning",
  error: "Error"
});

function parseSnufflesState(payload) {
  const validation = validateStatusPayload(payload);

  if (!validation.ok) {
    return {
      ok: false,
      snuffles: null,
      errors: validation.errors
    };
  }

  const sourceStatus = validation.statuses.find(
    (status) => status.agent.trim().toLowerCase() === SNUFFLES_AGENT.toLowerCase()
  );

  if (!sourceStatus) {
    return {
      ok: true,
      snuffles: null,
      errors: []
    };
  }

  return {
    ok: true,
    snuffles: toSnufflesState(sourceStatus, false),
    errors: []
  };
}

function toSnufflesState(status, isMock) {
  return {
    agent: SNUFFLES_AGENT,
    state: status.state,
    task: status.task,
    updatedAt: status.updatedAt,
    detail: status.detail,
    isMock
  };
}

function toSnufflesViewModel(parsedSnufflesState) {
  if (!parsedSnufflesState || parsedSnufflesState.ok !== true || !parsedSnufflesState.snuffles) {
    return {
      ok: false,
      agent: SNUFFLES_AGENT,
      title: "Snuffles status unavailable",
      state: "error",
      stateLabel: STATE_LABELS.error,
      task: "Invalid Snuffles status",
      detail: formatErrors(parsedSnufflesState && parsedSnufflesState.errors),
      updatedAt: "unknown",
      isMock: false,
      cssClass: "status-card error",
      dotClass: "state-dot error",
      summary: "Snuffles status input needs attention",
      ariaLabel: "Snuffles error: Invalid Snuffles status"
    };
  }

  const snuffles = parsedSnufflesState.snuffles;
  const stateLabel = STATE_LABELS[snuffles.state] || snuffles.state;
  const task = snuffles.task;

  return {
    ok: true,
    agent: snuffles.agent,
    title: snuffles.agent,
    state: snuffles.state,
    stateLabel,
    task,
    detail: snuffles.detail,
    updatedAt: snuffles.updatedAt,
    isMock: false,
    cssClass: `status-card ${snuffles.state}`,
    dotClass: `state-dot ${snuffles.state}`,
    summary: `${snuffles.agent} is ${stateLabel.toLowerCase()}`,
    ariaLabel: `${snuffles.agent} ${stateLabel}: ${task}`
  };
}

function formatErrors(errors) {
  if (Array.isArray(errors) && errors.length > 0) {
    return errors.join(" ");
  }

  return "Snuffles state could not be derived from the watched status data.";
}

module.exports = {
  SNUFFLES_AGENT,
  SNUFFLES_STATES: STATES,
  parseSnufflesState,
  toSnufflesViewModel
};
