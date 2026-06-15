const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_SOURCE = "local-dynadrop";
const DEFAULT_TYPE = "application/octet-stream";
const DEFAULT_PRIORITY = 400;

function finiteTimestamp(value, fallback = Date.now(), fieldName = "timestamp") {
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(timestamp)) {
    if (fallback === undefined) throw new Error(`${fieldName} must be a finite timestamp`);
    return fallback;
  }
  return timestamp;
}

function requiredFiniteTimestamp(value, fieldName = "timestamp") {
  const timestamp = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`${fieldName} must be a finite timestamp`);
  }
  return timestamp;
}

function createShelfState(seed = {}) {
  const now = finiteTimestamp(seed.now ?? seed.updatedAt, Date.now());
  const items = Array.isArray(seed.items) ? seed.items.map((item) => ({ ...item })) : [];
  return {
    version: 1,
    updatedAt: now,
    items,
    active: seed.active && typeof seed.active === "object" ? { ...seed.active } : null,
    lastError: seed.lastError && typeof seed.lastError === "object" ? { ...seed.lastError } : null,
    persisted: seed.persisted === true
  };
}

function normalizeType(value) {
  const type = String(value || "").trim();
  return type || DEFAULT_TYPE;
}

function rejectExplicitlyDisallowedDrop(drop = {}) {
  if (drop.allowed === false || drop.disallowed === true) {
    const reason = String(drop.disallowReason || drop.reason || "unspecified").trim() || "unspecified";
    throw new Error(`dropped input is explicitly disallowed: ${reason}`);
  }
}

function validateDroppedFilePath(filePath) {
  if (typeof filePath !== "string" || filePath.trim() === "") {
    throw new Error("dropped file path is required");
  }
  if (filePath.includes("\0")) {
    throw new Error("dropped file path is malformed");
  }
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error("dropped file path must exist");
  }
  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) {
    throw new Error("dropped file path must be a file");
  }
  return { resolvedPath, stat };
}

function buildShelfRevealStatus(filePath, options = {}) {
  const updatedAt = finiteTimestamp(options.now ?? options.updatedAt, Date.now());
  if (typeof filePath !== "string" || filePath.trim() === "") {
    return {
      state: "unavailable",
      canReveal: false,
      revealReadyPath: "",
      reason: "no-validated-path",
      detail: "No validated shelf file path is available for reveal.",
      updatedAt,
      persisted: false
    };
  }

  try {
    const { resolvedPath } = validateDroppedFilePath(filePath);
    return {
      state: "ready",
      canReveal: true,
      revealReadyPath: resolvedPath,
      reason: "",
      detail: "Validated local file path is ready for future Finder reveal.",
      updatedAt,
      persisted: false
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "shelf reveal path is unavailable");
    return {
      state: "unavailable",
      canReveal: false,
      revealReadyPath: "",
      reason: shelfErrorCodeForMessage(message),
      detail: message,
      updatedAt,
      persisted: false
    };
  }
}

function publicFileMetadata(item) {
  return {
    path: item.path,
    name: item.name,
    type: item.type,
    size: item.size
  };
}

function fileLabel(count) {
  return `${count} file${count === 1 ? "" : "s"}`;
}

function buildShelfActivity(state, options = {}) {
  if (!state.items.length) return null;
  const latest = state.items[state.items.length - 1];
  const createdAt = state.items[0].observedAt;
  const updatedAt = finiteTimestamp(options.now ?? state.updatedAt, state.updatedAt);
  const fileCount = state.items.length;
  const latestFile = publicFileMetadata(latest);
  const revealStatus = buildShelfRevealStatus(latest.path, { now: updatedAt });
  return {
    activityId: `shelf-${latest.observedAt}`,
    activityType: "shelf",
    priority: DEFAULT_PRIORITY,
    createdAt,
    updatedAt,
    expiresAt: null,
    isTransient: false,
    status: {
      fileCount,
      latestFile,
      label: `Shelf · ${fileLabel(fileCount)} ready`,
      revealStatus
    },
    compactSurface: {
      glyph: "tray.full",
      label: `Shelf · ${fileLabel(fileCount)} ready`,
      preview: latest.name
    },
    expandedSurface: {
      title: "Shelf",
      subtitle: `${fileLabel(fileCount)} ready for local reveal`,
      files: state.items.map(publicFileMetadata)
    },
    source: latest.source,
    metadata: {
      fileCount,
      files: state.items.map(publicFileMetadata),
      latestFile,
      revealStatus
    },
    revealReadyPath: revealStatus.revealReadyPath,
    revealStatus,
    persisted: false
  };
}

function nextSequence(items) {
  return items.length;
}

function normalizeDropInput(drop) {
  if (typeof drop === "string") return { filePath: drop };
  if (drop && typeof drop === "object" && !Array.isArray(drop)) return { ...drop };
  return { filePath: drop };
}

function shelfErrorCodeForMessage(message) {
  if (message === "dropped file path is required") return "dropped-file-path-required";
  if (message === "dropped file path is malformed") return "dropped-file-path-malformed";
  if (message === "dropped file path must exist") return "dropped-file-path-must-exist";
  if (message === "dropped file path must be a file") return "dropped-file-path-must-be-file";
  if (message.startsWith("dropped input is explicitly disallowed:")) return "dropped-input-disallowed";
  if (message === "dropped input list must include at least one file path") return "dropped-input-list-empty";
  return "dropped-input-invalid";
}

