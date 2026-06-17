#!/usr/bin/env node

const assert = require("node:assert");
const { buildActivityRouterSnapshot } = require("../src/activity-router");
const { macContextProviderToActivity } = require("../src/mac-context-provider");
const { buildMacContextStatusSource } = require("./mac-context-status");
const { compareNormalMacContextHudUx } = require("../src/mac-context-main-comparison");

const payload = buildMacContextStatusSource({
  now: "2026-06-17T03:00:00.000Z",
  activeAppInfo: { name: "Arc", bundleIdentifier: "company.thebrowser.Browser", pid: 4242 },
  activeWindowTitle: "Dynamac Island · Experimental Mac Context",
  permissionStatus: {
    accessibility: { status: "granted", diagnostic: "fixture" },
    screenRecording: { status: "granted", diagnostic: "fixture" }
  }
});

const hudStatus = macContextProviderToActivity(payload);
hudStatus.updatedAt = payload.sampledAt;
const hudState = buildActivityRouterSnapshot([hudStatus], { now: new Date(payload.sampledAt) });
const comparison = compareNormalMacContextHudUx(payload, { hudState });

assert.equal(comparison.schemaVersion, 1);
assert.equal(comparison.kind, "dynamac.macContext.normalHudUxComparison");
assert.equal(comparison.result.ok, true, comparison.result.regressionRisks.join("; "));
assert.equal(comparison.result.normalActiveContext, true, "normal active context should map success payloads to running HUD state");
assert.equal(comparison.result.hudVisibleCopyMatchesActiveContext, true, "HUD-visible copy should include the active app/window context");
assert.deepEqual(comparison.result.regressionRisks, []);

assert.deepEqual(comparison.stateMapping, {
  providerStatus: "success",
  hudActivityState: "running",
  compactActivityType: "macContext",
  presentation: "normalActiveContext",
  permissionMode: "granted/granted"
});

assert.equal(comparison.hudVisibleCopy.compactLabel, "Arc");
assert.equal(comparison.hudVisibleCopy.compactGlyph, "macwindow");
assert.match(comparison.hudVisibleCopy.task, /Arc/);
assert.match(comparison.hudVisibleCopy.task, /Dynamac Island · Experimental Mac Context/);
assert.equal(comparison.hudVisibleCopy.detail, "Full read-only active app/window context available.");
assert.equal(comparison.hudVisibleCopy.expandedTitle, "Arc · Dynamac Island · Experimental Mac Context");
assert.equal(comparison.hudDisplay.compactIsMacContext, true);
assert.equal(comparison.hudDisplay.displaysMacContext, true);
assert.match(comparison.comparisonAgainstMain.ux, /success\/running state/);

const brokenPayload = {
  ...payload,
  activeWindow: ""
};
const brokenHudStatus = macContextProviderToActivity(brokenPayload);
brokenHudStatus.updatedAt = brokenPayload.sampledAt;
const brokenHudState = buildActivityRouterSnapshot([brokenHudStatus], { now: new Date(brokenPayload.sampledAt) });
const brokenComparison = compareNormalMacContextHudUx(brokenPayload, { hudState: brokenHudState });
assert.equal(brokenComparison.result.ok, false, "test should catch regressions that stop showing normal active-window copy");
assert.ok(
  brokenComparison.result.regressionRisks.some((risk) => risk.includes("normal active context")),
  "broken normal state should explain the failed state mapping"
);

console.log("mac-context-normal-hud-ux-comparison tests passed");
