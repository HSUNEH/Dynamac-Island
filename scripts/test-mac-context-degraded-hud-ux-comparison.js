#!/usr/bin/env node

const assert = require("node:assert");
const { buildActivityRouterSnapshot } = require("../src/activity-router");
const { macContextProviderToActivity } = require("../src/mac-context-provider");
const { buildMacContextStatusSource } = require("./mac-context-status");
const {
  compareDegradedMacContextHudUx,
  normalizeDegradedContextHudMapping
} = require("../src/mac-context-permission-denied-ux-comparison");

const payload = buildMacContextStatusSource({
  now: "2026-06-17T03:20:00.000Z",
  activeAppInfo: { name: "Arc", bundleIdentifier: "company.thebrowser.Browser", pid: 4242 },
  activeWindowResult: {
    ok: false,
    stdout: "",
    stderr: "System Events active window query returned no value",
    error: "front window unavailable"
  },
  permissionStatus: {
    accessibility: { status: "unknown", diagnostic: "probe unavailable", available: false },
    screenRecording: { status: "denied", diagnostic: "fixture-screen-recording-denied", available: false }
  },
  uiTreeContext: {
    available: false,
    summary: "Fixture UI tree unavailable while degraded.",
    nodes: []
  }
});

const hudStatus = macContextProviderToActivity(payload);
hudStatus.updatedAt = payload.sampledAt;
const hudState = buildActivityRouterSnapshot([hudStatus], { now: new Date(payload.sampledAt) });
const mapping = normalizeDegradedContextHudMapping(payload, hudState);
const comparison = compareDegradedMacContextHudUx(payload, { hudState });

assert.equal(payload.kind, "dynamac.macContext.statusSource");
assert.equal(payload.result.status, "degraded");
assert.equal(payload.activeApp.name, "Arc");
assert.equal(payload.activeWindow, "");
assert.equal(payload.permissionStatus.accessibility.status, "unknown");
assert.equal(payload.permissionStatus.screenRecording.status, "denied");
assert.match(payload.degradationState, /Front window title unavailable/);
assert.match(payload.degradationState, /Accessibility status unknown/);
assert.match(payload.degradationState, /Screen Recording denied/);

assert.equal(mapping.providerStatus, "degraded");
assert.equal(mapping.hudActivityState, "warning");
assert.equal(mapping.compactActivityType, "macContext");
assert.equal(mapping.presentation, "degradedContext");
assert.equal(mapping.compactTone, "degraded-warning");
assert.equal(mapping.stateSeverity, "warning");
assert.equal(mapping.permissionMode, "unknown/denied");
assert.equal(mapping.activeAppAvailable, true);
assert.equal(mapping.activeWindowAvailable, false);
assert.equal(mapping.activeAppName, "Arc");
assert.deepEqual(mapping.unavailableSources, [
  "activeWindow",
  "accessibilityPermission",
  "screenRecordingPermission",
  "uiTreeContext"
]);
assert.equal(mapping.acquisitionReason, "toolUnavailable");
assert.match(mapping.degradationState, /Screen Recording denied/);
assert.ok(mapping.degradationReasons.length >= 4, "degraded mapping should preserve structured degradation reasons");
assert.deepEqual(mapping.copy, {
  compactGlyph: "macwindow",
  compactLabel: "Arc",
  compactPrefix: "⚠",
  task: "Arc · window degraded",
  detail: payload.degradationState,
  expandedTitle: payload.degradationState,
  nativeCompactText: "⚠ Arc"
});

assert.equal(comparison.schemaVersion, 1);
assert.equal(comparison.kind, "dynamac.macContext.degradedHudUxComparison");
assert.equal(comparison.result.ok, true, comparison.result.regressionRisks.join("; "));
assert.equal(comparison.result.degradedContextVisible, true);
assert.equal(comparison.result.hudVisibleCopyMatchesDegradedState, true);
assert.deepEqual(comparison.result.regressionRisks, []);
assert.equal(comparison.hudDisplay.compactIsMacContext, true);
assert.equal(comparison.hudDisplay.displaysMacContext, true);
assert.equal(comparison.hudVisibleCopy.nativeCompactText, "⚠ Arc");
assert.match(comparison.hudVisibleCopy.task, /window degraded/);
assert.match(comparison.hudVisibleCopy.detail, /Accessibility status unknown/);
assert.match(comparison.hudVisibleCopy.expandedTitle, /Screen Recording denied/);
assert.match(comparison.comparisonAgainstMain.ux, /warning\/error state/);

const normalPayload = buildMacContextStatusSource({
  now: "2026-06-17T03:21:00.000Z",
  activeAppInfo: { name: "Arc", bundleIdentifier: "company.thebrowser.Browser", pid: 4242 },
  activeWindowTitle: "Dynamac Island · normal",
  permissionStatus: {
    accessibility: { status: "granted", diagnostic: "fixture-accessibility-granted", available: true },
    screenRecording: { status: "granted", diagnostic: "fixture-screen-recording-granted", available: true }
  }
});
const normalHudStatus = macContextProviderToActivity(normalPayload);
normalHudStatus.updatedAt = normalPayload.sampledAt;
const normalHudState = buildActivityRouterSnapshot([normalHudStatus], { now: new Date(normalPayload.sampledAt) });
const normalComparison = compareDegradedMacContextHudUx(normalPayload, { hudState: normalHudState });
assert.equal(normalComparison.result.ok, false, "normal success payloads should not satisfy degraded UX mapping");
assert.ok(
  normalComparison.result.regressionRisks.some((risk) => risk.includes("degraded provider status")),
  "normal success rejection should explain the failed provider-state mapping"
);
assert.equal(normalComparison.stateMapping.presentation, "notDisplayed");

console.log("mac-context-degraded-hud-ux-comparison tests passed");
