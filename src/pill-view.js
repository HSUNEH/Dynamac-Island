(function pillViewFactory(root) {
  const PILL_VIEW_SPEC = {
    shellClass: "island",
    headerClass: "island-header",
    contentClass: "status-grid",
    sourceClass: "source",
    summaryId: "summary",
    contentId: "content",
    sourceId: "source",
    reloadId: "reload",
    title: "Dynamac Island",
    initialSummary: "Loading local status",
    widthPx: 496,
    minHeightPx: 152,
    borderRadiusPx: 42
  };

  function renderPillView() {
    return `
      <main class="${PILL_VIEW_SPEC.shellClass}" aria-live="polite" data-view="dynamac-pill">
        <header class="${PILL_VIEW_SPEC.headerClass}">
          <div>
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

  function mountPillView(documentRef) {
    if (!documentRef || !documentRef.body) {
      throw new Error("mountPillView requires a document with a body.");
    }

    documentRef.body.innerHTML = renderPillView();

    return {
      summary: documentRef.querySelector(`#${PILL_VIEW_SPEC.summaryId}`),
      content: documentRef.querySelector(`#${PILL_VIEW_SPEC.contentId}`),
      source: documentRef.querySelector(`#${PILL_VIEW_SPEC.sourceId}`),
      reload: documentRef.querySelector(`#${PILL_VIEW_SPEC.reloadId}`)
    };
  }

  const api = {
    PILL_VIEW_SPEC,
    renderPillView,
    mountPillView
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.DynamacPillView = api;
})(typeof window !== "undefined" ? window : globalThis);
