const DEFAULT_TRANSIENT_MS = 1600;
const DEFAULT_PRIORITY = 90;
const DEFAULT_SOURCE = "local-volume-observer";
const DEFAULT_DEVICE_NAME = "Output";
const VOLUME_HUD_STATE_SCHEMA = "dynamac.volumeHud.state.v1";

function createVolumeHudState(active = null) {
  return { active };
}

function assertFiniteTimestamp(value, fieldName) {
  if (!Number.isFinite(Number(value))) {
    throw new Error(`${fieldName} must be a finite timestamp`);
  }
  return Number(value);
}

function normalizeLevel(value) {
  const level = Math.round(Number(value));
  if (!Number.isFinite(level) || level < 0 || level > 100) {
    throw new Error("volume level must be between 0 and 100");
  }
  return level;
}

function normalizeMuted(value) {
  return value === true;
}

function displayTextForVolume(level, muted) {
  return muted ? "Muted" : `${level}%`;
}

function compactSurfaceForVolume(level, muted) {
  return {
    glyph: muted ? "speaker.slash" : "speaker",
    label: displayTextForVolume(level, muted),
    progress: muted ? 0 : Number((level / 100).toFixed(2))
  };
}

function expandedSurfaceForVolume(level, muted, deviceName) {
  return {
    title: "Volume",
    subtitle: `${deviceName} · ${displayTextForVolume(level, muted)}`,
    valueLabel: displayTextForVolume(level, muted)
  };
}

function directionForVolume(previousActivity, level, muted) {
  if (!previousActivity) return "initial";
  if (muted) return "muted";
  if (previousActivity.status.muted && !muted) return "unmuted";
  const previousLevel = previousActivity.status.level;
  if (level > previousLevel) return "up";
  if (level < previousLevel) return "down";
  return "steady";
}

function detailForVolume(activity) {
  const { level, muted, previousLevel, direction } = activity.status;
  if (direction === "initial") {
    return muted ? "Output volume is muted." : `Output volume set to ${level}%.`;
  }
  if (direction === "muted") return "Output volume muted.";
  if (direction === "unmuted") return `Output volume unmuted at ${level}%.`;
  if (direction === "up") return `Output volume increased from ${previousLevel}% to ${level}%.`;
  if (direction === "down") return `Output volume decreased from ${previousLevel}% to ${level}%.`;
  return muted ? "Output volume remains muted." : `Output volume remains ${level}%.`;
}

function reusablePreviousActivity(state, observedAt) {
  const previous = state?.active || null;
  if (!previous) return null;
  return Number(previous.expiresAt) >= observedAt ? previous : null;
}

function expireVolumeHudState(state = createVolumeHudState(), options = {}) {
  const now = assertFiniteTimestamp(options.now ?? Date.now(), "now");
  const active = reusablePreviousActivity(state, now);
  return active ? createVolumeHudState(active) : createVolumeHudState();
}

function applyVolumeHudInputChange(state = createVolumeHudState(), input = {}, options = {}) {
  const observedAt = assertFiniteTimestamp(input.observedAt ?? options.now ?? Date.now(), "observedAt");
  const level = normalizeLevel(input.level);
  const muted = normalizeMuted(input.muted);
  const previousActivity = reusablePreviousActivity(state, observedAt);
  const createdAt = previousActivity?.createdAt ?? observedAt;
  const transientMs = Number.isFinite(Number(options.transientMs)) ? Number(options.transientMs) : DEFAULT_TRANSIENT_MS;
  const deviceName = String(input.deviceName || DEFAULT_DEVICE_NAME).trim() || DEFAULT_DEVICE_NAME;
  const source = String(input.source || DEFAULT_SOURCE).trim() || DEFAULT_SOURCE;
  const previousLevel = previousActivity ? previousActivity.status.level : null;
  const direction = directionForVolume(previousActivity, level, muted);

  return createVolumeHudState({
    activityId: previousActivity?.activityId || `volume-${observedAt}`,
    activityType: "volume",
    priority: DEFAULT_PRIORITY,
    createdAt,
    updatedAt: observedAt,
    expiresAt: observedAt + transientMs,
    isTransient: true,
    status: {
      level,
      muted,
      previousLevel,
      direction,
      displayText: displayTextForVolume(level, muted)
    },
    compactSurface: compactSurfaceForVolume(level, muted),
    expandedSurface: expandedSurfaceForVolume(level, muted, deviceName),
    source,
    metadata: {
      deviceName,
      inputKind: "volume",
      rawLevel: input.level,
      rawMuted: muted
    },
    revealReadyPath: "",
    persisted: false
  });
}

function updateVisibleVolumeHudState(state = createVolumeHudState(), input = {}, options = {}) {
  const observedAt = assertFiniteTimestamp(input.observedAt ?? options.now ?? Date.now(), "observedAt");
  const previousActivity = reusablePreviousActivity(state, observedAt);
  const nextState = applyVolumeHudInputChange(state, { ...input, observedAt }, options);

  return {
    state: nextState,
    activity: nextState.active,
    updateKind: previousActivity ? "refreshed" : "replaced"
  };
}

