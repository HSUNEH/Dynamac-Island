const DEFAULT_TRANSIENT_MS = 1600;
const DEFAULT_PRIORITY = 90;
const DEFAULT_SOURCE = "local-brightness-observer";
const DEFAULT_DISPLAY_NAME = "Display";

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
  createBrightnessHudState
};
