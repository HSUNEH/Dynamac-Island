const { macContextProviderToActivity } = require("./mac-context-provider");

const DEFAULT_MAC_CONTEXT_STALE_AFTER_MS = 30_000;

const MAIN_BASELINE = Object.freeze({
  branch: "main",
  macContextStatusSource: false,
  hudActivityType: false,
  readOnlyFields: Object.freeze([]),
  permissionStatus: false,
  degradationState: false,
  notes: "main does not expose the experimental Mac Context status-source/HUD contract"
});

const EXPECTED_EXPERIMENTAL_READ_ONLY_FIELDS = Object.freeze([
  "activeApp",
  "activeWindow",
  "uiTreeContext",
  "permissionStatus",
  "degradationState",
  "statusSource"
]);

function hasOwnObject(value, key) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, key));
}

function objectStatus(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function truncate(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function timestampMs(value, fallback = Number.NaN) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function macContextStaleness(payload, options = {}) {
  const sampledAtMs = timestampMs(payload?.sampledAt);
  const nowMs = timestampMs(options.now, Date.now());
  const staleAfterMs = Number.isFinite(options.staleAfterMs) ? Math.max(0, options.staleAfterMs) : DEFAULT_MAC_CONTEXT_STALE_AFTER_MS;
  const ageMs = Number.isFinite(sampledAtMs) && Number.isFinite(nowMs) ? Math.max(0, nowMs - sampledAtMs) : Number.NaN;
  return {
    sampledAt: typeof payload?.sampledAt === "string" ? payload.sampledAt : "",
    now: Number.isFinite(nowMs) ? new Date(nowMs).toISOString() : "",
    ageMs,
    staleAfterMs,
    stale: !Number.isFinite(sampledAtMs) || !Number.isFinite(nowMs) || ageMs > staleAfterMs,
    reason: !Number.isFinite(sampledAtMs)
      ? "sampledAt missing or invalid"
      : (!Number.isFinite(nowMs) ? "comparison clock missing or invalid" : (ageMs > staleAfterMs ? "sample age exceeds threshold" : "fresh"))
  };
}

function staleMacContextDegradationText(payload, staleness) {
  const existing = typeof payload?.degradationState === "string" && payload.degradationState.trim()
    ? payload.degradationState.trim()
    : "Mac Context snapshot has no degradation detail.";
  const ageSeconds = Number.isFinite(staleness.ageMs) ? Math.round(staleness.ageMs / 1000) : "unknown";
  return `Mac Context snapshot stale (${ageSeconds}s old; ${staleness.reason}); HUD is showing stale/degraded read-only context until the local writer refreshes. ${existing}`;
}

function summarizeExperimentalMacContextStatus(payload) {
  const statusSourceAvailable = payload?.kind === "dynamac.macContext.statusSource";
  const readOnlyFields = EXPECTED_EXPERIMENTAL_READ_ONLY_FIELDS.filter((field) => hasOwnObject(payload, field));
  const activeApp = objectStatus(payload?.activeApp)
    ? {
        available: Boolean(payload.activeApp.name),
        name: payload.activeApp.name || "",
        bundleIdentifier: payload.activeApp.bundleIdentifier || ""
      }
    : { available: false, name: "", bundleIdentifier: "" };
  const activeWindow = {
    available: Boolean(payload?.activeWindow),
    title: payload?.activeWindow || ""
  };
  const permissions = objectStatus(payload?.permissionStatus)
    ? {
        accessibility: payload.permissionStatus.accessibility?.status || "unknown",
        screenRecording: payload.permissionStatus.screenRecording?.status || "unknown"
      }
    : { accessibility: "missing", screenRecording: "missing" };

  return {
    branch: "feature/macos-mcp-context-hud",
    macContextStatusSource: statusSourceAvailable,
    hudActivityType: payload?.result?.ok === true || statusSourceAvailable,
    readOnlyFields,
    activeApp,
    activeWindow,
    permissionStatus: objectStatus(payload?.permissionStatus),
    permissions,
    uiTreeContext: {
      available: payload?.uiTreeContext?.available === true,
      nodeCount: Array.isArray(payload?.uiTreeContext?.nodes) ? payload.uiTreeContext.nodes.length : 0
    },
    degradationState: typeof payload?.degradationState === "string" ? payload.degradationState : "",
    statusSource: payload?.statusSource || ""
  };
}

function buildStaleMacContextHudStatus(payload, options = {}) {
  const staleness = macContextStaleness(payload, options);
  const status = macContextProviderToActivity(payload);
  if (!staleness.stale) return status;

  const staleDegradationState = staleMacContextDegradationText(payload, staleness);
  const staleTask = truncate(`Stale context · ${payload?.activeApp?.name || "Mac Context"}${payload?.activeWindow ? ` · ${payload.activeWindow}` : ""}`, 80);
  status.state = status.state === "error" ? "error" : "warning";
  status.task = staleTask;
  status.detail = staleDegradationState;
  status.degradationState = staleDegradationState;
  status.updatedAt = staleness.sampledAt || payload?.sampledAt || status.updatedAt;
  status.metadata = {
    ...(status.metadata || {}),
    degradationState: staleDegradationState,
    staleness
  };
  status.macContext = {
    ...(status.macContext || {}),
    metadata: {
      ...(status.macContext?.metadata || {}),
      stale: true,
      staleAgeMs: staleness.ageMs
    },
    expandedSurface: {
      ...(status.macContext?.expandedSurface || {}),
      title: staleDegradationState
    }
  };
  return status;
}

function summarizeMacContextHudState(hudState) {
  const compactSurface = objectStatus(hudState?.compactSurface) ? hudState.compactSurface : null;
  const rankedActivities = Array.isArray(hudState?.rankedActivities) ? hudState.rankedActivities : [];
  const macContextActivities = rankedActivities.filter((activity) => activity?.activityType === "macContext");

  return {
    available: objectStatus(hudState),
    compactActivityType: compactSurface?.activityType || "",
    compactLabel: compactSurface?.label || "",
    compactIsMacContext: compactSurface?.activityType === "macContext",
    rankedActivityCount: rankedActivities.length,
    macContextActivityCount: macContextActivities.length,
    displaysMacContext: compactSurface?.activityType === "macContext" || macContextActivities.length > 0
  };
}

function firstMacContextHudActivity(hudState) {
  const rankedActivities = Array.isArray(hudState?.rankedActivities) ? hudState.rankedActivities : [];
  return rankedActivities.find((activity) => activity?.activityType === "macContext") || null;
}

function normalizeMacContextHudVisibleCopy(payload, hudState) {
  const status = macContextProviderToActivity(payload);
  const macContextActivity = firstMacContextHudActivity(hudState) || status;
  const compactSurface = objectStatus(hudState?.compactSurface)
    ? hudState.compactSurface
    : (macContextActivity.macContext?.compactSurface || {});
  const expandedSurface = macContextActivity.macContext?.expandedSurface || {};

  return {
    compactLabel: compactSurface.label || status.macContext.compactSurface.label || "",
    compactGlyph: compactSurface.glyph || status.macContext.compactSurface.glyph || "",
    task: macContextActivity.status?.task || macContextActivity.task || status.task || "",
    detail: macContextActivity.status?.detail || macContextActivity.detail || status.detail || "",
    expandedTitle: expandedSurface.title || status.macContext.expandedSurface.title || ""
  };
}

function compareNormalMacContextHudUx(payload, options = {}) {
  const experimental = summarizeExperimentalMacContextStatus(payload);
  const hudDisplay = summarizeMacContextHudState(options.hudState);
  const macContextActivity = firstMacContextHudActivity(options.hudState);
  const status = macContextProviderToActivity(payload);
  const hudVisibleCopy = normalizeMacContextHudVisibleCopy(payload, options.hudState);
  const activityState = macContextActivity?.status?.state || status.state || "";
  const normalActiveContext = experimental.activeApp.available
    && experimental.activeWindow.available
    && payload?.result?.status === "success"
    && activityState === "running";
  const regressionRisks = [];

  if (!experimental.macContextStatusSource) regressionRisks.push("missing macContext status-source kind");
  if (!normalActiveContext) regressionRisks.push("normal active context must report success with running HUD state");
  if (!hudDisplay.compactIsMacContext || !hudDisplay.displaysMacContext) regressionRisks.push("normal active context must route into the HUD compact surface");
  if (!hudVisibleCopy.compactLabel || hudVisibleCopy.compactLabel !== experimental.activeApp.name) regressionRisks.push("normal active context compact copy must show active app name");
  if (!hudVisibleCopy.task.includes(experimental.activeApp.name) || !hudVisibleCopy.task.includes(experimental.activeWindow.title)) regressionRisks.push("normal active context task copy must include active app and window");
  if (!hudVisibleCopy.expandedTitle.includes(experimental.activeApp.name) || !hudVisibleCopy.expandedTitle.includes(experimental.activeWindow.title)) regressionRisks.push("normal active context expanded copy must include active app and window");
  if (!/Full read-only active app\/window context available\./.test(hudVisibleCopy.detail)) regressionRisks.push("normal active context detail copy must confirm read-only context availability");

  return {
    schemaVersion: 1,
    kind: "dynamac.macContext.normalHudUxComparison",
    experimental,
    hudDisplay,
    hudVisibleCopy,
    stateMapping: {
      providerStatus: payload?.result?.status || "",
      hudActivityState: activityState,
      compactActivityType: hudDisplay.compactActivityType,
      presentation: hudDisplay.compactIsMacContext ? "normalActiveContext" : "notDisplayed",
      permissionMode: `${experimental.permissions.accessibility}/${experimental.permissions.screenRecording}`
    },
    result: {
      ok: regressionRisks.length === 0,
      normalActiveContext,
      hudVisibleCopyMatchesActiveContext: hudVisibleCopy.compactLabel === experimental.activeApp.name
        && hudVisibleCopy.task.includes(experimental.activeWindow.title)
        && hudVisibleCopy.expandedTitle.includes(experimental.activeWindow.title),
      regressionRisks
    },
    comparisonAgainstMain: {
      ux: regressionRisks.length
        ? `normal Mac Context HUD UX mapping failed: ${regressionRisks.join("; ")}`
        : "normal active Mac Context maps success/running state to HUD-visible app/window copy"
    }
  };
}

function compareUnavailableMacContextHudReliability(payload, options = {}) {
  const experimental = summarizeExperimentalMacContextStatus(payload);
  const hudDisplay = summarizeMacContextHudState(options.hudState);
  const compactSurface = objectStatus(options.hudState?.compactSurface) ? options.hudState.compactSurface : {};
  const macContextActivity = firstMacContextHudActivity(options.hudState);
  const degradation = objectStatus(payload?.result?.degradation) ? payload.result.degradation : {};
  const degradationState = experimental.degradationState || macContextActivity?.status?.degradationState || macContextActivity?.status?.detail || "";
  const activeContextUnavailable = degradation.activeContextUnavailable === true || !experimental.activeApp.available || !experimental.activeWindow.available;
  const activityState = macContextActivity?.status?.state || "";
  const activityTask = macContextActivity?.status?.task || "";
  const compactLabel = compactSurface.label || hudDisplay.compactLabel || "";
  const regressionRisks = [];

  if (!experimental.macContextStatusSource) regressionRisks.push("missing macContext status-source kind");
  if (!activeContextUnavailable) regressionRisks.push("unavailable Mac Context fixture did not report active context unavailable");
  if (payload?.result?.status !== "degraded") regressionRisks.push("unavailable Mac Context must return degraded status instead of success/crash");
  if (!degradationState || degradationState === "Full read-only active app/window context available.") regressionRisks.push("degraded Mac Context HUD must carry user-visible degradation text");
  if (!hudDisplay.compactIsMacContext || !hudDisplay.displaysMacContext) regressionRisks.push("degraded Mac Context must still route into the HUD compact surface");
  if (!compactLabel) regressionRisks.push("degraded Mac Context HUD compact surface must include a non-empty label");
  if (!macContextActivity) regressionRisks.push("degraded Mac Context must remain present in ranked HUD activities");
  if (macContextActivity && !["warning", "error"].includes(activityState)) regressionRisks.push("degraded Mac Context HUD activity must use warning or error state");
  if (macContextActivity && !activityTask) regressionRisks.push("degraded Mac Context HUD activity must include task text");

  return {
    schemaVersion: 1,
    kind: "dynamac.macContext.unavailableReliabilityComparison",
    experimental,
    hudDisplay,
    unavailableContext: {
      activeContextUnavailable,
      unavailableSources: Array.isArray(degradation.unavailableSources) ? [...degradation.unavailableSources] : [],
      degradationState,
      activityState,
      activityTask,
      compactLabel
    },
    result: {
      ok: regressionRisks.length === 0,
      handlesUnavailableMacContext: activeContextUnavailable && payload?.result?.status === "degraded",
      validDegradedHudOutput: hudDisplay.compactIsMacContext && hudDisplay.displaysMacContext && Boolean(compactLabel) && Boolean(degradationState),
      regressionRisks
    },
    comparisonAgainstMain: {
      reliability: regressionRisks.length
        ? `unavailable Mac Context degraded-HUD reliability failed: ${regressionRisks.join("; ")}`
        : "unavailable Mac Context is handled without crashing and remains visible as degraded HUD output"
    }
  };
}

function compareStaleMacContextHudReliability(payload, options = {}) {
  const experimental = summarizeExperimentalMacContextStatus(payload);
  const staleness = macContextStaleness(payload, options);
  const hudDisplay = summarizeMacContextHudState(options.hudState);
  const compactSurface = objectStatus(options.hudState?.compactSurface) ? options.hudState.compactSurface : {};
  const macContextActivity = firstMacContextHudActivity(options.hudState);
  const degradationState = macContextActivity?.status?.degradationState || macContextActivity?.status?.detail || "";
  const activityState = macContextActivity?.status?.state || "";
  const compactLabel = compactSurface.label || hudDisplay.compactLabel || "";
  const regressionRisks = [];

  if (!experimental.macContextStatusSource) regressionRisks.push("missing macContext status-source kind");
  if (!staleness.stale) regressionRisks.push("Mac Context fixture was not detected as stale");
  if (!hudDisplay.compactIsMacContext || !hudDisplay.displaysMacContext) regressionRisks.push("stale Mac Context must still route into the HUD compact surface");
  if (!macContextActivity) regressionRisks.push("stale Mac Context must remain present in ranked HUD activities");
  if (macContextActivity && !["warning", "error"].includes(activityState)) regressionRisks.push("stale Mac Context HUD activity must use warning or error state");
  if (!compactLabel) regressionRisks.push("stale Mac Context HUD compact surface must include a non-empty label");
  if (!/stale/i.test(degradationState)) regressionRisks.push("stale Mac Context HUD must carry user-visible stale/degraded text");

  return {
    schemaVersion: 1,
    kind: "dynamac.macContext.staleReliabilityComparison",
    experimental,
    hudDisplay,
    staleContext: {
      detected: staleness.stale,
      sampledAt: staleness.sampledAt,
      now: staleness.now,
      ageMs: staleness.ageMs,
      staleAfterMs: staleness.staleAfterMs,
      reason: staleness.reason,
      degradationState,
      activityState,
      activityTask: macContextActivity?.status?.task || "",
      compactLabel
    },
    result: {
      ok: regressionRisks.length === 0,
      handlesStaleMacContext: staleness.stale && ["warning", "error"].includes(activityState),
      validStaleDegradedHudOutput: hudDisplay.compactIsMacContext && hudDisplay.displaysMacContext && Boolean(compactLabel) && /stale/i.test(degradationState),
      regressionRisks
    },
    comparisonAgainstMain: {
      reliability: regressionRisks.length
        ? `stale Mac Context degraded-HUD reliability failed: ${regressionRisks.join("; ")}`
        : "stale Mac Context is detected without crashing and remains visible as degraded HUD output"
    }
  };
}

function comparePartialMacContextHudReliability(payload, options = {}) {
  const experimental = summarizeExperimentalMacContextStatus(payload);
  const hudDisplay = summarizeMacContextHudState(options.hudState);
  const compactSurface = objectStatus(options.hudState?.compactSurface) ? options.hudState.compactSurface : {};
  const macContextActivity = firstMacContextHudActivity(options.hudState);
  const degradation = objectStatus(payload?.result?.degradation) ? payload.result.degradation : {};
  const degradationState = experimental.degradationState || macContextActivity?.status?.degradationState || macContextActivity?.status?.detail || "";
  const activityState = macContextActivity?.status?.state || "";
  const activityTask = macContextActivity?.status?.task || "";
  const compactLabel = compactSurface.label || hudDisplay.compactLabel || "";
  const partialActiveContext = experimental.activeApp.available && !experimental.activeWindow.available;
  const missingFieldsSafelyDegraded = payload?.result?.status === "degraded" && Boolean(degradationState) && degradation.activeContextUnavailable === true;
  const regressionRisks = [];

  if (!experimental.macContextStatusSource) regressionRisks.push("missing macContext status-source kind");
  if (!partialActiveContext) regressionRisks.push("partial Mac Context fixture must preserve active app while degrading missing active window");
  if (!missingFieldsSafelyDegraded) regressionRisks.push("partial Mac Context missing fields must produce degraded status and degradation text");
  if (!hudDisplay.compactIsMacContext || !hudDisplay.displaysMacContext) regressionRisks.push("partial Mac Context must still route into the HUD compact surface");
  if (!macContextActivity) regressionRisks.push("partial Mac Context must remain present in ranked HUD activities");
  if (macContextActivity && !["warning", "error"].includes(activityState)) regressionRisks.push("partial Mac Context HUD activity must use warning or error state");
  if (!activityTask || !/window degraded/i.test(activityTask)) regressionRisks.push("partial Mac Context HUD activity must include safe missing-window task text");
  if (!compactLabel) regressionRisks.push("partial Mac Context HUD compact surface must include a non-empty app label");
  if (!/Front window title unavailable|window/i.test(degradationState)) regressionRisks.push("partial Mac Context HUD must carry user-visible missing-window degradation text");

  return {
    schemaVersion: 1,
    kind: "dynamac.macContext.partialReliabilityComparison",
    experimental,
    hudDisplay,
    partialContext: {
      partialActiveContext,
      activeAppName: experimental.activeApp.name,
      activeWindowAvailable: experimental.activeWindow.available,
      unavailableSources: Array.isArray(degradation.unavailableSources) ? [...degradation.unavailableSources] : [],
      degradationState,
      activityState,
      activityTask,
      compactLabel
    },
    result: {
      ok: regressionRisks.length === 0,
      consumesPartialMacContext: partialActiveContext && Boolean(macContextActivity),
      safelyDegradesMissingFields: missingFieldsSafelyDegraded && ["warning", "error"].includes(activityState),
      validPartialHudOutput: hudDisplay.compactIsMacContext && hudDisplay.displaysMacContext && Boolean(compactLabel) && Boolean(degradationState),
      regressionRisks
    },
    comparisonAgainstMain: {
      reliability: regressionRisks.length
        ? `partial Mac Context degraded-HUD reliability failed: ${regressionRisks.join("; ")}`
        : "partial Mac Context is consumed without crashing and remains visible as safely degraded HUD output"
    }
  };
}

function compareMacContextAgainstMain(payload, options = {}) {
  const mainBaseline = options.mainBaseline || MAIN_BASELINE;
  const experimental = summarizeExperimentalMacContextStatus(payload);
  const hudDisplay = options.hudState === undefined ? null : summarizeMacContextHudState(options.hudState);
  const missingExpectedFields = EXPECTED_EXPERIMENTAL_READ_ONLY_FIELDS.filter((field) => !experimental.readOnlyFields.includes(field));
  const regressionRisks = [];

  if (!experimental.macContextStatusSource) regressionRisks.push("missing macContext status-source kind");
  if (missingExpectedFields.length > 0) regressionRisks.push(`missing read-only fields: ${missingExpectedFields.join(", ")}`);
  if (!experimental.activeApp.available) regressionRisks.push("active app context unavailable");
  if (!experimental.activeWindow.available) regressionRisks.push("active window context unavailable");
  if (!experimental.permissionStatus) regressionRisks.push("permission status unavailable");
  if (!experimental.degradationState) regressionRisks.push("degradation state unavailable");
  if (hudDisplay && !hudDisplay.displaysMacContext) regressionRisks.push("HUD state does not display macContext activity");

  return {
    schemaVersion: 1,
    kind: "dynamac.macContext.comparisonAgainstMain",
    baseline: mainBaseline,
    experimental,
    hudDisplay,
    expectedReadOnlyFields: [...EXPECTED_EXPERIMENTAL_READ_ONLY_FIELDS],
    result: {
      ok: regressionRisks.length === 0,
      reportsNewMacContextContract: experimental.macContextStatusSource && !mainBaseline.macContextStatusSource,
      reportsExpectedReadOnlyFields: missingExpectedFields.length === 0,
      missingExpectedFields,
      activeAppReported: experimental.activeApp.available,
      activeWindowReported: experimental.activeWindow.available,
      permissionsReported: experimental.permissionStatus,
      degradationStateReported: Boolean(experimental.degradationState),
      hudDisplaysMacContext: hudDisplay ? hudDisplay.displaysMacContext : null,
      regressionRisks
    },
    comparisonAgainstMain: {
      capability: "main lacks Mac Context; experimental branch reports read-only active app/window context",
      permissionBurden: "experimental branch reports Accessibility/Screen Recording status without bypassing consent or requiring remote services",
      reliability: "experimental branch uses a deterministic local status-source payload with explicit missing-field failures",
      ux: "experimental branch can surface active context or degradation text in the HUD instead of silently omitting it",
      regressionRisk: regressionRisks.length ? regressionRisks.join("; ") : "contained to experimental Mac Context status-source/HUD contract"
    }
  };
}

module.exports = {
  DEFAULT_MAC_CONTEXT_STALE_AFTER_MS,
  EXPECTED_EXPERIMENTAL_READ_ONLY_FIELDS,
  MAIN_BASELINE,
  buildStaleMacContextHudStatus,
  compareMacContextAgainstMain,
  compareNormalMacContextHudUx,
  comparePartialMacContextHudReliability,
  compareStaleMacContextHudReliability,
  compareUnavailableMacContextHudReliability,
  macContextStaleness,
  summarizeMacContextHudState,
  summarizeExperimentalMacContextStatus
};