function createInitialVolumeHudCompactActivity(input = {}, options = {}) {
  return applyVolumeHudInputChange(createVolumeHudState(), input, options).active;
}

function assertPlainObject(value, fieldName) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object`);
  }
  return value;
}

function assertString(value, fieldName) {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string`);
  }
  return value;
}

function assertBoolean(value, fieldName) {
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean`);
  }
  return value;
}

function assertFiniteNumber(value, fieldName) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${fieldName} must be a finite number`);
  }
  return number;
}

function serializeVolumeHudActivity(activity) {
  assertPlainObject(activity, "volumeHud.active");
  const status = assertPlainObject(activity.status, "volumeHud.active.status");
  const compactSurface = assertPlainObject(activity.compactSurface, "volumeHud.active.compactSurface");
  const expandedSurface = assertPlainObject(activity.expandedSurface, "volumeHud.active.expandedSurface");
  const metadata = assertPlainObject(activity.metadata, "volumeHud.active.metadata");

  if (activity.activityType !== "volume") {
    throw new Error("volumeHud.active.activityType must be volume");
  }

  return {
    activityId: assertString(activity.activityId, "volumeHud.active.activityId"),
    activityType: "volume",
    priority: assertFiniteNumber(activity.priority, "volumeHud.active.priority"),
    createdAt: assertFiniteTimestamp(activity.createdAt, "volumeHud.active.createdAt"),
    updatedAt: assertFiniteTimestamp(activity.updatedAt, "volumeHud.active.updatedAt"),
    expiresAt: assertFiniteTimestamp(activity.expiresAt, "volumeHud.active.expiresAt"),
    isTransient: assertBoolean(activity.isTransient, "volumeHud.active.isTransient"),
    status: {
      level: normalizeLevel(status.level),
      muted: assertBoolean(status.muted, "volumeHud.active.status.muted"),
      previousLevel: status.previousLevel === null ? null : normalizeLevel(status.previousLevel),
      direction: assertString(status.direction, "volumeHud.active.status.direction"),
      displayText: assertString(status.displayText, "volumeHud.active.status.displayText")
    },
    compactSurface: {
      glyph: assertString(compactSurface.glyph, "volumeHud.active.compactSurface.glyph"),
      label: assertString(compactSurface.label, "volumeHud.active.compactSurface.label"),
      progress: assertFiniteNumber(compactSurface.progress, "volumeHud.active.compactSurface.progress")
    },
    expandedSurface: {
      title: assertString(expandedSurface.title, "volumeHud.active.expandedSurface.title"),
      subtitle: assertString(expandedSurface.subtitle, "volumeHud.active.expandedSurface.subtitle"),
      valueLabel: assertString(expandedSurface.valueLabel, "volumeHud.active.expandedSurface.valueLabel")
    },
    source: assertString(activity.source, "volumeHud.active.source"),
    metadata: {
      deviceName: assertString(metadata.deviceName, "volumeHud.active.metadata.deviceName"),
      inputKind: assertString(metadata.inputKind, "volumeHud.active.metadata.inputKind"),
      rawLevel: metadata.rawLevel,
      rawMuted: assertBoolean(metadata.rawMuted, "volumeHud.active.metadata.rawMuted")
    },
    revealReadyPath: assertString(activity.revealReadyPath, "volumeHud.active.revealReadyPath"),
    persisted: assertBoolean(activity.persisted, "volumeHud.active.persisted")
  };
}

function serializeVolumeHudState(state = createVolumeHudState()) {
  const active = state?.active ? serializeVolumeHudActivity(state.active) : null;
  return {
    schema: VOLUME_HUD_STATE_SCHEMA,
    active
  };
}

function deserializeVolumeHudState(serialized) {
  const payload = assertPlainObject(serialized, "volumeHud state payload");
  if (payload.schema !== VOLUME_HUD_STATE_SCHEMA) {
    throw new Error(`volumeHud state schema must be ${VOLUME_HUD_STATE_SCHEMA}`);
  }
  if (payload.active === null) return createVolumeHudState();
  return createVolumeHudState(serializeVolumeHudActivity(payload.active));
}

function volumeHudToNativeStatus(activity) {
  if (!activity || typeof activity !== "object") {
    throw new Error("volume HUD activity is required");
  }
  const updatedAt = new Date(assertFiniteTimestamp(activity.updatedAt, "activity.updatedAt")).toISOString();
  const label = activity.status?.displayText || activity.compactSurface?.label || "Volume";
  return {
    agent: "Volume",
    state: "running",
    task: `Volume ${label}`,
    updatedAt,
    detail: detailForVolume(activity),
    volumeHud: activity
  };
}

function buildVolumeHudStatusPayload(state) {
  if (!state?.active) return { statuses: [] };
  return { statuses: [volumeHudToNativeStatus(state.active)] };
}

module.exports = {
  applyVolumeHudInputChange,
  buildVolumeHudStatusPayload,
  createInitialVolumeHudCompactActivity,
  createVolumeHudState,
  deserializeVolumeHudState,
  expireVolumeHudState,
  serializeVolumeHudState,
  updateVisibleVolumeHudState,
  volumeHudToNativeStatus
};
