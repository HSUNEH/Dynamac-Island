const BATTERY_MILESTONES = Object.freeze([5, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
const BATTERY_MILESTONE_SET = new Set(BATTERY_MILESTONES);
const DEFAULT_BATTERY_HUD_TRANSIENT_MS = 7000;
const BATTERY_ACTIVITY_PRIORITY = 100;

function clampPercent(value) {
  const percent = Math.round(Number(value));
  if (!Number.isFinite(percent)) return null;
  return Math.min(100, Math.max(0, percent));
}

function parseBatteryObservationFromPmset(output) {
  const text = String(output || "");
  const percentMatch = text.match(/(\d+)%/);
  if (!percentMatch) return null;
  const percent = clampPercent(percentMatch[1]);
  if (percent === null) return null;
  const lower = text.toLowerCase();
  const stateMatch = text.match(/;\s*([^;]+);/);
  const rawState = stateMatch ? stateMatch[1].trim().toLowerCase() : "unknown";
  const charging = rawState === "charging" || rawState === "charged" || rawState.includes("finishing charge") || lower.includes("'ac power'");
  const powerSource = lower.includes("'ac power'") ? "AC Power" : (lower.includes("'battery power'") ? "Battery Power" : "Unknown Power");
  const remainingMatch = text.match(/;\s*[^;]+;\s*([^\n]+?)\s+present:/i);
  return { percent, charging, rawState, powerSource, estimatedTimeText: remainingMatch ? remainingMatch[1].replace(/\s+/g, " ").trim() : "" };
}

function createBatteryHudState(initial = {}) {
  return {
    emittedMilestones: new Set(initial.emittedMilestones instanceof Set ? Array.from(initial.emittedMilestones) : (Array.isArray(initial.emittedMilestones) ? initial.emittedMilestones : [])),
    lastPercent: Number.isFinite(Number(initial.lastPercent)) ? Number(initial.lastPercent) : null,
    wasCharging: initial.wasCharging === true,
    active: initial.active || null
  };
}

function normalizeBatteryHudState(state) {
  return state && typeof state === "object" ? createBatteryHudState(state) : createBatteryHudState();
}

function batteryGlyph(percent) {
  const bucket = Math.min(100, Math.max(0, Math.round(Number(percent) / 25) * 25));
  return `battery.${bucket}`;
}

function sanitizedBatteryDetail(observation) {
  if (!observation) return "Battery state is unavailable on this Mac or display session.";
  const verb = observation.charging ? "charging" : "discharging";
  const source = observation.powerSource && observation.powerSource !== "Unknown Power" ? ` from ${observation.powerSource}` : "";
  return `Battery is ${verb}${source} at ${observation.percent}%.`;
}

function isBatteryMilestone(percent) {
  return BATTERY_MILESTONE_SET.has(Number(percent));
}

function batteryStatusState(observation) {
  if (!observation) return "idle";
  if (!observation.charging && observation.percent <= 20) return "warning";
  return "running";
}

function buildBatteryHudActivity(observation, options = {}) {
  const nowMs = Number(options.nowMs);
  const transientMs = Number(options.transientMs ?? DEFAULT_BATTERY_HUD_TRANSIENT_MS);
  const displayMode = options.displayMode || "compactPrimary";
  const activityId = `battery-${observation.percent}-${nowMs}`;
  const expiresAt = nowMs + (Number.isFinite(transientMs) && transientMs > 0 ? transientMs : DEFAULT_BATTERY_HUD_TRANSIENT_MS);
  const label = `${observation.percent}%`;
  return {
    activityId,
    activityType: "battery",
    priority: BATTERY_ACTIVITY_PRIORITY,
    createdAt: nowMs,
    updatedAt: nowMs,
    expiresAt,
    isTransient: true,
    status: { percent: observation.percent, charging: observation.charging, milestonePercent: observation.percent, displayText: label, displayMode, rawBatteryTextVisible: false },
    compactSurface: { glyph: batteryGlyph(observation.percent), label, progress: observation.percent / 100, hudKind: "batteryMilestone", displayMode },
    expandedSurface: null,
    source: options.source || "pmset-battery",
    metadata: { inputKind: "battery", powerSource: observation.powerSource, rawBatteryTextVisible: false },
    revealReadyPath: "",
    persisted: false
  };
}

function shouldEmitBatteryMilestone(state, observation) {
  if (!observation || !observation.charging || !isBatteryMilestone(observation.percent)) return false;
  if (!state.wasCharging) state.emittedMilestones.clear();
  return !state.emittedMilestones.has(observation.percent);
}

function applyBatteryObservation(stateInput, observationInput, options = {}) {
  const state = normalizeBatteryHudState(stateInput);
  const observation = observationInput && typeof observationInput === "object" ? { ...observationInput, percent: clampPercent(observationInput.percent) } : null;
  const now = options.now || new Date();
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const validObservation = observation && observation.percent !== null ? observation : null;
  const emit = validObservation && shouldEmitBatteryMilestone(state, validObservation);
  let active = null;
  if (emit) {
    active = buildBatteryHudActivity(validObservation, { nowMs, transientMs: options.transientMs, displayMode: options.displayMode, source: options.source });
    state.emittedMilestones.add(validObservation.percent);
  } else if (state.active && Number(state.active.expiresAt) > nowMs) {
    active = state.active;
  }
  if (!validObservation || !validObservation.charging) {
    state.emittedMilestones.clear();
  } else if (validObservation.percent !== 100 && state.lastPercent === 100) {
    state.emittedMilestones.delete(100);
  }
  state.wasCharging = Boolean(validObservation?.charging);
  state.lastPercent = validObservation?.percent ?? null;
  state.active = active;
  return { state, active };
}

function batteryHudToNativeStatus(activity, observation, options = {}) {
  const percent = observation?.percent ?? activity?.status?.percent;
  const charging = Boolean(observation?.charging ?? activity?.status?.charging);
  const label = charging ? "Charging" : "Battery";
  return {
    agent: "Battery",
    activityType: "battery",
    state: batteryStatusState(observation || (percent !== undefined ? { percent, charging } : null)),
    task: percent === undefined ? "Battery unavailable" : `${label} ${percent}%`,
    detail: observation ? sanitizedBatteryDetail(observation) : (percent === undefined ? sanitizedBatteryDetail(null) : `Battery is ${charging ? "charging" : "discharging"} at ${percent}%.`),
    ...(activity ? { batteryHud: activity, activityId: activity.activityId, expiresAt: new Date(activity.expiresAt).toISOString(), isTransient: true } : {}),
    metadata: { ...(options.metadata || {}), rawBatteryTextVisible: false, batteryDisplayMode: activity?.status?.displayMode || "passive" },
    persisted: false
  };
}

function batteryObservationToNativeStatus(observation, options = {}) {
  return batteryHudToNativeStatus(null, observation, options);
}

module.exports = {
  BATTERY_MILESTONES,
  DEFAULT_BATTERY_HUD_TRANSIENT_MS,
  applyBatteryObservation,
  batteryGlyph,
  batteryHudToNativeStatus,
  batteryObservationToNativeStatus,
  createBatteryHudState,
  isBatteryMilestone,
  parseBatteryObservationFromPmset,
  sanitizedBatteryDetail
};
