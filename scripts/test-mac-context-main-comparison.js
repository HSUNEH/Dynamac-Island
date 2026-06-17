#!/usr/bin/env node

const assert = require("node:assert");
const {
  buildMacContextStatusSource
} = require("./mac-context-status");
const {
  EXPECTED_EXPERIMENTAL_READ_ONLY_FIELDS,
  MAIN_BASELINE,
  compareMacContextAgainstMain,
  summarizeExperimentalMacContextStatus
} = require("../src/mac-context-main-comparison");

const payload = buildMacContextStatusSource({
  now: "2026-06-17T00:00:00.000Z",
  activeAppInfo: { name: "Arc", bundleIdentifier: "company.thebrowser.Browser", pid: 4242 },
  activeWindowTitle: "Dynamac Island · macOS-MCP notes",
  permissionStatus: {
    accessibility: { status: "granted", diagnostic: "fixture" },
    screenRecording: { status: "granted", diagnostic: "fixture" }
  }
});

const summary = summarizeExperimentalMacContextStatus(payload);
assert.equal(summary.branch, "feature/macos-mcp-context-hud");
assert.equal(summary.macContextStatusSource, true, "experimental payload should expose the Mac Context status-source kind");
assert.deepEqual(summary.readOnlyFields, EXPECTED_EXPERIMENTAL_READ_ONLY_FIELDS, "experimental branch should report the expected read-only Mac Context fields");
assert.deepEqual(summary.activeApp, {
  available: true,
  name: "Arc",
  bundleIdentifier: "company.thebrowser.Browser"
}, "active app context should be observable from the comparison summary");
assert.deepEqual(summary.activeWindow, {
  available: true,
  title: "Dynamac Island · macOS-MCP notes"
}, "active window context should be observable from the comparison summary");
assert.deepEqual(summary.permissions, {
  accessibility: "granted",
  screenRecording: "granted"
}, "permission status should be included for comparison against main's missing capability");
assert.equal(summary.uiTreeContext.available, true);
assert.equal(summary.uiTreeContext.nodeCount, 2);
assert.equal(summary.degradationState, "Full read-only active app/window context available.");
assert.equal(summary.statusSource, "scripts/mac-context-status.js");

const comparison = compareMacContextAgainstMain(payload);
assert.equal(comparison.schemaVersion, 1);
assert.equal(comparison.kind, "dynamac.macContext.comparisonAgainstMain");
assert.deepEqual(comparison.baseline, MAIN_BASELINE, "comparison should carry a stable main baseline for this experimental branch");
assert.deepEqual(comparison.expectedReadOnlyFields, EXPECTED_EXPERIMENTAL_READ_ONLY_FIELDS);
assert.equal(comparison.result.ok, true);
assert.equal(comparison.result.reportsNewMacContextContract, true, "experimental branch should add a contract that main does not report");
assert.equal(comparison.result.reportsExpectedReadOnlyFields, true);
assert.deepEqual(comparison.result.missingExpectedFields, []);
assert.equal(comparison.result.activeAppReported, true);
assert.equal(comparison.result.activeWindowReported, true);
assert.equal(comparison.result.permissionsReported, true);
assert.equal(comparison.result.degradationStateReported, true);
assert.deepEqual(comparison.result.regressionRisks, []);
assert.match(comparison.comparisonAgainstMain.capability, /main lacks Mac Context/);
assert.match(comparison.comparisonAgainstMain.permissionBurden, /without bypassing consent/);
assert.match(comparison.comparisonAgainstMain.reliability, /deterministic local status-source/);
assert.match(comparison.comparisonAgainstMain.ux, /HUD/);
assert.match(comparison.comparisonAgainstMain.regressionRisk, /contained/);

const missingWindowComparison = compareMacContextAgainstMain({
  ...payload,
  activeWindow: ""
});
assert.equal(missingWindowComparison.result.ok, false, "comparison test should fail if the experimental branch stops reporting activeWindow");
assert.deepEqual(missingWindowComparison.result.regressionRisks, ["active window context unavailable"]);

console.log("mac-context-main-comparison tests passed");
