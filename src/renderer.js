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
  const snufflesViewModel = snufflesUi.createSnufflesViewModel(statuses);
  const codexViewModel = codexUi.createCodexViewModel(statuses);
  const ouroborosViewModel = ouroborosUi.createOuroborosViewModel(statuses);
  const viewModels = [];
  let renderedSnuffles = false;
  let renderedCodex = false;
  let renderedOuroboros = false;

  statuses.forEach((status) => {
    if (status.agent.trim().toLowerCase() === snufflesUi.SNUFFLES_AGENT.toLowerCase()) {
      viewModels.push(snufflesViewModel);
      renderedSnuffles = true;
      return;
    }

    if (status.agent.trim().toLowerCase() === codexUi.CODEX_AGENT.toLowerCase()) {
      viewModels.push(codexViewModel);
      renderedCodex = true;
      return;
    }

    if (status.agent.trim().toLowerCase() === ouroborosUi.OUROBOROS_AGENT.toLowerCase()) {
      viewModels.push(ouroborosViewModel);
      renderedOuroboros = true;
      return;
    }

    viewModels.push(snufflesUi.toStatusViewModel(status));
  });

  if (!renderedSnuffles) {
    viewModels.unshift(snufflesViewModel);
  }

  if (!renderedCodex) {
    viewModels.splice(1, 0, codexViewModel);
  }

  if (!renderedOuroboros) {
    viewModels.splice(2, 0, ouroborosViewModel);
  }

  return viewModels;
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
