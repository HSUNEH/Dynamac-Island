const ACTIVITY_PRIORITIES = Object.freeze({
  volume: 600,
  brightness: 600,
  clipboard: 500,
  shelf: 400,
  drop: 400,
  timer: 300,
  nowPlaying: 200,
  battery: 100,
  futurePassive: 0
});

const AGENT_ACTIVITY_TYPES = Object.freeze({
  "Volume": "volume",
  "Brightness": "brightness",
  "DynaKeys Volume": "volume",
  "DynaKeys Brightness": "brightness",
  "Clipboard": "clipboard",
  "DynaClip": "clipboard",
  "Shelf": "shelf",
  "DynaShelf": "shelf",
  "DynaDrop": "drop",
  "Drop": "drop",
  "Timer": "timer",
  "Now Playing": "nowPlaying",
  "Battery": "battery"
});

const HUD_ACTIVITY_TYPES = new Set(["volume", "brightness"]);

function stableActivityType(value) {
  if (typeof value !== "string" || value.trim() === "") return "futurePassive";
  const clean = value.trim();
  return Object.prototype.hasOwnProperty.call(ACTIVITY_PRIORITIES, clean) ? clean : "futurePassive";
}

function activityTypeForStatus(status) {
  if (!status || typeof status !== "object") return "futurePassive";
  if (status.activityType) return stableActivityType(status.activityType);
  return AGENT_ACTIVITY_TYPES[status.agent] || "futurePassive";
}

function timestampMs(value, fallback = 0) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function slug(value) {
  return String(value || "activity")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "activity";
}

function activityIdForStatus(status, index) {
  const embedded = embeddedActivityForStatus(status);
  if (typeof embedded?.activityId === "string" && embedded.activityId.trim() !== "") return embedded.activityId.trim();
  if (typeof status?.activityId === "string" && status.activityId.trim() !== "") return status.activityId.trim();
  if (typeof status?.id === "string" && status.id.trim() !== "") return status.id.trim();
  return `${slug(status?.agent || status?.activityType || "activity")}-${index}`;
}

function embeddedActivityForStatus(status) {
  if (!status || typeof status !== "object") return null;
  const candidates = [status.activity, status.volumeHud, status.brightnessHud, status.clipboardActivity, status.shelfActivity, status.dropActivity];
  return candidates.find((candidate) => candidate && typeof candidate === "object" && !Array.isArray(candidate)) || null;
}

function isActivityExpired(activity, nowMs) {
  return Number.isFinite(activity.expiresAt) && activity.expiresAt <= nowMs;
}

function isCompactEligibleActivity(activity) {
  if (activity.activityType === "nowPlaying") return activity.status?.state === "running";
  if (activity.activityType !== "timer") return true;

  const timerState = activity.status?.timer?.state;
  if (typeof timerState === "string") return timerState === "running";
  return activity.status?.state === "running";
}

function compactLabelForActivity(activity) {
  if (activity.status?.compactLabel) return String(activity.status.compactLabel);
  if (activity.status?.task) return String(activity.status.task);
  return activity.activityType;
}

function expandedTitleForActivity(activity) {
  if (activity.status?.expandedTitle) return String(activity.status.expandedTitle);
  if (activity.status?.detail) return String(activity.status.detail);
  return compactLabelForActivity(activity);
}

