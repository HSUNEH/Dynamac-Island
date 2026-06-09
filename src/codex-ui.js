(function codexUiFactory(root) {
  const CODEX_AGENT = "Codex";
  const STATE_LABELS = Object.freeze({
    idle: "Idle",
    running: "Running",
    success: "Success",
    warning: "Warning",
    error: "Error"
  });

  function createCodexViewModel(statuses) {
    const codex = findCodexStatus(statuses);
    return codex ? toCodexViewModel(codex) : null;
  }

  function findCodexStatus(statuses) {
    if (!Array.isArray(statuses)) {
      return null;
    }

    return statuses.find(
      (status) =>
        status &&
        typeof status.agent === "string" &&
        status.agent.trim().toLowerCase() === CODEX_AGENT.toLowerCase()
    );
  }

  function toCodexViewModel(status) {
    const stateLabel = STATE_LABELS[status.state] || status.state;
    const task = status.task;

    return {
      agent: CODEX_AGENT,
      state: status.state,
      stateLabel,
      task,
      detail: status.detail,
      updatedAt: status.updatedAt,
      isMock: false,
      cssClass: `status-card ${status.state}`,
      dotClass: `state-dot ${status.state}`,
      ariaLabel: `${CODEX_AGENT} ${stateLabel}: ${task}`
    };
  }

  function renderCodexStateView(viewModel) {
    return `
      <article class="${escapeHtml(viewModel.cssClass)}" aria-label="${escapeHtml(viewModel.ariaLabel)}" data-agent="codex">
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
    CODEX_AGENT,
    createCodexViewModel,
    renderCodexStateView,
    toCodexViewModel
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.DynamacCodexUi = api;
})(typeof window !== "undefined" ? window : globalThis);
