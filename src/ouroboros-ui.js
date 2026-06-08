(function ouroborosUiFactory(root) {
  const OUROBOROS_AGENT = "Ouroboros";
  const STATE_LABELS = Object.freeze({
    idle: "Idle",
    running: "Running",
    success: "Success",
    warning: "Warning",
    error: "Error"
  });

  const MOCK_OUROBOROS_UI_STATE = Object.freeze({
    agent: OUROBOROS_AGENT,
    state: "idle",
    task: "No Ouroboros status",
    updatedAt: "mock",
    detail: "Ouroboros is not present in the watched status file.",
    isMock: true
  });

  function createOuroborosViewModel(statuses) {
    return toOuroborosViewModel(findOuroborosStatus(statuses) || MOCK_OUROBOROS_UI_STATE);
  }

  function findOuroborosStatus(statuses) {
    if (!Array.isArray(statuses)) {
      return null;
    }

    return statuses.find(
      (status) =>
        status &&
        typeof status.agent === "string" &&
        status.agent.trim().toLowerCase() === OUROBOROS_AGENT.toLowerCase()
    );
  }

  function toOuroborosViewModel(status) {
    const isMock = status.isMock === true;
    const stateLabel = STATE_LABELS[status.state] || status.state;
    const task = isMock ? `${status.task} (mock)` : status.task;

    return {
      agent: OUROBOROS_AGENT,
      state: status.state,
      stateLabel,
      task,
      detail: status.detail,
      updatedAt: status.updatedAt,
      isMock,
      cssClass: `status-card ${status.state}${isMock ? " mock" : ""}`,
      dotClass: `state-dot ${status.state}`,
      ariaLabel: `${OUROBOROS_AGENT} ${stateLabel}: ${task}`
    };
  }

  function renderOuroborosStateView(viewModel) {
    return `
      <article class="${escapeHtml(viewModel.cssClass)}" aria-label="${escapeHtml(viewModel.ariaLabel)}" data-agent="ouroboros">
        <div class="status-topline">
          <span class="${escapeHtml(viewModel.dotClass)}"></span>
          <strong>${escapeHtml(viewModel.agent)}</strong>
          <span>${escapeHtml(viewModel.stateLabel)}</span>
        </div>
        <h2>${escapeHtml(viewModel.task)}</h2>
        <p>${escapeHtml(viewModel.detail)}</p>
        <time>${escapeHtml(viewModel.updatedAt)}</time>
      </article>
    `;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  const api = {
    MOCK_OUROBOROS_UI_STATE,
    OUROBOROS_AGENT,
    createOuroborosViewModel,
    renderOuroborosStateView,
    toOuroborosViewModel
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.DynamacOuroborosUi = api;
})(typeof window !== "undefined" ? window : globalThis);
