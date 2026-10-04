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
const timerUi = window.DynamacTimerUi;
const clipboardPreviewUi = window.DynamacClipboardPreviewUi;

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
  const compactStatus = selectCompactStatus(payload);
  const timerCompactViewModel = timerUi && timerUi.isTimerStatus(compactStatus)
    ? timerUi.createTimerViewModel(compactStatus)
    : null;

  summary.textContent =
    runningCount > 0
      ? `${runningCount} active job${runningCount === 1 ? "" : "s"}`
      : "All systems settled";

  if (timerCompactViewModel) {
    timerUi.applyCompactTimerView({ compactPrimary, compactMeta }, timerCompactViewModel);
  } else {
    setText(
      compactPrimary,
      compactStatus ? `${compactStatus.agent} · ${titleCase(compactStatus.state)}` : "No local status"
    );
    setText(compactMeta, compactMetaText({ runningCount, warningCount, total: payload.statuses.length }));
  }

  content.className = "status-grid";
  content.innerHTML = createStatusViews(payload.statuses).join("");
  source.textContent = payload.source || "status/status.json";
}

function selectCompactStatus(payloadOrStatuses) {
  const statuses = Array.isArray(payloadOrStatuses) ? payloadOrStatuses : payloadOrStatuses.statuses;
  const routedCompactSurface = Array.isArray(payloadOrStatuses) ? null : payloadOrStatuses.activityRouter?.compactSurface;
  const routedStatus = statusForRoutedCompactSurface(statuses, routedCompactSurface);
  if (routedStatus) return routedStatus;

  const statePriority = ["running", "warning", "error", "success", "idle"];

  for (const state of statePriority) {
    const match = statuses.find((status) => status.state === state);
    if (match) {
      return match;
    }
  }

  return statuses[0];
}

function statusForRoutedCompactSurface(statuses, compactSurface) {
  if (!Array.isArray(statuses) || !compactSurface || typeof compactSurface !== "object") return null;

  const activityId = typeof compactSurface.activityId === "string" ? compactSurface.activityId.trim() : "";
  if (activityId !== "") {
    const statusByActivityId = statuses.find((status) => embeddedActivityForStatus(status)?.activityId === activityId || status.activityId === activityId);
    if (statusByActivityId) return statusByActivityId;
  }

  const activityType = typeof compactSurface.activityType === "string" ? compactSurface.activityType.trim() : "";
  if (activityType === "") return null;
  return statuses.find((status) => activityTypeForStatus(status) === activityType) || null;
}

function embeddedActivityForStatus(status) {
  if (!status || typeof status !== "object") return null;
  const candidates = [status.activity, status.volumeHud, status.brightnessHud, status.clipboardActivity, status.shelfActivity, status.dropActivity, status.batteryHud];
  return candidates.find((candidate) => candidate && typeof candidate === "object" && !Array.isArray(candidate)) || null;
}

function activityTypeForStatus(status) {
  const embedded = embeddedActivityForStatus(status);
  if (typeof embedded?.activityType === "string" && embedded.activityType.trim() !== "") return embedded.activityType.trim();
  if (typeof status?.activityType === "string" && status.activityType.trim() !== "") return status.activityType.trim();
  if (status?.agent === "Timer") return "timer";
  if (status?.agent === "Now Playing") return "nowPlaying";
  if (status?.agent === "Battery") return "battery";
  if (status?.agent === "Volume" || status?.agent === "DynaKeys Volume") return "volume";
  if (status?.agent === "Brightness" || status?.agent === "DynaKeys Brightness") return "brightness";
  if (status?.agent === "Clipboard" || status?.agent === "DynaClip") return "clipboard";
  if (status?.agent === "Shelf" || status?.agent === "DynaShelf") return "shelf";
  if (status?.agent === "Drop" || status?.agent === "DynaDrop") return "drop";
  return "futurePassive";
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
    if (timerUi && viewModel.agent === timerUi.TIMER_AGENT) {
      return timerUi.renderTimerStateView(viewModel);
    }

    if (clipboardPreviewUi && viewModel.agent === clipboardPreviewUi.CLIPBOARD_AGENT) {
      return clipboardPreviewUi.renderClipboardExpandedPreview(viewModel);
    }

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
    if (timerUi && timerUi.isTimerStatus(status)) {
      return timerUi.createTimerViewModel(status);
    }

    if (clipboardPreviewUi && clipboardPreviewUi.isClipboardStatus(status)) {
      return clipboardPreviewUi.createClipboardPreviewViewModel(status);
    }

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

async function resetTimerFromUi(timerId) {
  if (!window.dynamacTimer || typeof window.dynamacTimer.reset !== "function") {
    return;
  }

  const result = await window.dynamacTimer.reset({ timerId });
  if (!result || !result.payload) return;

  if (result.payload.ok) {
    renderStatuses(result.payload);
  } else {
    renderError(result.payload);
  }
}

async function stopTimerFromUi(timerId) {
  if (!window.dynamacTimer || typeof window.dynamacTimer.stop !== "function") {
    return;
  }

  const result = await window.dynamacTimer.stop({ timerId });
  if (!result || !result.payload) return;

  if (result.payload.ok) {
    renderStatuses(result.payload);
  } else {
    renderError(result.payload);
  }
}

content.addEventListener("click", (event) => {
  const target = event.target && typeof event.target.closest === "function"
    ? event.target.closest('[data-action="timer-reset"], [data-action="timer-stop"]')
    : null;

  if (!target) return;
  const action = target.getAttribute("data-action");
  const timerId = target.getAttribute("data-timer-id");

  if (action === "timer-stop") {
    stopTimerFromUi(timerId);
    return;
  }

  resetTimerFromUi(timerId);
});

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
