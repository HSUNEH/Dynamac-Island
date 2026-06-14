(function timerUiFactory(root) {
  const TIMER_AGENT = "Timer";
  const timerCountdown = root.DynamacTimerCountdown ||
    (typeof require === "function" ? require("./timer-countdown") : null);

  function isTimerStatus(status) {
    return Boolean(
      status &&
      typeof status.agent === "string" &&
      status.agent.trim().toLowerCase() === TIMER_AGENT.toLowerCase()
    );
  }

  function createTimerViewModel(status, options = {}) {
    if (!isTimerStatus(status)) {
      throw new Error("Timer status is required");
    }

    const timer = status.timer && typeof status.timer === "object" ? status.timer : {};
    const timerState = String(timer.state || status.state || "idle");
    const countdownNow = options.now || status.now || timer.updatedAt || status.updatedAt || new Date();
    const countdown = timerCountdown.createTimerCountdown({
      ...timer,
      state: timerState
    }, { now: countdownNow });
    const stateLabel = titleCase(timerState);
    const isRunning = status.state === "running" && timerState === "running";
    const remainingText = countdown.isDone && typeof timer.displayText === "string" && timer.displayText.trim() !== ""
      ? timer.displayText
      : countdown.compactText;
    const canReset = timerState === "running" || timerState === "stopped" || timerState === "done";

    return {
      agent: TIMER_AGENT,
      state: status.state,
      stateLabel,
      task: status.task,
      detail: status.detail,
      updatedAt: status.updatedAt,
      timerId: String(timer.id || ""),
      durationSeconds: countdown.durationSeconds,
      remainingSeconds: countdown.remainingSeconds,
      remainingText,
      progressPercent: countdown.progressPercent,
      progressLabel: `${countdown.progressPercent}% elapsed`,
      isRunning,
      canReset,
      canStop: isRunning,
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
    const stopControl = viewModel.canStop
      ? `<button class="timer-stop-button" type="button" data-action="timer-stop" data-timer-id="${escapeAttribute(viewModel.timerId)}" aria-label="Stop running timer">Stop</button>`
      : "";
    const resetControl = viewModel.canReset
      ? `<button class="timer-reset-button" type="button" data-action="timer-reset" data-timer-id="${escapeAttribute(viewModel.timerId)}" aria-label="Reset timer">Reset</button>`
      : "";
    const timerControls = stopControl || resetControl
      ? `<span class="timer-controls">${stopControl}${resetControl}</span>`
      : "";

    return `
      <article class="${escapeAttribute(viewModel.cssClass)}" aria-label="${escapeAttribute(viewModel.ariaLabel)}" data-agent="${TIMER_AGENT}">
        <div class="status-topline">
          <span class="${escapeAttribute(viewModel.dotClass)}"></span>
          <strong>${TIMER_AGENT}</strong>
          <span>${escapeHtml(viewModel.stateLabel)}</span>
          ${timerControls}
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
    return timerCountdown.formatTimerClock(totalSeconds);
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
