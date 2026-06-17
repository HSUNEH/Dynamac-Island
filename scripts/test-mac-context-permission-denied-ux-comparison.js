#!/usr/bin/env node

const assert = require("node:assert");
const { buildActivityRouterSnapshot } = require("../src/activity-router");
const { macContextProviderToActivity } = require("../src/mac-context-provider");
const { buildMacContextStatusSource } = require("./mac-context-status");
const {
  comparePermissionDeniedMacContextHudUx,
  normalizePermissionDeniedHudVisibleCopy
} = require("../src/mac-context-permission-denied-ux-comparison");

const payload = buildMacContextStatusSource({
  now: "2026-06-17T03:10:00.000Z",
  activeAppInfo: { name: "Arc", bundleIdentifier: "company.thebrowser.Browser", pid: 4242 },
  activeWindowResult: {
    ok: false,
    stdout: "",
    stderr: "Operation not permitted: Accessibility permission is required",
    error: "permission denied by macOS TCC"
  },
  permissionStatus: {
    accessibility: { status: "denied", diagnostic: "fixture-accessibility-denied", available: false },
    screenRecording: { status: "granted", diagnostic: "fixture-screen-recording-granted", available: true }
  }
});

const hudStatus = macContextProviderToActivity(payload);
hudStatus.updatedAt = payload.sampledAt;
const hudState = buildActivityRouterSnapshot([hudStatus], { now: new Date(payload.sampledAt) });
const visibleCopy = normalizePermissionDeniedHudVisibleCopy(payload, hudState);
const comparison = comparePermissionDeniedMacContextHudUx(payload, { hudState });

assert.equal(payload.result.status, "degraded");
assert.equal(payload.activeApp.name, "Arc");
assert.equal(payload.activeWindow, "");
assert.equal(payload.permissionStatus.accessibility.status, "denied");
assert.equal(payload.acquisitionStatus.activeWindow.reason, "permissionDenied");
assert.match(payload.degradationState, /Accessibility denied/);
assert.match(payload.degradationState, /Active window acquisition permission denied/);

assert.equal(visibleCopy.compactLabel, "Arc");
assert.equal(visibleCopy.compactGlyph, "macwindow");
assert.equal(visibleCopy.task, "Arc · window degraded");
assert.match(visibleCopy.detail, /Accessibility denied/);
assert.match(visibleCopy.detail, /permission denied/);
assert.match(visibleCopy.expandedTitle, /Accessibility denied/);

assert.equal(comparison.schemaVersion, 1);
assert.equal(comparison.kind, "dynamac.macContext.permissionDeniedHudUxComparison");
assert.equal(comparison.result.ok, true, comparison.result.regressionRisks.join("; "));
assert.equal(comparison.result.permissionDeniedContext, true);
assert.equal(comparison.result.hudVisibleCopyMatchesPermissionDeniedState, true);
assert.deepEqual(comparison.result.regressionRisks, []);
assert.deepEqual(comparison.stateMapping, {
  providerStatus: "degraded",
  hudActivityState: "warning",
  compactActivityType: "macContext",
  presentation: "permissionDeniedContext",
  permissionMode: "denied/granted",
  activeAppAvailable: true,
  activeWindowAvailable: false,
  acquisitionReason: "permissionDenied"
});
assert.equal(comparison.hudDisplay.compactIsMacContext, true);
assert.equal(comparison.hudDisplay.displaysMacContext, true);
assert.match(comparison.comparisonAgainstMain.ux, /permission-denied Mac Context maps degraded\/warning state/);

const brokenPayload = buildMacContextStatusSource({
  now: "2026-06-17T03:11:00.000Z",
  activeAppInfo: { name: "Arc", bundleIdentifier: "company.thebrowser.Browser", pid: 4242 },
  activeWindowTitle: "Dynamac Island · should be normal",
  permissionStatus: {
    accessibility: { status: "granted", diagnostic: "fixture-accessibility-granted", available: true },
    screenRecording: { status: "granted", diagnostic: "fixture-screen-recording-granted", available: true }
  }
});
const brokenHudStatus = macContextProviderToActivity(brokenPayload);
brokenHudStatus.updatedAt = brokenPayload.sampledAt;
const brokenHudState = buildActivityRouterSnapshot([brokenHudStatus], { now: new Date(brokenPayload.sampledAt) });
const brokenComparison = comparePermissionDeniedMacContextHudUx(brokenPayload, { hudState: brokenHudState });
assert.equal(brokenComparison.result.ok, false, "test should reject non-denied contexts as permission-denied UX mappings");
assert.ok(
  brokenComparison.result.regressionRisks.some((risk) => risk.includes("permission-denied context")),
  "broken comparison should explain the missing permission-denied state"
);
assert.equal(brokenComparison.stateMapping.presentation, "notDisplayed");

console.log("mac-context-permission-denied-ux-comparison tests passed");
