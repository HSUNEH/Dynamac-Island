(function snufflesUiFactory(root) {
  const SNUFFLES_AGENT = "Snuffles";
  const STATE_LABELS = Object.freeze({
    idle: "Idle",
    running: "Running",
    success: "Success",
    warning: "Warning",
    error: "Error"
  });

  function createSnufflesViewModel(statuses) {
    const snuffles = findSnufflesStatus(statuses);
    if (!snuffles) {
      return null;
    }
    const stateLabel = STATE_LABELS[snuffles.state] || snuffles.state;
    const task = snuffles.task;

    return {
      agent: SNUFFLES_AGENT,
      state: snuffles.state,
      stateLabel,
      task,
      detail: snuffles.detail,
      updatedAt: snuffles.updatedAt,
      isMock: false,
      cssClass: `status-card ${snuffles.state}`,
      dotClass: `state-dot ${snuffles.state}`,
      ariaLabel: `${SNUFFLES_AGENT} ${stateLabel}: ${task}`
    };
  }

  function findSnufflesStatus(statuses) {
    if (!Array.isArray(statuses)) {
      return null;
    }

    return statuses.find(
      (status) =>
        status &&
        typeof status.agent === "string" &&
        status.agent.trim().toLowerCase() === SNUFFLES_AGENT.toLowerCase()
    );
  }

  function toStatusViewModel(status) {
    const stateLabel = STATE_LABELS[status.state] || status.state;

    return {
      agent: status.agent,
      state: status.state,
      stateLabel,
      task: status.task,
      detail: status.detail,
      updatedAt: status.updatedAt,
      isMock: false,
      cssClass: `status-card ${status.state}`,
      dotClass: `state-dot ${status.state}`,
      ariaLabel: `${status.agent} ${stateLabel}: ${status.task}`
    };
  }

  function renderStatusCard(viewModel) {
    return `
      <article class="${escapeHtml(viewModel.cssClass)}" aria-label="${escapeHtml(viewModel.ariaLabel)}">
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
    SNUFFLES_AGENT,
    createSnufflesViewModel,
    renderStatusCard,
    toStatusViewModel
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.DynamacSnufflesUi = api;
})(typeof window !== "undefined" ? window : globalThis);
