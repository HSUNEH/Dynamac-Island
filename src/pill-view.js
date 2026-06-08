(function pillViewFactory(root) {
  const PILL_VIEW_SPEC = {
    shellClass: "island",
    headerClass: "island-header",
    compactClass: "compact-status",
    contentClass: "status-grid",
    sourceClass: "source",
    summaryId: "summary",
    compactPrimaryId: "compact-primary",
    compactMetaId: "compact-meta",
    contentId: "content",
    sourceId: "source",
    reloadId: "reload",
    modeToggleId: "mode-toggle",
    title: "Dynamac Island",
    initialSummary: "Loading local status",
    initialCompactPrimary: "Snuffles",
    initialCompactMeta: "Loading",
    collapsedWidthPx: 286,
    collapsedHeightPx: 52,
    expandedWidthPx: 496,
    expandedMinHeightPx: 152,
    borderRadiusPx: 42,
    widthPx: 496,
    minHeightPx: 152
  };

  function renderPillView() {
    return `
      <main class="${PILL_VIEW_SPEC.shellClass}" aria-live="polite" data-view="dynamac-pill" data-mode="collapsed">
        <header class="${PILL_VIEW_SPEC.headerClass}">
          <button
            id="${PILL_VIEW_SPEC.modeToggleId}"
            class="mode-toggle"
            title="Expand island"
            aria-label="Expand or collapse island"
            aria-expanded="false"
            type="button"
          >
            <span class="compact-dot" aria-hidden="true"></span>
            <span class="${PILL_VIEW_SPEC.compactClass}">
              <strong id="${PILL_VIEW_SPEC.compactPrimaryId}">${PILL_VIEW_SPEC.initialCompactPrimary}</strong>
              <span id="${PILL_VIEW_SPEC.compactMetaId}">${PILL_VIEW_SPEC.initialCompactMeta}</span>
            </span>
          </button>
          <div class="expanded-title">
            <p class="eyebrow">${PILL_VIEW_SPEC.title}</p>
            <h1 id="${PILL_VIEW_SPEC.summaryId}">${PILL_VIEW_SPEC.initialSummary}</h1>
          </div>
          <button
            id="${PILL_VIEW_SPEC.reloadId}"
            class="icon-button"
            title="Reload status"
            aria-label="Reload status"
            type="button"
          >&#8635;</button>
        </header>
        <section id="${PILL_VIEW_SPEC.contentId}" class="${PILL_VIEW_SPEC.contentClass}"></section>
        <footer id="${PILL_VIEW_SPEC.sourceId}" class="${PILL_VIEW_SPEC.sourceClass}"></footer>
      </main>
    `.trim();
  }

  function createModeController(options) {
    const shell = options.shell;
    const toggle = options.toggle;
    const onModeChange = options.onModeChange;

    if (!shell || !toggle) {
      throw new Error("createModeController requires shell and toggle elements.");
    }

    function applyMode(mode) {
      shell.dataset.mode = mode;
      toggle.setAttribute("aria-expanded", mode === "expanded" ? "true" : "false");
      toggle.title = mode === "expanded" ? "Collapse island" : "Expand island";

      if (typeof onModeChange === "function") {
        onModeChange(mode);
      }
    }

    function getMode() {
      return shell.dataset.mode || "collapsed";
    }

    function toggleMode() {
      applyMode(getMode() === "expanded" ? "collapsed" : "expanded");
    }

    toggle.addEventListener("click", toggleMode);
    applyMode(getMode());

    return {
      getMode,
      setMode: applyMode,
      toggleMode
    };
  }

  function mountPillView(documentRef, options = {}) {
    if (!documentRef || !documentRef.body) {
      throw new Error("mountPillView requires a document with a body.");
    }

    documentRef.body.innerHTML = renderPillView();
    const shell = documentRef.querySelector(`.${PILL_VIEW_SPEC.shellClass}`);
    const modeToggle = documentRef.querySelector(`#${PILL_VIEW_SPEC.modeToggleId}`);

    return {
      shell,
      summary: documentRef.querySelector(`#${PILL_VIEW_SPEC.summaryId}`),
      compactPrimary: documentRef.querySelector(`#${PILL_VIEW_SPEC.compactPrimaryId}`),
      compactMeta: documentRef.querySelector(`#${PILL_VIEW_SPEC.compactMetaId}`),
      content: documentRef.querySelector(`#${PILL_VIEW_SPEC.contentId}`),
      source: documentRef.querySelector(`#${PILL_VIEW_SPEC.sourceId}`),
      reload: documentRef.querySelector(`#${PILL_VIEW_SPEC.reloadId}`),
      modeToggle,
      modeController: createModeController({
        shell,
        toggle: modeToggle,
        onModeChange: options.onModeChange
      })
    };
  }

  const api = {
    PILL_VIEW_SPEC,
    renderPillView,
    createModeController,
    mountPillView
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.DynamacPillView = api;
})(typeof window !== "undefined" ? window : globalThis);
