#!/usr/bin/env node

const assert = require("node:assert");
const { buildActivityRouterSnapshot, normalizeActivity } = require("../src/activity-router");
const { macContextProviderToActivity } = require("../src/mac-context-provider");

const now = new Date("2026-06-17T01:23:45.000Z");
const permissionStatus = {
  accessibility: {
    status: "denied",
    diagnostic: "fixture accessibility denied; do not rewrite this diagnostic",
    available: false
  },
  screenRecording: {
    status: "unknown",
    diagnostic: "fixture screen recording probe unavailable; preserve punctuation: A/B? yes.",
    available: false
  }
};
const uiTreeContext = {
  available: false,
  summary: "fixture UI tree unavailable because Accessibility is denied",
  nodes: []
};
const degradationState = "Accessibility denied; keep exact HUD degradation text. Screen Recording unknown; keep exact source wording.";
const statusSource = "scripts/mac-context-status.js --fixture fixtures/mac-context-degraded-status.json";

const sourceStatus = macContextProviderToActivity({
  activeApp: {
    name: "Arc",
    bundleIdentifier: "company.thebrowser.Browser",
    pid: 4242
  },
  activeWindow: "",
  uiTreeContext,
  permissionStatus,
  degradationState,
  statusSource
});

sourceStatus.updatedAt = now.toISOString();

const directActivity = normalizeActivity(sourceStatus, 0, { now });
assert.equal(directActivity.activityType, "macContext", "Mac Context source status should normalize into the HUD macContext activity type");
assert.deepEqual(directActivity.status.permissionStatus, permissionStatus, "HUD status should preserve permission status exactly from source output");
assert.equal(directActivity.status.degradationState, degradationState, "HUD status should preserve degradationState exactly from source output");
assert.deepEqual(directActivity.status.uiTreeContext, uiTreeContext, "HUD status should preserve UI tree degradation context exactly from source output");
assert.equal(directActivity.status.statusSource, statusSource, "HUD status should preserve the local status source exactly");
assert.deepEqual(directActivity.metadata.permissionStatus, permissionStatus, "HUD metadata should preserve permission status exactly from source output");
assert.equal(directActivity.metadata.degradationState, degradationState, "HUD metadata should preserve degradation text exactly from source output");
assert.equal(directActivity.metadata.statusSource, statusSource, "HUD metadata should preserve status source exactly from source output");
assert.equal(directActivity.compactSurface.label, "Arc", "compact Dynamic Island state should display the active app label from source output");
assert.equal(directActivity.expandedSurface.title, degradationState, "expanded Dynamic Island state should display the unchanged degradation text when window context is degraded");

const snapshot = buildActivityRouterSnapshot([sourceStatus], { now });
const routedActivity = snapshot.rankedActivities[0];
assert.equal(snapshot.compactSurface.activityType, "macContext", "Activity Router should expose Mac Context as the compact HUD activity");
assert.equal(snapshot.compactSurface.activityId, sourceStatus.activityId, "Activity Router compact state should keep the source activity id binding");
assert.equal(snapshot.compactSurface.label, "Arc", "Activity Router compact HUD label should keep the active app unchanged");
assert.deepEqual(routedActivity.status.permissionStatus, permissionStatus, "routed HUD activity should preserve permission status exactly");
assert.equal(routedActivity.status.degradationState, degradationState, "routed HUD activity should preserve degradationState exactly");
assert.equal(routedActivity.status.statusSource, statusSource, "routed HUD activity should preserve statusSource exactly");
assert.deepEqual(routedActivity.metadata.permissionStatus, permissionStatus, "routed HUD metadata should preserve permission status exactly");
assert.equal(routedActivity.metadata.degradationState, degradationState, "routed HUD metadata should preserve degradationState exactly");
assert.equal(routedActivity.expandedSurface.title, degradationState, "routed expanded HUD state should preserve exact degradation text");

console.log("mac-context HUD consumption mapping tests passed");
