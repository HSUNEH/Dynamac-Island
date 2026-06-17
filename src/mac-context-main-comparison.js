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
  EXPECTED_EXPERIMENTAL_READ_ONLY_FIELDS,
  MAIN_BASELINE,
  compareMacContextAgainstMain,
  summarizeMacContextHudState,
  summarizeExperimentalMacContextStatus
};
