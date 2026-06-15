const crypto = require("node:crypto");
const path = require("node:path");

const DEFAULT_RECENCY_MS = 5000;
const DEFAULT_SOURCE = "local-clipboard";
const PREVIEW_MAX_LENGTH = 120;

function finiteTimestamp(value, fallback = Date.now()) {
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  return Number.isFinite(timestamp) ? timestamp : fallback;
}

function truncate(value, maxLength = PREVIEW_MAX_LENGTH) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const limit = Number.isFinite(Number(maxLength)) ? Math.max(0, Math.floor(Number(maxLength))) : PREVIEW_MAX_LENGTH;
  const characters = Array.from(text);
  if (characters.length <= limit) return text;
  if (limit <= 0) return "";
  if (limit === 1) return "…";

  let headLength = Math.ceil((limit - 1) / 2);
  if (characters[headLength - 1] && /\S/.test(characters[headLength - 1]) && characters[headLength] && /\S/.test(characters[headLength])) {
    const nextBreakIndex = characters.findIndex((character, index) => index >= headLength && /\s/.test(character));
    const wordEnd = nextBreakIndex === -1 ? characters.length : nextBreakIndex;
    if (wordEnd < characters.length && wordEnd < limit - 1) headLength = wordEnd;
  }
  const tailLength = limit - 1 - headLength;
  return `${characters.slice(0, headLength).join("")}…${characters.slice(characters.length - tailLength).join("")}`;
}

