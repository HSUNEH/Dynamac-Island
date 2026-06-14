const crypto = require("node:crypto");

const DEFAULT_RECENCY_MS = 5000;
const DEFAULT_SOURCE = "local-clipboard";
const PREVIEW_MAX_LENGTH = 120;

function finiteTimestamp(value, fallback = Date.now()) {
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  return Number.isFinite(timestamp) ? timestamp : fallback;
}

function truncate(value, maxLength = PREVIEW_MAX_LENGTH) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function normalizeClipboardText(text) {
  return String(text || "").replace(/\0/g, "").trim();
}

function isValidHttpUrl(text) {
  try {
    const url = new URL(text);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch (_error) {
    return false;
  }
}

function isCodeLikeClipboardText(text) {
  const clean = normalizeClipboardText(text);
  if (!clean) return false;
  if (/^```[\s\S]*```$/m.test(clean) || /^~~~[\s\S]*~~~$/m.test(clean)) return true;

  const lines = clean.split(/\r?\n/).filter((line) => line.trim());
  const hasMultipleLines = lines.length > 1;
  const hasIndentedBlock = lines.some((line) => /^\s{2,}\S/.test(line));

  let score = 0;
  if (/[{}[\];]|=>|<\/?[A-Za-z][^>]*>/.test(clean)) score += 1;
  if (/(^|\n)\s*(const|let|var|function|class|import|export|return|if|else|for|while|switch|try|catch|async|await|interface|type|enum)\b/.test(clean)) score += 1;
  if (/(^|\n)\s*(def|from\s+\w+\s+import|print|return|if __name__)\b/.test(clean)) score += 1;
  if (/(^|\n)\s*[\w.$]+\s*=\s*[^=\n]+/.test(clean)) score += 1;
  if (/(^|\n)\s*[})\]]?\s*[;{}]\s*$/.test(clean)) score += 1;
  if (hasMultipleLines && hasIndentedBlock) score += 1;

  if (score >= 2) return true;

  const startsLikeStructuredLiteral = /^[{[]/.test(clean) && /[}\]]$/.test(clean);
  if (startsLikeStructuredLiteral) {
    try {
      const parsed = JSON.parse(clean);
      return parsed !== null && typeof parsed === "object";
    } catch (_error) {
      return false;
    }
  }

  return false;
}

function classifyClipboardText(text) {
  const clean = normalizeClipboardText(text);
  if (!clean) {
    return {
      classification: "empty",
      label: "Clipboard empty",
      detail: "No text clipboard content was found.",
      characterCount: 0,
      preview: ""
    };
  }

  let classification = "text";
  let type = "Text";
  if (isValidHttpUrl(clean)) {
    classification = "link";
    type = "Link";
  } else if (/^file:\/\//i.test(clean) || clean.startsWith("/")) {
    classification = "path";
    type = "Path";
  } else if (isCodeLikeClipboardText(clean)) {
    classification = "code";
    type = "Code";
  }

  const characterCount = clean.length;
  const lengthLabel = `${characterCount} char${characterCount === 1 ? "" : "s"}`;
  return {
    classification,
    label: `${type} copied · ${lengthLabel}`,
    detail: truncate(clean),
    characterCount,
    preview: truncate(clean)
  };
}

function textSignature(text) {
  return crypto.createHash("sha1").update(String(text || ""), "utf8").digest("hex");
}

function createClipboardActivityState(seed = {}) {
  return {
    lastSignature: typeof seed.lastSignature === "string" ? seed.lastSignature : "",
    active: seed.active || null
  };
}

function isPlainTextRead(read) {
  if (!read || typeof read !== "object") return false;
  if (read.hasPlainText === false) return false;
  if (typeof read.plainText !== "string") return false;
  const type = String(read.type || read.mimeType || "text/plain").toLowerCase();
  return type === "" || type.includes("text/plain") || type === "string" || type === "public.utf8-plain-text";
}

function inactiveClipboardStatus(nowMs, detail = "No recent plain-text clipboard change was observed.") {
  return {
    agent: "Clipboard",
    activityType: "futurePassive",
    state: "idle",
    task: "Clipboard idle",
    updatedAt: new Date(nowMs).toISOString(),
    detail,
    metadata: {
      classification: "none",
      recentPlainTextChange: false
    },
    persisted: false
  };
}

