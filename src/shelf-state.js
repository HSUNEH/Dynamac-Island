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

function createShelfState(seed = {}) {
  const now = finiteTimestamp(seed.now ?? seed.updatedAt, Date.now());
  const items = Array.isArray(seed.items) ? seed.items.map((item) => ({ ...item })) : [];
  return {
    version: 1,
    updatedAt: now,
    items,
    active: seed.active && typeof seed.active === "object" ? { ...seed.active } : null,
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
      label: `Shelf · ${fileLabel(fileCount)} ready`
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
      latestFile
    },
    revealReadyPath: latest.path,
    persisted: false
  };
}

function nextSequence(items) {
  return items.length;
}

function addDroppedFileToShelf(state = createShelfState(), drop = {}, options = {}) {
  const previous = createShelfState(state);
  const observedAt = finiteTimestamp(drop.observedAt ?? options.now ?? Date.now(), undefined, "observedAt");
  const recordedAt = finiteTimestamp(options.now ?? observedAt, observedAt);
  rejectExplicitlyDisallowedDrop(drop);
  const { resolvedPath, stat } = validateDroppedFilePath(drop.filePath);
  const sequence = nextSequence(previous.items);
  const source = String(drop.source || DEFAULT_SOURCE).trim() || DEFAULT_SOURCE;
  const item = {
    itemId: `shelf-${observedAt}-${String(sequence).padStart(3, "0")}`,
    path: resolvedPath,
    name: path.basename(resolvedPath),
    type: normalizeType(drop.type),
    size: stat.size,
    source,
    observedAt,
    recordedAt,
    revealReadyPath: resolvedPath,
    persisted: false
  };
  const next = createShelfState({
    updatedAt: recordedAt,
    items: [...previous.items, item],
    persisted: false
  });
  next.active = buildShelfActivity(next, { now: recordedAt });
  return next;
}

function clearShelf(_state = createShelfState(), options = {}) {
  return createShelfState({
    now: finiteTimestamp(options.now, Date.now()),
    items: [],
    active: null,
    persisted: false
  });
}

function shelfActivityToNativeStatus(activity) {
  if (!activity || typeof activity !== "object") {
    throw new Error("shelf activity is required");
  }
  const updatedAt = new Date(finiteTimestamp(activity.updatedAt, undefined, "activity.updatedAt")).toISOString();
  return {
    agent: "DynaShelf",
    activityType: "shelf",
    state: "running",
    task: activity.status?.label || activity.compactSurface?.label || "Shelf ready",
    updatedAt,
    detail: "Local shelf metadata is ready; native drag capture and Finder reveal UI are deferred.",
    revealReadyPath: activity.revealReadyPath || "",
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
  buildShelfActivity,
  buildShelfStatusPayload,
  clearShelf,
  createShelfState,
  shelfActivityToNativeStatus
};
