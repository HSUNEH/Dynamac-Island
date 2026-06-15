const DEFAULT_TRANSIENT_MS = 1600;
const DEFAULT_PRIORITY = 90;
const DEFAULT_SOURCE = "local-brightness-observer";
const DEFAULT_DISPLAY_NAME = "Display";
const BRIGHTNESS_HUD_STATE_SCHEMA = "dynamac.brightnessHud.state.v1";

function createBrightnessHudState(active = null) {
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
    throw new Error("brightness level must be between 0 and 100");
  }
  return level;
}

function displayTextForBrightness(level) {
  return `${level}%`;
}

function compactSurfaceForBrightness(level) {
  return {
    glyph: level <= 10 ? "sun.min" : "sun.max",
    label: displayTextForBrightness(level),
    progress: Number((level / 100).toFixed(2))
  };
}

function expandedSurfaceForBrightness(level, displayName) {
  return {
    title: "Brightness",
    subtitle: `${displayName} · ${displayTextForBrightness(level)}`,
    valueLabel: displayTextForBrightness(level)
  };
}

function directionForBrightness(previousActivity, level) {
  if (!previousActivity) return "initial";
  const previousLevel = previousActivity.status.level;
  if (level > previousLevel) return "up";
  if (level < previousLevel) return "down";
  return "steady";
}

function detailForBrightness(activity) {
  const { level, previousLevel, direction } = activity.status;
  if (direction === "initial") return `Display brightness set to ${level}%.`;
  if (direction === "up") return `Display brightness increased from ${previousLevel}% to ${level}%.`;
  if (direction === "down") return `Display brightness decreased from ${previousLevel}% to ${level}%.`;
  return `Display brightness remains ${level}%.`;
}

function reusablePreviousActivity(state, observedAt) {
  const previous = state?.active || null;
  if (!previous) return null;
  return Number(previous.expiresAt) >= observedAt ? previous : null;
}

function expireBrightnessHudState(state = createBrightnessHudState(), options = {}) {
  const now = assertFiniteTimestamp(options.now ?? Date.now(), "now");
  const active = reusablePreviousActivity(state, now);
  return active ? createBrightnessHudState(active) : createBrightnessHudState();
}

function applyBrightnessHudInputChange(state = createBrightnessHudState(), input = {}, options = {}) {
  const observedAt = assertFiniteTimestamp(input.observedAt ?? options.now ?? Date.now(), "observedAt");
  const level = normalizeLevel(input.level);
  const previousActivity = reusablePreviousActivity(state, observedAt);
  const createdAt = previousActivity?.createdAt ?? observedAt;
  const transientMs = Number.isFinite(Number(options.transientMs)) ? Number(options.transientMs) : DEFAULT_TRANSIENT_MS;
  const displayName = String(input.displayName || DEFAULT_DISPLAY_NAME).trim() || DEFAULT_DISPLAY_NAME;
  const source = String(input.source || DEFAULT_SOURCE).trim() || DEFAULT_SOURCE;
  const previousLevel = previousActivity ? previousActivity.status.level : null;
  const direction = directionForBrightness(previousActivity, level);

  return createBrightnessHudState({
    activityId: previousActivity?.activityId || `brightness-${observedAt}`,
    activityType: "brightness",
    priority: DEFAULT_PRIORITY,
    createdAt,
    updatedAt: observedAt,
    expiresAt: observedAt + transientMs,
    isTransient: true,
    status: {
      level,
      previousLevel,
      direction,
      displayText: displayTextForBrightness(level)
    },
    compactSurface: compactSurfaceForBrightness(level),
    expandedSurface: expandedSurfaceForBrightness(level, displayName),
    source,
    metadata: {
      displayName,
      inputKind: "brightness",
      rawLevel: input.level
    },
    revealReadyPath: "",
    persisted: false
  });
}

function updateVisibleBrightnessHudState(state = createBrightnessHudState(), input = {}, options = {}) {
  const observedAt = assertFiniteTimestamp(input.observedAt ?? options.now ?? Date.now(), "observedAt");
  const previousActivity = reusablePreviousActivity(state, observedAt);
  const nextState = applyBrightnessHudInputChange(state, { ...input, observedAt }, options);

  return {
    state: nextState,
    activity: nextState.active,
    updateKind: previousActivity ? "refreshed" : "replaced"
  };
}

