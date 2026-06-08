const pillView = window.DynamacPillView.mountPillView(document, {
  onModeChange: (mode) => {
    if (window.dynamacWindow && typeof window.dynamacWindow.setMode === "function") {
      window.dynamacWindow.setMode(mode);
    }
  }
});
const { shell, summary, compactPrimary, compactMeta, content, source, reload, modeToggle } = pillView;
const modeController =
  pillView.modeController ||
  (typeof window.DynamacPillView.createModeController === "function"
    ? window.DynamacPillView.createModeController({ shell, toggle: modeToggle })
    : null);
const snufflesUi = window.DynamacSnufflesUi;
const codexUi = window.DynamacCodexUi;
const ouroborosUi = window.DynamacOuroborosUi;

function renderError(payload) {
  summary.textContent = "Status input error";
  setText(compactPrimary, "Status input error");
  setText(compactMeta, `${payload.errors.length} issue${payload.errors.length === 1 ? "" : "s"}`);
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
  const warningCount = payload.statuses.filter((status) => status.state === "warning").length;
  const compactStatus = selectCompactStatus(payload.statuses);
  summary.textContent =
    runningCount > 0
      ? `${runningCount} active job${runningCount === 1 ? "" : "s"}`
      : "All systems settled";
  setText(
    compactPrimary,
    compactStatus ? `${compactStatus.agent} · ${titleCase(compactStatus.state)}` : "No local status"
  );
  setText(compactMeta, compactMetaText({ runningCount, warningCount, total: payload.statuses.length }));
  content.className = "status-grid";
  content.innerHTML = createStatusViews(payload.statuses).join("");
  source.textContent = payload.source || "status/status.json";
}

function selectCompactStatus(statuses) {
  const statePriority = ["running", "warning", "error", "success", "idle"];

  for (const state of statePriority) {
    const match = statuses.find((status) => status.state === state);
    if (match) {
      return match;
    }
  }

  return statuses[0];
}

function compactMetaText(counts) {
  if (counts.runningCount > 0 && counts.warningCount > 0) {
    return `${counts.runningCount} active · ${counts.warningCount} warning`;
  }

  if (counts.runningCount > 0) {
    return `${counts.runningCount} active · ${counts.total} total`;
  }

  if (counts.warningCount > 0) {
    return `${counts.warningCount} warning · ${counts.total} total`;
  }

  return `${counts.total} settled`;
}

function titleCase(value) {
  const stringValue = String(value || "");
  return stringValue.slice(0, 1).toUpperCase() + stringValue.slice(1);
}

function setText(element, value) {
  if (element) {
    element.textContent = value;
  }
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
if (modeController && typeof modeController.getMode === "function") {
  modeController.getMode();
}
window.dynamacStatus.onUpdate((payload) => {
  if (payload.ok) {
    renderStatuses(payload);
  } else {
    renderError(payload);
  }
});

refresh();