function formatClipboardPreviewText(text, classification = "text", maxLength = PREVIEW_MAX_LENGTH) {
  const clean = normalizeClipboardText(text);
  if (!clean) return "";

  if (classification === "link") {
    try {
      const url = new URL(clean);
      const compactUrl = `${url.hostname}${url.pathname === "/" ? "" : url.pathname}${url.search}`;
      return truncate(compactUrl, maxLength);
    } catch (_error) {
      return truncate(clean, maxLength);
    }
  }

  if (classification === "path") {
    let pathText = clean;
    if (/^file:\/\//i.test(clean)) {
      try {
        pathText = decodeURIComponent(new URL(clean).pathname);
      } catch (_error) {
        pathText = clean.replace(/^file:\/\//i, "");
      }
    }
    const basename = path.basename(pathText);
    const dirname = path.dirname(pathText);
    const preview = basename && dirname && dirname !== "." ? `${basename} — ${dirname}` : pathText;
    return truncate(preview, maxLength);
  }

  if (classification === "code") {
    const fenced = clean.match(/^```([^\n`]*)\n([\s\S]*?)\n?```$/) || clean.match(/^~~~([^\n~]*)\n([\s\S]*?)\n?~~~$/);
    const language = fenced ? fenced[1].trim() : "";
    const codeText = fenced ? fenced[2] : clean;
    const firstLine = codeText.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
    const preview = language ? `${language} · ${firstLine}` : firstLine;
    return truncate(preview || clean, maxLength);
  }

  return truncate(clean, maxLength);
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
    detail: formatClipboardPreviewText(clean, classification),
    characterCount,
    preview: formatClipboardPreviewText(clean, classification)
  };
}

function textSignature(text) {
  return crypto.createHash("sha1").update(String(text || ""), "utf8").digest("hex");
}

function clipboardCopyEventId(observedAt, signature) {
  return `clipboard-copy-${finiteTimestamp(observedAt, 0)}-${String(signature || "").slice(0, 12)}`;
}

function buildClipboardCopyEvent(read, classified, signature, options = {}) {
  const observedAt = finiteTimestamp(read.observedAt ?? options.now, Date.now());
  const detectedAt = finiteTimestamp(options.now ?? observedAt, observedAt);
  const source = String(read.source || DEFAULT_SOURCE).trim() || DEFAULT_SOURCE;
  const contentType = String(read.type || read.mimeType || "text/plain").trim() || "text/plain";

  return {
    eventId: clipboardCopyEventId(observedAt, signature),
    eventType: "copy",
    observedAt,
    detectedAt,
    source,
    contentType,
    hasPlainText: true,
    classification: classified.classification,
    characterCount: classified.characterCount,
    contentSignature: signature
  };
}

function clipboardGlyphForClassification(classification) {
  if (classification === "link") return "link";
  if (classification === "path") return "doc";
  if (classification === "code") return "curlybraces";
  return "doc.on.clipboard";
}

function labelForClipboardClassification(classification, characterCount) {
  const cleanClassification = String(classification || "text").trim() || "text";
  const type = cleanClassification.charAt(0).toUpperCase() + cleanClassification.slice(1);
  const count = Number.isFinite(Number(characterCount)) ? Number(characterCount) : 0;
  return `${type} copied · ${count} char${count === 1 ? "" : "s"}`;
}

function buildClipboardCopiedHudActivity(copyEvent, options = {}) {
  if (!copyEvent || typeof copyEvent !== "object") {
    throw new Error("clipboard copy event is required");
  }
  if (copyEvent.eventType !== "copy") {
    throw new Error("clipboard HUD activity requires a copy event");
  }
  const observedAt = finiteTimestamp(copyEvent.observedAt ?? options.observedAt ?? options.now, Date.now());
  const updatedAt = finiteTimestamp(copyEvent.detectedAt ?? options.detectedAt ?? options.now ?? observedAt, observedAt);
  const recencyMs = Number.isFinite(Number(options.recencyMs)) ? Number(options.recencyMs) : DEFAULT_RECENCY_MS;
  const classification = String(options.classification || copyEvent.classification || "text").trim() || "text";
  const characterCount = Number.isFinite(Number(options.characterCount ?? copyEvent.characterCount)) ? Number(options.characterCount ?? copyEvent.characterCount) : 0;
  const label = String(options.label || labelForClipboardClassification(classification, characterCount));
  const rawPreview = String(options.preview || "");
  const preview = Array.from(rawPreview).length <= PREVIEW_MAX_LENGTH ? rawPreview : truncate(rawPreview);
  const source = String(options.source || copyEvent.source || DEFAULT_SOURCE).trim() || DEFAULT_SOURCE;
  const glyph = clipboardGlyphForClassification(classification);

  return {
    activityId: String(copyEvent.eventId || clipboardCopyEventId(observedAt, copyEvent.contentSignature || "clipboard")),
    activityType: "clipboard",
    priority: 500,
    createdAt: observedAt,
    updatedAt,
    expiresAt: observedAt + recencyMs,
    isTransient: true,
    status: {
      label,
      preview,
      classification,
      characterCount,
      copied: true
    },
    compactSurface: {
      glyph,
      label,
      preview,
      hudKind: "copied"
    },
    expandedSurface: {
      title: "Clipboard",
      subtitle: label,
      preview,
      hudKind: "copied"
    },
    source,
    metadata: {
      classification,
      characterCount,
      copied: true,
      copiedState: "copied",
      displayLabel: label,
      displayPreview: preview,
      displayGlyph: glyph,
      hudKind: "copied",
      recentPlainTextChange: true,
      observedAt,
      copyEvent: { ...copyEvent }
    },
    revealReadyPath: "",
    persisted: false
  };
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
    metadata: {
      ...activity.metadata,
      copied: activity.status.copied === true,
      copiedState: activity.status.copied === true ? "copied" : "idle",
      displayLabel: activity.status.label,
      displayPreview: activity.status.preview,
      displayGlyph: activity.compactSurface?.glyph || clipboardGlyphForClassification(activity.status.classification),
      hudKind: activity.compactSurface?.hudKind || "copied"
    },
    clipboardActivity: activity,
    persisted: false
  };
}

function isActiveClipboardActivityCurrent(activity, nowMs) {
  if (!activity || typeof activity !== "object") return false;
  const expiresAt = Number(activity.expiresAt);
  return activity.activityType === "clipboard" && Number.isFinite(expiresAt) && expiresAt > nowMs;
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

  if (!changed) {
    if (isActiveClipboardActivityCurrent(previous.active, nowMs)) {
      return {
        state: createClipboardActivityState({ lastSignature: signature, active: previous.active }),
        status: clipboardActivityToNativeStatus(previous.active)
      };
    }
    return {
      state: createClipboardActivityState({ lastSignature: signature, active: null }),
      status: inactiveClipboardStatus(nowMs, "Clipboard copied activity expired after the recent-change window elapsed.")
    };
  }

  if (!recent) {
    return {
      state: createClipboardActivityState({ lastSignature: signature, active: null }),
      status: inactiveClipboardStatus(nowMs, "Clipboard text is older than the recent-change window.")
    };
  }

  const classified = classifyClipboardText(text);
  const copyEvent = buildClipboardCopyEvent(read, classified, signature, { now: nowMs });
  const activity = buildClipboardCopiedHudActivity(copyEvent, {
    classification: classified.classification,
    characterCount: classified.characterCount,
    label: classified.label,
    preview: classified.preview,
    recencyMs
  });

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
  buildClipboardCopyEvent,
  buildClipboardCopiedHudActivity,
  buildClipboardStatusFromText,
  classifyClipboardText,
  clipboardCopyEventId,
  clipboardActivityToNativeStatus,
  createClipboardActivityState,
  formatClipboardPreviewText,
  inactiveClipboardStatus,
  isCodeLikeClipboardText,
  isValidHttpUrl,
  normalizeClipboardText,
  textSignature
};
