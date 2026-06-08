const pillView = window.DynamacPillView.mountPillView(document);
const { summary, content, source, reload } = pillView;
const snufflesUi = window.DynamacSnufflesUi;
const codexUi = window.DynamacCodexUi;
const ouroborosUi = window.DynamacOuroborosUi;

function renderError(payload) {
  summary.textContent = "Status input error";
  content.className = "error-panel";
  content.innerHTML = `
    <div class="state-dot error"></div>
    <div>
      <h2>Invalid status file</h2>
      <ul>${payload.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>
    </div>
  `;
  source.textContent = payload.source || "status/status.json";
}

function renderStatuses(payload) {
  const runningCount = payload.statuses.filter((status) => status.state === "running").length;
  summary.textContent =
    runningCount > 0
      ? `${runningCount} active job${runningCount === 1 ? "" : "s"}`
      : "All systems settled";
  content.className = "status-grid";
  content.innerHTML = createStatusViews(payload.statuses).join("");
  source.textContent = payload.source || "status/status.json";
}

function createStatusViews(statuses) {
  return createStatusViewModels(statuses).map((viewModel) => {
    if (viewModel.agent === codexUi.CODEX_AGENT) {
      return codexUi.renderCodexStateView(viewModel);
    }

    if (viewModel.agent === ouroborosUi.OUROBOROS_AGENT) {
      return ouroborosUi.renderOuroborosStateView(viewModel);
    }

    return snufflesUi.renderStatusCard(viewModel);
  });
}

function createStatusViewModels(statuses) {
  return statuses.map((status) => {
    if (status.agent.trim().toLowerCase() === codexUi.CODEX_AGENT.toLowerCase()) {
      return codexUi.createCodexViewModel([status]);
    }

    if (status.agent.trim().toLowerCase() === ouroborosUi.OUROBOROS_AGENT.toLowerCase()) {
      return ouroborosUi.createOuroborosViewModel([status]);
    }

    return snufflesUi.toStatusViewModel(status);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function refresh() {
  const payload = await window.dynamacStatus.read();
  if (payload.ok) {
    renderStatuses(payload);
  } else {
    renderError(payload);
  }
}

reload.addEventListener("click", refresh);
window.dynamacStatus.onUpdate((payload) => {
  if (payload.ok) {
    renderStatuses(payload);
  } else {
    renderError(payload);
  }
});

refresh();