function normalizeActivity(status, index = 0, options = {}) {
  const embedded = embeddedActivityForStatus(status);
  const activityType = activityTypeForStatus(status);
  const updatedAt = timestampMs(embedded?.updatedAt ?? status?.updatedAt, timestampMs(options.now, Date.now()));
  const createdAt = timestampMs(status?.createdAt ?? embedded?.createdAt, updatedAt);
  const rawExpiresAt = status?.expiresAt ?? embedded?.expiresAt;
  const expiresAt = rawExpiresAt === undefined || rawExpiresAt === null || rawExpiresAt === ""
    ? null
    : timestampMs(rawExpiresAt, Number.NaN);
  const isTransient = typeof status?.isTransient === "boolean" ? status.isTransient : (typeof embedded?.isTransient === "boolean" ? embedded.isTransient : Number.isFinite(expiresAt));
  const activity = {
    activityId: activityIdForStatus(status, index),
    activityType,
    priority: ACTIVITY_PRIORITIES[activityType],
    createdAt,
    updatedAt,
    expiresAt,
    isTransient,
    status: status && typeof status === "object" ? { ...status } : {},
    source: typeof status?.source === "string" && status.source.trim() !== "" ? status.source : (typeof embedded?.source === "string" && embedded.source.trim() !== "" ? embedded.source : "status-file"),
    metadata: status?.metadata && typeof status.metadata === "object" && !Array.isArray(status.metadata) ? { ...status.metadata } : (embedded?.metadata && typeof embedded.metadata === "object" && !Array.isArray(embedded.metadata) ? { ...embedded.metadata } : {}),
    revealReadyPath: typeof status?.revealReadyPath === "string" ? status.revealReadyPath : (typeof embedded?.revealReadyPath === "string" ? embedded.revealReadyPath : ""),
    persisted: status?.persisted === true || embedded?.persisted === true
  };

  activity.compactSurface = embedded?.compactSurface && typeof embedded.compactSurface === "object" && !Array.isArray(embedded.compactSurface) ? { ...embedded.compactSurface } : {
    activityId: activity.activityId,
    activityType: activity.activityType,
    priority: activity.priority,
    label: compactLabelForActivity(activity)
  };
  activity.expandedSurface = embedded?.expandedSurface && typeof embedded.expandedSurface === "object" && !Array.isArray(embedded.expandedSurface) ? { ...embedded.expandedSurface } : {
    activityId: activity.activityId,
    activityType: activity.activityType,
    title: expandedTitleForActivity(activity)
  };
  activity.compactSurface.activityId = activity.activityId;
  activity.compactSurface.activityType = activity.activityType;
  activity.compactSurface.priority = activity.priority;
  activity.expandedSurface.activityId = activity.activityId;
  activity.expandedSurface.activityType = activity.activityType;

  return activity;
}

function compareActivities(left, right) {
  if (left.priority !== right.priority) return right.priority - left.priority;
  if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt;
  if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt;
  return left.activityId.localeCompare(right.activityId);
}

function suppressOverlappingHudActivities(activities) {
  let hasHudActivity = false;
  return activities.filter((activity) => {
    if (!HUD_ACTIVITY_TYPES.has(activity.activityType)) return true;
    if (hasHudActivity) return false;
    hasHudActivity = true;
    return true;
  });
}

function rankActivities(statuses, options = {}) {
  const nowMs = timestampMs(options.now, Date.now());
  if (!Array.isArray(statuses)) return [];
  return suppressOverlappingHudActivities(statuses
    .map((status, index) => normalizeActivity(status, index, options))
    .filter((activity) => !isActivityExpired(activity, nowMs))
    .filter(isCompactEligibleActivity)
    .sort(compareActivities));
}

function selectCompactActivity(statuses, options = {}) {
  return rankActivities(statuses, options)[0] || null;
}

function buildActivityRouterSnapshot(statuses, options = {}) {
  const rankedActivities = rankActivities(statuses, options);
  const compactActivity = rankedActivities[0] || null;
  return {
    order: ["volume", "brightness", "clipboard", "shelf", "drop", "timer", "nowPlaying", "battery", "futurePassive"],
    rankedActivities,
    compactSurface: compactActivity ? compactActivity.compactSurface : null
  };
}

module.exports = {
  ACTIVITY_PRIORITIES,
  activityTypeForStatus,
  buildActivityRouterSnapshot,
  compareActivities,
  normalizeActivity,
  rankActivities,
  suppressOverlappingHudActivities,
  selectCompactActivity
};
