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
  comparePermissionDeniedMacContextHudUx,
  normalizePermissionDeniedHudVisibleCopy
};
