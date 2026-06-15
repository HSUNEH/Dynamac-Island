(function clipboardPreviewUiFactory(root) {
  const CLIPBOARD_AGENT = "Clipboard";
  const STATE_LABELS = Object.freeze({
    idle: "Idle",
    running: "Running",
    success: "Success",
    warning: "Warning",
    error: "Error"
  });

  function isClipboardStatus(status) {
    if (!status || typeof status !== "object") return false;
    const agent = typeof status.agent === "string" ? status.agent.trim().toLowerCase() : "";
    const activityType = typeof status.activityType === "string" ? status.activityType.trim().toLowerCase() : "";
    return agent === CLIPBOARD_AGENT.toLowerCase() || activityType === "clipboard";
  }

  function createClipboardPreviewViewModel(status) {
    if (!isClipboardStatus(status)) {
      throw new Error("Clipboard status is required");
    }

    const activity = status.clipboardActivity && typeof status.clipboardActivity === "object" ? status.clipboardActivity : null;
    const expandedSurface = activity && activity.expandedSurface && typeof activity.expandedSurface === "object" ? activity.expandedSurface : null;
    const metadata = status.metadata && typeof status.metadata === "object" ? status.metadata : {};
    const activityStatus = activity && activity.status && typeof activity.status === "object" ? activity.status : {};
    const classification = String(activityStatus.classification || metadata.classification || "none");
    const preview = String((expandedSurface && expandedSurface.preview) || activityStatus.preview || status.detail || "").trim();
    const hasPlainTextPreview = Boolean(activity && preview && classification !== "none");
    const stateLabel = STATE_LABELS[status.state] || titleCase(status.state);
    const fallbackKind = fallbackKindForStatus(status, activity, preview, classification);
    const fallback = fallbackForKind(fallbackKind, status.detail);
    const title = hasPlainTextPreview ? String((expandedSurface && expandedSurface.title) || "Clipboard") : fallback.title;
    const subtitle = hasPlainTextPreview ? String((expandedSurface && expandedSurface.subtitle) || status.task || "Recent copied text") : fallback.subtitle;

    return {
      agent: CLIPBOARD_AGENT,
      state: status.state || "idle",
      stateLabel,
      title,
      subtitle,
      preview: hasPlainTextPreview ? preview : "",
      classification,
      fallbackKind,
      fallbackTitle: fallback.title,
      fallbackMessage: fallback.message,
      icon: iconForClassification(classification, fallbackKind),
      updatedAt: status.updatedAt || "",
      cssClass: `status-card clipboard-preview ${escapeAttribute(status.state || "idle")}`,
      dotClass: `state-dot ${escapeAttribute(status.state || "idle")}`,
      ariaLabel: `${CLIPBOARD_AGENT} ${stateLabel}: ${hasPlainTextPreview ? title : fallback.title}`,
      hasPlainTextPreview
    };
  }

  function renderClipboardExpandedPreview(viewModel) {
    const body = viewModel.hasPlainTextPreview
      ? `\n        <p class="clipboard-preview-text" data-clipboard-preview="text">${escapeHtml(viewModel.preview)}</p>\n        <span class="clipboard-preview-kind">${escapeHtml(labelForClassification(viewModel.classification))}</span>\n      `
      : `\n        <div class="clipboard-preview-fallback" data-clipboard-fallback="${escapeAttribute(viewModel.fallbackKind)}">\n          <strong>${escapeHtml(viewModel.fallbackTitle)}</strong>\n          <p>${escapeHtml(viewModel.fallbackMessage)}</p>\n        </div>\n      `;

    return `\n      <article class="${escapeAttribute(viewModel.cssClass)}" aria-label="${escapeAttribute(viewModel.ariaLabel)}" data-agent="clipboard">\n        <div class="status-topline">\n          <span class="${escapeAttribute(viewModel.dotClass)}"></span>\n          <strong>${CLIPBOARD_AGENT}</strong>\n          <span>${escapeHtml(viewModel.stateLabel)}</span>\n        </div>\n        <div class="clipboard-preview-header">\n          <span class="clipboard-preview-icon" aria-hidden="true">${escapeHtml(viewModel.icon)}</span>\n          <div>\n            <h2>${escapeHtml(viewModel.title)}</h2>\n            <p>${escapeHtml(viewModel.subtitle)}</p>\n          </div>\n        </div>\n        ${body}\n        <time>${escapeHtml(viewModel.updatedAt)}</time>\n      </article>\n    `;
  }

  function fallbackKindForStatus(status, activity, preview, classification) {
    if (activity && !preview) return "unavailable";
    if (classification === "empty" || /No text clipboard content/i.test(status.detail || "")) return "unavailable";
    if (classification === "none" && /plain text|unsupported|did not contain/i.test(status.detail || "")) return "unsupported";
    if (!activity) return "unavailable";
    return "unavailable";
  }

  function fallbackForKind(kind, detail) {
    const cleanDetail = String(detail || "").trim();
    if (kind === "unsupported") {
      return {
        title: "Clipboard preview unavailable",
        subtitle: "Unsupported clipboard payload",
        message: cleanDetail || "Dynamac can preview recent plain text, links, paths, and code snippets. Images, files, and private pasteboard types stay hidden."
      };
    }

    return {
      title: "Clipboard preview unavailable",
      subtitle: "No recent text preview",
      message: cleanDetail || "Copy text, a link, a path, or a code snippet to show a local-only preview here."
    };
  }

  function iconForClassification(classification, fallbackKind) {
    if (fallbackKind === "unsupported") return "—";
    if (classification === "link") return "↗";
    if (classification === "path") return "⌘";
    if (classification === "code") return "{}";
    if (classification === "text") return "T";
    return "…";
  }

  function labelForClassification(classification) {
    if (classification === "link") return "Link";
    if (classification === "path") return "Path";
    if (classification === "code") return "Code";
    if (classification === "text") return "Text";
    return "Clipboard";
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
    CLIPBOARD_AGENT,
    createClipboardPreviewViewModel,
    isClipboardStatus,
    renderClipboardExpandedPreview
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.DynamacClipboardPreviewUi = api;
})(typeof window !== "undefined" ? window : globalThis);