function createInitialBrightnessHudCompactActivity(input = {}, options = {}) {
  return applyBrightnessHudInputChange(createBrightnessHudState(), input, options).active;
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

function serializeBrightnessHudActivity(activity) {
  assertPlainObject(activity, "brightnessHud.active");
  const status = assertPlainObject(activity.status, "brightnessHud.active.status");
  const compactSurface = assertPlainObject(activity.compactSurface, "brightnessHud.active.compactSurface");
  const expandedSurface = assertPlainObject(activity.expandedSurface, "brightnessHud.active.expandedSurface");
  const metadata = assertPlainObject(activity.metadata, "brightnessHud.active.metadata");

  if (activity.activityType !== "brightness") {
    throw new Error("brightnessHud.active.activityType must be brightness");
  }

  return {
    activityId: assertString(activity.activityId, "brightnessHud.active.activityId"),
    activityType: "brightness",
    priority: assertFiniteNumber(activity.priority, "brightnessHud.active.priority"),
    createdAt: assertFiniteTimestamp(activity.createdAt, "brightnessHud.active.createdAt"),
    updatedAt: assertFiniteTimestamp(activity.updatedAt, "brightnessHud.active.updatedAt"),
    expiresAt: assertFiniteTimestamp(activity.expiresAt, "brightnessHud.active.expiresAt"),
    isTransient: assertBoolean(activity.isTransient, "brightnessHud.active.isTransient"),
    status: {
      level: normalizeLevel(status.level),
      previousLevel: status.previousLevel === null ? null : normalizeLevel(status.previousLevel),
      direction: assertString(status.direction, "brightnessHud.active.status.direction"),
      displayText: assertString(status.displayText, "brightnessHud.active.status.displayText")
    },
    compactSurface: {
      glyph: assertString(compactSurface.glyph, "brightnessHud.active.compactSurface.glyph"),
      label: assertString(compactSurface.label, "brightnessHud.active.compactSurface.label"),
      progress: assertFiniteNumber(compactSurface.progress, "brightnessHud.active.compactSurface.progress")
    },
    expandedSurface: {
      title: assertString(expandedSurface.title, "brightnessHud.active.expandedSurface.title"),
      subtitle: assertString(expandedSurface.subtitle, "brightnessHud.active.expandedSurface.subtitle"),
      valueLabel: assertString(expandedSurface.valueLabel, "brightnessHud.active.expandedSurface.valueLabel")
    },
    source: assertString(activity.source, "brightnessHud.active.source"),
    metadata: {
      displayName: assertString(metadata.displayName, "brightnessHud.active.metadata.displayName"),
      inputKind: assertString(metadata.inputKind, "brightnessHud.active.metadata.inputKind"),
      rawLevel: metadata.rawLevel
    },
    revealReadyPath: assertString(activity.revealReadyPath, "brightnessHud.active.revealReadyPath"),
    persisted: assertBoolean(activity.persisted, "brightnessHud.active.persisted")
  };
}

function serializeBrightnessHudState(state = createBrightnessHudState()) {
  const active = state?.active ? serializeBrightnessHudActivity(state.active) : null;
  return {
    schema: BRIGHTNESS_HUD_STATE_SCHEMA,
    active
  };
}

function deserializeBrightnessHudState(serialized) {
  const payload = assertPlainObject(serialized, "brightnessHud state payload");
  if (payload.schema !== BRIGHTNESS_HUD_STATE_SCHEMA) {
    throw new Error(`brightnessHud state schema must be ${BRIGHTNESS_HUD_STATE_SCHEMA}`);
  }
  if (payload.active === null) return createBrightnessHudState();
  return createBrightnessHudState(serializeBrightnessHudActivity(payload.active));
}

function showBrightnessHud(input = {}, options = {}) {
  const state = applyBrightnessHudInputChange(options.state || createBrightnessHudState(), input, options);
  const activity = state.active;
  return {
    state,
    activity,
    compactSurface: activity.compactSurface,
    status: brightnessHudToNativeStatus(activity)
  };
}

function brightnessHudToNativeStatus(activity) {
  if (!activity || typeof activity !== "object") {
    throw new Error("brightness HUD activity is required");
  }
  const updatedAt = new Date(assertFiniteTimestamp(activity.updatedAt, "activity.updatedAt")).toISOString();
  const label = activity.status?.displayText || activity.compactSurface?.label || "Brightness";
  return {
    agent: "Brightness",
    state: "running",
    task: `Brightness ${label}`,
    updatedAt,
    detail: detailForBrightness(activity),
    brightnessHud: activity
  };
}

function buildBrightnessHudStatusPayload(state) {
  if (!state?.active) return { statuses: [] };
  return { statuses: [brightnessHudToNativeStatus(state.active)] };
}

module.exports = {
  applyBrightnessHudInputChange,
  brightnessHudToNativeStatus,
  buildBrightnessHudStatusPayload,
  createInitialBrightnessHudCompactActivity,
  createBrightnessHudState,
  deserializeBrightnessHudState,
  expireBrightnessHudState,
  serializeBrightnessHudState,
  showBrightnessHud,
  updateVisibleBrightnessHudState
};