function buildShelfError(error, drop = {}, options = {}) {
  const message = error instanceof Error ? error.message : String(error || "dropped input is invalid");
  const updatedAt = finiteTimestamp(options.now ?? drop.observedAt, Date.now());
  const observedAt = finiteTimestamp(drop.observedAt ?? updatedAt, updatedAt);
  return {
    code: shelfErrorCodeForMessage(message),
    message,
    inputKind: "filePath",
    observedAt,
    updatedAt,
    recoverable: true,
    revealStatus: buildShelfRevealStatus("", { now: updatedAt }),
    persisted: false
  };
}

function applyDroppedFileToShelf(state = createShelfState(), drop = {}, options = {}) {
  const normalizedDrop = normalizeDropInput(drop);
  try {
    const nextState = addDroppedFileToShelf(state, normalizedDrop, options);
    nextState.lastError = null;
    return { ok: true, state: nextState, error: null };
  } catch (error) {
    const previous = createShelfState(state);
    const lastError = buildShelfError(error, normalizedDrop, options);
    return {
      ok: false,
      state: createShelfState({
        ...previous,
        updatedAt: lastError.updatedAt,
        lastError,
        persisted: false
      }),
      error: lastError
    };
  }
}

function addDroppedFileToShelf(state = createShelfState(), drop = {}, options = {}) {
  const normalizedDrop = normalizeDropInput(drop);
  const previous = createShelfState(state);
  const observedAt = requiredFiniteTimestamp(normalizedDrop.observedAt ?? options.now ?? Date.now(), "observedAt");
  const recordedAt = finiteTimestamp(options.now ?? observedAt, observedAt);
  rejectExplicitlyDisallowedDrop(normalizedDrop);
  const { resolvedPath, stat } = validateDroppedFilePath(normalizedDrop.filePath);
  const sequence = nextSequence(previous.items);
  const source = String(normalizedDrop.source || DEFAULT_SOURCE).trim() || DEFAULT_SOURCE;
  const item = {
    itemId: `shelf-${observedAt}-${String(sequence).padStart(3, "0")}`,
    path: resolvedPath,
    name: path.basename(resolvedPath),
    type: normalizeType(normalizedDrop.type),
    size: stat.size,
    source,
    observedAt,
    recordedAt,
    revealReadyPath: resolvedPath,
    revealStatus: buildShelfRevealStatus(resolvedPath, { now: recordedAt }),
    persisted: false
  };
  const next = createShelfState({
    updatedAt: recordedAt,
    items: [...previous.items, item],
    lastError: null,
    persisted: false
  });
  next.active = buildShelfActivity(next, { now: recordedAt });
  return next;
}

function addDroppedFilesToShelf(state = createShelfState(), drops = [], options = {}) {
  if (!Array.isArray(drops) || drops.length === 0) {
    throw new Error("dropped input list must include at least one file path");
  }

  const normalizedDrops = drops.map(normalizeDropInput);
  for (const drop of normalizedDrops) {
    rejectExplicitlyDisallowedDrop(drop);
    validateDroppedFilePath(drop.filePath);
  }

  return normalizedDrops.reduce(
    (nextState, drop) => addDroppedFileToShelf(nextState, drop, options),
    state
  );
}

function clearShelf(_state = createShelfState(), options = {}) {
  return createShelfState({
    now: finiteTimestamp(options.now, Date.now()),
    items: [],
    active: null,
    lastError: null,
    persisted: false
  });
}

function shelfActivityToNativeStatus(activity) {
  if (!activity || typeof activity !== "object") {
    throw new Error("shelf activity is required");
  }
  const updatedAt = new Date(finiteTimestamp(activity.updatedAt, undefined, "activity.updatedAt")).toISOString();
  const revealStatus = activity.revealStatus && typeof activity.revealStatus === "object"
    ? { ...activity.revealStatus }
    : buildShelfRevealStatus(activity.revealReadyPath || "", { now: activity.updatedAt });
  return {
    agent: "DynaShelf",
    activityType: "shelf",
    state: "running",
    task: activity.status?.label || activity.compactSurface?.label || "Shelf ready",
    updatedAt,
    detail: revealStatus.state === "ready"
      ? "Local shelf metadata is reveal-ready; native drag capture and Finder reveal UI are deferred."
      : "Local shelf metadata is unavailable for reveal; native drag capture and Finder reveal UI are deferred.",
    revealReadyPath: revealStatus.revealReadyPath,
    revealStatus,
    metadata: { ...activity.metadata },
    shelfActivity: activity,
    persisted: false
  };
}

function buildShelfStatusPayload(state = createShelfState()) {
  if (!state?.active) return { statuses: [] };
  return { statuses: [shelfActivityToNativeStatus(state.active)] };
}

module.exports = {
  addDroppedFileToShelf,
  addDroppedFilesToShelf,
  applyDroppedFileToShelf,
  buildShelfActivity,
  buildShelfRevealStatus,
  buildShelfStatusPayload,
  clearShelf,
  createShelfState,
  shelfActivityToNativeStatus
};
