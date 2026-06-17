const { macContextProviderToActivity } = require("./mac-context-provider");
const {
  summarizeExperimentalMacContextStatus,
  summarizeMacContextHudState
} = require("./mac-context-main-comparison");

function objectStatus(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function firstMacContextHudActivity(hudState) {
  const rankedActivities = Array.isArray(hudState?.rankedActivities) ? hudState.rankedActivities : [];
  return rankedActivities.find((activity) => activity?.activityType === "macContext") || null;
}

function normalizePermissionDeniedHudVisibleCopy(payload, hudState) {
  const fallbackStatus = macContextProviderToActivity(payload);
  const macContextActivity = firstMacContextHudActivity(hudState) || fallbackStatus;
  const compactSurface = objectStatus(hudState?.compactSurface)
    ? hudState.compactSurface
    : (macContextActivity.macContext?.compactSurface || fallbackStatus.macContext.compactSurface || {});
  const expandedSurface = macContextActivity.macContext?.expandedSurface || fallbackStatus.macContext.expandedSurface || {};

  return {
    compactLabel: compactSurface.label || fallbackStatus.macContext.compactSurface.label || "",
    compactGlyph: compactSurface.glyph || fallbackStatus.macContext.compactSurface.glyph || "",
    task: macContextActivity.status?.task || macContextActivity.task || fallbackStatus.task || "",
    detail: macContextActivity.status?.detail || macContextActivity.detail || fallbackStatus.detail || "",
    expandedTitle: expandedSurface.title || fallbackStatus.macContext.expandedSurface.title || ""
  };
}

function normalizeDegradedContextHudMapping(payload, hudState) {
  const experimental = summarizeExperimentalMacContextStatus(payload);
  const hudDisplay = summarizeMacContextHudState(hudState);
  const fallbackStatus = macContextProviderToActivity(payload);
  const macContextActivity = firstMacContextHudActivity(hudState) || fallbackStatus;
  const hudVisibleCopy = normalizePermissionDeniedHudVisibleCopy(payload, hudState);
  const providerStatus = payload?.result?.status || "";
  const hudActivityState = macContextActivity?.status?.state || fallbackStatus.state || "";
  const degradationState = experimental.degradationState || macContextActivity?.status?.degradationState || hudVisibleCopy.detail || "";
  const degradationReasons = Array.isArray(payload?.result?.degradation?.reasons)
    ? [...payload.result.degradation.reasons]
    : (degradationState ? degradationState.split("; ").filter(Boolean) : []);
  const unavailableSources = Array.isArray(payload?.result?.degradation?.unavailableSources)
    ? [...payload.result.degradation.unavailableSources]
    : [];
  const activeAppName = experimental.activeApp.name || fallbackStatus.activeApp || "Mac Context";
  const stateSeverity = hudActivityState === "error" || !experimental.activeApp.available ? "error" : "warning";
  const warningPrefix = "⚠";

  return {
    providerStatus,
    hudActivityState,
    compactActivityType: hudDisplay.compactActivityType,
    presentation: providerStatus === "degraded" && hudDisplay.compactIsMacContext ? "degradedContext" : "notDisplayed",
    compactTone: stateSeverity === "error" ? "degraded-error" : "degraded-warning",
    stateSeverity,
    permissionMode: `${experimental.permissions.accessibility}/${experimental.permissions.screenRecording}`,
    activeAppAvailable: experimental.activeApp.available,
    activeWindowAvailable: experimental.activeWindow.available,
    activeAppName,
    unavailableSources,
    acquisitionReason: payload?.acquisitionStatus?.activeWindow?.reason || "",
    degradationState,
    degradationReasons,
    copy: {
      compactGlyph: hudVisibleCopy.compactGlyph,
      compactLabel: hudVisibleCopy.compactLabel || activeAppName,
      compactPrefix: warningPrefix,
      task: hudVisibleCopy.task,
      detail: hudVisibleCopy.detail || degradationState,
      expandedTitle: hudVisibleCopy.expandedTitle || degradationState,
      nativeCompactText: `${warningPrefix} ${hudVisibleCopy.compactLabel || activeAppName}`.trim()
    }
  };
}

function compareDegradedMacContextHudUx(payload, options = {}) {
  const experimental = summarizeExperimentalMacContextStatus(payload);
  const hudDisplay = summarizeMacContextHudState(options.hudState);
  const mapping = normalizeDegradedContextHudMapping(payload, options.hudState);
  const regressionRisks = [];

  if (!experimental.macContextStatusSource) regressionRisks.push("missing macContext status-source kind");
  if (mapping.providerStatus !== "degraded") regressionRisks.push("degraded UX mapping requires a degraded provider status");
  if (!hudDisplay.compactIsMacContext || !hudDisplay.displaysMacContext) regressionRisks.push("degraded context must be visible in the HUD compact surface");
  if (!firstMacContextHudActivity(options.hudState)) regressionRisks.push("degraded context must remain present in ranked HUD activities");
  if (!mapping.copy.compactLabel) regressionRisks.push("degraded context compact copy must keep a non-empty readable label");
  if (!mapping.copy.compactGlyph) regressionRisks.push("degraded context compact copy must keep a visible glyph");
  if (!mapping.copy.nativeCompactText.startsWith("⚠ ")) regressionRisks.push("degraded context native compact copy must be visibly warning-prefixed");
  if (!["warning", "error"].includes(mapping.hudActivityState)) regressionRisks.push("degraded context must map to warning/error HUD state");
  if (!/degraded|unavailable|denied|unknown|stale|permission/i.test(mapping.copy.task)) regressionRisks.push("degraded context task copy must indicate reduced capability");
  if (!mapping.degradationState || !/degraded|unavailable|denied|unknown|stale|permission/i.test(mapping.degradationState)) regressionRisks.push("degraded context detail must expose user-visible degradation text");
  if (!mapping.copy.expandedTitle || !/degraded|unavailable|denied|unknown|stale|permission/i.test(mapping.copy.expandedTitle)) regressionRisks.push("degraded context expanded copy must preserve degradation text");

  return {
    schemaVersion: 1,
    kind: "dynamac.macContext.degradedHudUxComparison",
    experimental,
    hudDisplay,
    hudVisibleCopy: mapping.copy,
    stateMapping: mapping,
    result: {
      ok: regressionRisks.length === 0,
      degradedContextVisible: mapping.providerStatus === "degraded" && hudDisplay.compactIsMacContext && hudDisplay.displaysMacContext,
      hudVisibleCopyMatchesDegradedState: Boolean(mapping.copy.compactLabel)
        && ["warning", "error"].includes(mapping.hudActivityState)
        && Boolean(mapping.degradationState)
        && mapping.copy.nativeCompactText.startsWith("⚠ "),
      regressionRisks
    },
    comparisonAgainstMain: {
      ux: regressionRisks.length
        ? `degraded Mac Context HUD UX mapping failed: ${regressionRisks.join("; ")}`
        : "degraded Mac Context maps warning/error state to HUD-visible app/context copy plus degradation guidance"
    }
  };
}

function comparePermissionDeniedMacContextHudUx(payload, options = {}) {
  const experimental = summarizeExperimentalMacContextStatus(payload);
  const hudDisplay = summarizeMacContextHudState(options.hudState);
  const macContextActivity = firstMacContextHudActivity(options.hudState);
  const fallbackStatus = macContextProviderToActivity(payload);
  const hudVisibleCopy = normalizePermissionDeniedHudVisibleCopy(payload, options.hudState);
  const accessibilityDenied = experimental.permissions.accessibility === "denied";
  const acquisitionDenied = payload?.acquisitionStatus?.activeWindow?.reason === "permissionDenied";
  const providerStatus = payload?.result?.status || "";
  const hudActivityState = macContextActivity?.status?.state || fallbackStatus.state || "";
  const permissionDeniedContext = providerStatus === "degraded"
    && accessibilityDenied
    && acquisitionDenied
    && experimental.activeApp.available
    && !experimental.activeWindow.available;
  const regressionRisks = [];

  if (!experimental.macContextStatusSource) regressionRisks.push("missing macContext status-source kind");
  if (!permissionDeniedContext) regressionRisks.push("permission-denied context must preserve active app while degrading active window/UI tree");
  if (!hudDisplay.compactIsMacContext || !hudDisplay.displaysMacContext) regressionRisks.push("permission-denied context must route into the HUD compact surface");
  if (!macContextActivity) regressionRisks.push("permission-denied context must remain present in ranked HUD activities");
  if (!hudVisibleCopy.compactLabel || hudVisibleCopy.compactLabel !== experimental.activeApp.name) regressionRisks.push("permission-denied compact copy must keep the readable active app name");
  if (!hudVisibleCopy.compactGlyph) regressionRisks.push("permission-denied compact copy must keep a visible glyph");
  if (hudActivityState !== "warning") regressionRisks.push("permission-denied active-app context must map to warning HUD state, not running/error");
  if (!/window degraded/i.test(hudVisibleCopy.task)) regressionRisks.push("permission-denied task copy must explicitly show window degradation");
  if (!/Accessibility denied/i.test(hudVisibleCopy.detail)) regressionRisks.push("permission-denied detail copy must explain Accessibility denial");
  if (!/permission denied/i.test(hudVisibleCopy.detail)) regressionRisks.push("permission-denied detail copy must preserve acquisition denial diagnostics");
  if (!/Accessibility denied|permission denied/i.test(hudVisibleCopy.expandedTitle)) regressionRisks.push("permission-denied expanded copy must expose degradation text rather than a blank window title");

  return {
    schemaVersion: 1,
    kind: "dynamac.macContext.permissionDeniedHudUxComparison",
    experimental,
    hudDisplay,
    hudVisibleCopy,
    stateMapping: {
      providerStatus,
      hudActivityState,
      compactActivityType: hudDisplay.compactActivityType,
      presentation: permissionDeniedContext && hudDisplay.compactIsMacContext ? "permissionDeniedContext" : "notDisplayed",
      permissionMode: `${experimental.permissions.accessibility}/${experimental.permissions.screenRecording}`,
      activeAppAvailable: experimental.activeApp.available,
      activeWindowAvailable: experimental.activeWindow.available,
      acquisitionReason: payload?.acquisitionStatus?.activeWindow?.reason || ""
    },
    result: {
      ok: regressionRisks.length === 0,
      permissionDeniedContext,
      hudVisibleCopyMatchesPermissionDeniedState: hudVisibleCopy.compactLabel === experimental.activeApp.name
        && /window degraded/i.test(hudVisibleCopy.task)
        && /Accessibility denied/i.test(hudVisibleCopy.detail)
        && /permission denied/i.test(hudVisibleCopy.detail),
      regressionRisks
    },
    comparisonAgainstMain: {
      ux: regressionRisks.length
        ? `permission-denied Mac Context HUD UX mapping failed: ${regressionRisks.join("; ")}`
        : "permission-denied Mac Context maps degraded/warning state to HUD-visible active-app copy plus permission guidance"
    }
  };
}

module.exports = {
  compareDegradedMacContextHudUx,
  comparePermissionDeniedMacContextHudUx,
  normalizeDegradedContextHudMapping,
  normalizePermissionDeniedHudVisibleCopy
};
