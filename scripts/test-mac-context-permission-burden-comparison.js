#!/usr/bin/env node

const assert = require("node:assert");
const {
  buildMacContextStatusSource
} = require("./mac-context-status");
const {
  MAIN_PERMISSION_BASELINE,
  REQUIRED_MAC_CONTEXT_PERMISSIONS,
  compareMacContextPermissionBurdenAgainstMain,
  normalizeExperimentalPermissionEntry,
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

const comparison = compareMacContextPermissionBurdenAgainstMain(payload);
assert.equal(comparison.schemaVersion, 1);
assert.equal(comparison.kind, "dynamac.macContext.permissionBurdenComparison");
assert.deepEqual(comparison.baseline, MAIN_PERMISSION_BASELINE);
assert.deepEqual(comparison.requiredPermissions, REQUIRED_MAC_CONTEXT_PERMISSIONS);
assert.equal(comparison.result.ok, true, "permission burden comparison should pass when both branches report the same permission keys and experimental statuses are normalized");
assert.equal(comparison.result.consistentPermissionKeys, true);
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

console.log("mac-context-permission-burden-comparison tests passed");