function clipboardActivityToNativeStatus(activity) {
  if (!activity || typeof activity !== "object") {
    throw new Error("clipboard activity is required");
  }
  return {
    agent: "Clipboard",
    activityType: "clipboard",
    state: "running",
    task: activity.status.label,
    updatedAt: new Date(activity.updatedAt).toISOString(),
    detail: activity.status.preview,
    metadata: { ...activity.metadata },
    clipboardActivity: activity,
    persisted: false
  };
}

function applyClipboardRead(state = createClipboardActivityState(), read = {}, options = {}) {
  const nowMs = finiteTimestamp(options.now ?? read.observedAt, Date.now());
  const observedAt = finiteTimestamp(read.observedAt ?? nowMs, nowMs);
  const recencyMs = Number.isFinite(Number(options.recencyMs)) ? Number(options.recencyMs) : DEFAULT_RECENCY_MS;
  const previous = createClipboardActivityState(state);

  if (!isPlainTextRead(read)) {
    return {
      state: createClipboardActivityState({ ...previous, active: null }),
      status: inactiveClipboardStatus(nowMs, "Clipboard read did not contain plain text.")
    };
  }

  const text = normalizeClipboardText(read.plainText);
  if (!text) {
    const emptySignature = textSignature("");
    return {
      state: createClipboardActivityState({ lastSignature: emptySignature, active: null }),
      status: inactiveClipboardStatus(nowMs, "No text clipboard content was found.")
    };
  }

  const signature = textSignature(text);
  const changed = signature !== previous.lastSignature;
  const recent = nowMs - observedAt >= 0 && nowMs - observedAt <= recencyMs;

  if (!changed || !recent) {
    return {
      state: createClipboardActivityState({ lastSignature: signature, active: null }),
      status: inactiveClipboardStatus(nowMs, changed ? "Clipboard text is older than the recent-change window." : "Clipboard text has not changed since the previous read.")
    };
  }

  const classified = classifyClipboardText(text);
  const source = String(read.source || DEFAULT_SOURCE).trim() || DEFAULT_SOURCE;
  const activity = {
    activityId: `clipboard-${observedAt}`,
    activityType: "clipboard",
    priority: 500,
    createdAt: observedAt,
    updatedAt: nowMs,
    expiresAt: observedAt + recencyMs,
    isTransient: true,
    status: {
      label: classified.label,
      preview: classified.preview,
      classification: classified.classification,
      characterCount: classified.characterCount
    },
    compactSurface: {
      glyph: classified.classification === "link" ? "link" : (classified.classification === "path" ? "doc" : "doc.on.clipboard"),
      label: classified.label,
      preview: classified.preview
    },
    expandedSurface: {
      title: "Clipboard",
      subtitle: classified.label,
      preview: classified.preview
    },
    source,
    metadata: {
      classification: classified.classification,
      characterCount: classified.characterCount,
      recentPlainTextChange: true,
      observedAt
    },
    revealReadyPath: "",
    persisted: false
  };

  return {
    state: createClipboardActivityState({ lastSignature: signature, active: activity }),
    status: clipboardActivityToNativeStatus(activity)
  };
}

function buildClipboardStatusFromText(text, options = {}) {
  const nowMs = finiteTimestamp(options.now, Date.now());
  const state = options.state || createClipboardActivityState({ lastSignature: options.previousSignature || "" });
  return applyClipboardRead(state, {
    plainText: text,
    observedAt: options.observedAt ?? nowMs,
    source: options.source || DEFAULT_SOURCE,
    type: "text/plain"
  }, options);
}

module.exports = {
  DEFAULT_RECENCY_MS,
  applyClipboardRead,
  buildClipboardStatusFromText,
  classifyClipboardText,
  clipboardActivityToNativeStatus,
  createClipboardActivityState,
  inactiveClipboardStatus,
  isCodeLikeClipboardText,
  isValidHttpUrl,
  normalizeClipboardText,
  textSignature
};
