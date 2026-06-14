(function timerUiFactory(root) {
  const TIMER_AGENT = "Timer";

  function isTimerStatus(status) {
    return Boolean(
      status &&
      typeof status.agent === "string" &&
      status.agent.trim().toLowerCase() === TIMER_AGENT.toLowerCase()
    );
  }

  function createTimerViewModel(status) {
    if (!isTimerStatus(status)) {
      throw new Error("Timer status is required");
    }

    const timer = status.timer && typeof status.timer === "object" ? status.timer : {};
    const durationSeconds = positiveInteger(timer.durationSeconds, 0);
    const remainingSeconds = clamp(positiveInteger(timer.remainingSeconds, 0), 0, durationSeconds || Number.MAX_SAFE_INTEGER);
    const elapsedSeconds = Math.max(0, durationSeconds - remainingSeconds);
    const progressPercent = durationSeconds > 0
      ? clamp(Math.round((elapsedSeconds / durationSeconds) * 100), 0, 100)
      : 0;
    const timerState = String(timer.state || status.state || "idle");
    const stateLabel = titleCase(timerState);
    const isRunning = status.state === "running" && timerState === "running";

    return {
      agent: TIMER_AGENT,
      state: status.state,
      stateLabel,
      task: status.task,
      detail: status.detail,
      updatedAt: status.updatedAt,
      timerId: String(timer.id || ""),
      durationSeconds,
      remainingSeconds,
      remainingText: formatClock(remainingSeconds),
      progressPercent,
      progressLabel: `${progressPercent}% elapsed`,
      isRunning,
      canReset: isRunning,
      replacedPrevious: timer.replacedPrevious === true,
      cssClass: `status-card timer ${escapeAttribute(status.state)}`,
      dotClass: `state-dot ${escapeAttribute(status.state)}`,
      ariaLabel: `${TIMER_AGENT} ${stateLabel}: ${status.task}`
    };
  }

  function applyCompactTimerView(elements, viewModel) {
    if (!elements || !viewModel) return;

    if (elements.compactPrimary) {
      elements.compactPrimary.innerHTML = `
        <span class="timer-compact-label">Timer</span>
        <span class="timer-compact-time">${escapeHtml(viewModel.remainingText)}</span>
      `;
      elements.compactPrimary.title = viewModel.task || "Timer";
    }

    if (elements.compactMeta) {
      elements.compactMeta.innerHTML = renderProgress(viewModel, "timer-compact-progress");
      elements.compactMeta.title = viewModel.progressLabel;
    }
  }

  function renderTimerStateView(viewModel) {
    const resetControl = viewModel.canReset
      ? `<button class="timer-reset-button" type="button" data-action="timer-reset" data-timer-id="${escapeAttribute(viewModel.timerId)}" aria-label="Reset running timer">Reset</button>`
      : "";

    return `
      <article class="${escapeAttribute(viewModel.cssClass)}" aria-label="${escapeAttribute(viewModel.ariaLabel)}" data-agent="${TIMER_AGENT}">
        <div class="status-topline">
          <span class="${escapeAttribute(viewModel.dotClass)}"></span>
          <strong>${TIMER_AGENT}</strong>
          <span>${escapeHtml(viewModel.stateLabel)}</span>
          ${resetControl}
        </div>
        <h2>${escapeHtml(viewModel.task)}</h2>
        <p>${escapeHtml(viewModel.detail)}</p>
        ${renderProgress(viewModel, "timer-card-progress")}
        <time>${escapeHtml(viewModel.updatedAt)}</time>
      </article>
    `;
  }

  function renderProgress(viewModel, className) {
    return `
      <span
        class="${escapeAttribute(className)}"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow="${viewModel.progressPercent}"
        aria-label="${escapeAttribute(viewModel.progressLabel)}"
      >
        <span class="timer-progress-track" aria-hidden="true">
          <span class="timer-progress-fill" style="width: ${viewModel.progressPercent}%"></span>
        </span>
        <span class="timer-progress-label">${escapeHtml(viewModel.progressLabel)}</span>
      </span>
    `;
  }

  function formatClock(totalSeconds) {
    const seconds = positiveInteger(totalSeconds, 0);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
    }

    return `${minutes}:${String(remainder).padStart(2, "0")}`;
  }

  function positiveInteger(value, fallback) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function titleCase(value) {
    const stringValue = String(value || "");
    return stringValue.slice(0, 1).toUpperCase() + stringValue.slice(1);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replaceAll("`", "&#096;");
  }

  const api = {
    TIMER_AGENT,
    applyCompactTimerView,
    createTimerViewModel,
    formatClock,
    isTimerStatus,
    renderTimerStateView
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.DynamacTimerUi = api;
})(typeof window !== "undefined" ? window : globalThis);
