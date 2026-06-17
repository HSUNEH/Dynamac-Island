#!/usr/bin/env node

const assert = require("node:assert");
const {
  buildMacContextStatusSource
} = require("./mac-context-status");
const {
  MAIN_PERMISSION_BASELINE,
  REQUIRED_MAC_CONTEXT_PERMISSIONS,
  compareDegradationStateReporting,
  compareMacContextPermissionBurdenAgainstMain,
  normalizeExperimentalDegradationState,
  normalizeExperimentalPermissionEntry,
  normalizeMainDegradationState,
  normalizeMainPermissionEntry,
  summarizePermissionBurden
} = require("../src/mac-context-permission-burden-comparison");

const payload = buildMacContextStatusSource({
  now: "2026-06-17T00:00:00.000Z",
  activeAppInfo: { name: "Arc", bundleIdentifier: "company.thebrowser.Browser", pid: 4242 },
  activeWindowTitle: "Dynamac Island · macOS-MCP notes",
  permissionStatus: {
    accessibility: { status: "denied", diagnostic: "fixture-accessibility-denied" },
    screenRecording: { status: "unknown", diagnostic: "fixture-screen-recording-probe-unavailable" }
  }
});

assert.deepEqual(REQUIRED_MAC_CONTEXT_PERMISSIONS, ["accessibility", "screenRecording"]);
assert.deepEqual(normalizeMainPermissionEntry("accessibility"), {
  name: "accessibility",
  status: "notRequired",
  available: true,
  requiredForMacContext: false,
  diagnostic: "main has no Mac Context HUD integration or UI-tree/window-title contract"
});
assert.deepEqual(normalizeExperimentalPermissionEntry("accessibility", payload), {
  name: "accessibility",
  status: "denied",
  available: false,
  requiredForMacContext: true,
  diagnostic: "fixture-accessibility-denied"
});
assert.deepEqual(normalizeExperimentalPermissionEntry("screenRecording", payload), {
  name: "screenRecording",
  status: "unknown",
  available: false,
  requiredForMacContext: false,
  diagnostic: "fixture-screen-recording-probe-unavailable"
});

const summary = summarizePermissionBurden(payload);
assert.deepEqual(summary.requiredPermissions, REQUIRED_MAC_CONTEXT_PERMISSIONS);
assert.deepEqual(summary.main.map((entry) => entry.name), REQUIRED_MAC_CONTEXT_PERMISSIONS, "main baseline and experimental branch should use the same permission keys for comparison");
assert.deepEqual(summary.experimental.map((entry) => entry.name), REQUIRED_MAC_CONTEXT_PERMISSIONS, "experimental branch should report all required macOS permission statuses");
assert.equal(summary.main.every((entry) => entry.status === "notRequired"), true, "main should preserve zero Mac Context-specific permission burden");
assert.equal(summary.experimental.find((entry) => entry.name === "accessibility").status, "denied");
assert.equal(summary.experimental.find((entry) => entry.name === "screenRecording").status, "unknown");

const mainDegradation = normalizeMainDegradationState();
assert.deepEqual(mainDegradation, {
  branch: "main",
  reported: true,
  degraded: false,
  state: "No Mac Context degradation state on main; feature is not present.",
  reasons: [],
  diagnostic: "main has no Mac Context status source, so there is no active app/window degradation to surface"
});

const experimentalDegradation = normalizeExperimentalDegradationState(payload);
assert.equal(experimentalDegradation.reported, true, "experimental branch should report structured degradation state");
assert.equal(experimentalDegradation.degraded, true, "fixture should be degraded when Accessibility/Screen Recording are unavailable");
assert.equal(experimentalDegradation.state, payload.degradationState, "top-level degradationState should match normalized degradation state");
assert.deepEqual(experimentalDegradation.reasons, payload.result.degradation.reasons, "structured degradation reasons should be preserved for branch comparison");
assert.match(experimentalDegradation.state, /Accessibility denied/);
assert.match(experimentalDegradation.state, /Screen Recording status unknown/);

const degradationComparison = compareDegradationStateReporting(payload);
assert.equal(degradationComparison.result.ok, true);
assert.equal(degradationComparison.result.consistentDegradationStateReporting, true, "main baseline and experimental branch should both expose comparable degradation state summaries");
assert.equal(degradationComparison.main.degraded, false);
assert.equal(degradationComparison.experimental.degraded, true);
assert.deepEqual(degradationComparison.result.regressionRisks, []);

const comparison = compareMacContextPermissionBurdenAgainstMain(payload);
assert.equal(comparison.schemaVersion, 1);
assert.equal(comparison.kind, "dynamac.macContext.permissionBurdenComparison");
assert.deepEqual(comparison.baseline, MAIN_PERMISSION_BASELINE);
assert.deepEqual(comparison.requiredPermissions, REQUIRED_MAC_CONTEXT_PERMISSIONS);
assert.deepEqual(comparison.degradationStates.main, mainDegradation);
assert.deepEqual(comparison.degradationStates.experimental, experimentalDegradation);
assert.equal(comparison.result.ok, true, "permission burden comparison should pass when both branches report the same permission keys and experimental statuses are normalized");
assert.equal(comparison.result.consistentPermissionKeys, true);
assert.equal(comparison.result.consistentDegradationStateReporting, true);
assert.equal(comparison.result.reportsAccessibility, true);
assert.equal(comparison.result.reportsScreenRecording, true);
assert.equal(comparison.result.mainMacContextPermissionBurden, "none");
assert.match(comparison.result.experimentalMacContextPermissionBurden, /Screen Recording is reported but not required/);
assert.deepEqual(comparison.result.invalidExperimentalStatuses, []);
assert.deepEqual(comparison.result.regressionRisks, []);

const missingExperimentalPermissions = compareMacContextPermissionBurdenAgainstMain({
  ...payload,
  permissionStatus: {
    accessibility: payload.permissionStatus.accessibility
  }
});
assert.equal(missingExperimentalPermissions.result.ok, false, "missing Screen Recording status should fail the runnable permission burden contract");
assert.deepEqual(missingExperimentalPermissions.result.invalidExperimentalStatuses, [
  { name: "screenRecording", status: "missing" }
]);
assert.deepEqual(missingExperimentalPermissions.result.regressionRisks, [
  "experimental permission reports missing/invalid: screenRecording"
]);

const invalidStatus = compareMacContextPermissionBurdenAgainstMain({
  ...payload,
  permissionStatus: {
    accessibility: { status: "authorized", diagnostic: "non-contract value" },
    screenRecording: payload.permissionStatus.screenRecording
  }
});
assert.equal(invalidStatus.result.ok, false, "non-normalized permission status values should fail comparison");
assert.deepEqual(invalidStatus.result.invalidExperimentalStatuses, [
  { name: "accessibility", status: "authorized" }
]);
assert.deepEqual(invalidStatus.result.regressionRisks, [
  "experimental permission reports missing/invalid: accessibility"
]);

const missingDegradationState = compareMacContextPermissionBurdenAgainstMain({
  ...payload,
  degradationState: "",
  result: {
    ...payload.result,
    degradation: {
      ...payload.result.degradation,
      state: "",
      reasons: []
    }
  }
});
assert.equal(missingDegradationState.result.ok, false, "missing degradation state should fail the permission-burden/degradation comparison contract");
assert.equal(missingDegradationState.result.consistentDegradationStateReporting, false);
assert.deepEqual(missingDegradationState.result.regressionRisks, [
  "experimental degradation state report missing/invalid",
  "experimental degradationState must match result.degradation.state",
  "experimental degraded payload must include degradation reasons"
]);

const mismatchedDegradationState = compareMacContextPermissionBurdenAgainstMain({
  ...payload,
  degradationState: `${payload.degradationState} stale suffix`
});
assert.equal(mismatchedDegradationState.result.ok, false, "top-level and structured degradation states must stay consistent");
assert.equal(mismatchedDegradationState.result.consistentDegradationStateReporting, false);
assert.deepEqual(mismatchedDegradationState.result.regressionRisks, [
  "experimental degradationState must match result.degradation.state"
]);

const missingDegradationReasons = compareMacContextPermissionBurdenAgainstMain({
  ...payload,
  result: {
    ...payload.result,
    degradation: {
      ...payload.result.degradation,
      reasons: []
    }
  }
});
assert.equal(missingDegradationReasons.result.ok, false, "degraded payloads must carry user-visible reasons");
assert.deepEqual(missingDegradationReasons.result.regressionRisks, [
  "experimental degraded payload must include degradation reasons"
]);

console.log("mac-context-permission-burden-comparison tests passed");
