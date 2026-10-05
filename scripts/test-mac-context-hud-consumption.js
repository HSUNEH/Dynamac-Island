#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const { buildActivityRouterSnapshot, normalizeActivity } = require("../src/activity-router");
const { macContextProviderToActivity } = require("../src/mac-context-provider");

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function assertNoUnsupportedWrites(callback) {
  const writeMethods = ["appendFileSync", "mkdirSync", "renameSync", "rmSync", "unlinkSync", "writeFileSync"];
  const originals = new Map(writeMethods.map((method) => [method, fs[method]]));
  const attemptedWrites = [];

  for (const method of writeMethods) {
    fs[method] = (...args) => {
      attemptedWrites.push({ method, path: args[0] });
      throw new Error(`HUD consumption attempted unsupported write behavior via fs.${method}`);
    };
  }

  try {
    return callback();
  } finally {
    for (const [method, original] of originals) fs[method] = original;
    assert.deepEqual(attemptedWrites, [], "HUD consumption should be read-only and must not invoke fs write behavior");
  }
}

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
const frozenSourceStatus = deepFreeze(sourceStatus);
const sourceStatusBeforeConsumption = cloneJson(frozenSourceStatus);

const { directActivity, snapshot } = assertNoUnsupportedWrites(() => ({
  directActivity: normalizeActivity(frozenSourceStatus, 0, { now }),
  snapshot: buildActivityRouterSnapshot([frozenSourceStatus], { now })
}));
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

const routedActivity = snapshot.rankedActivities[0];
assert.equal(snapshot.compactSurface.activityType, "macContext", "Activity Router should expose Mac Context as the compact HUD activity");
assert.equal(snapshot.compactSurface.activityId, frozenSourceStatus.activityId, "Activity Router compact state should keep the source activity id binding");
assert.equal(snapshot.compactSurface.label, "Arc", "Activity Router compact HUD label should keep the active app unchanged");
assert.deepEqual(routedActivity.status.permissionStatus, permissionStatus, "routed HUD activity should preserve permission status exactly");
assert.equal(routedActivity.status.degradationState, degradationState, "routed HUD activity should preserve degradationState exactly");
assert.equal(routedActivity.status.statusSource, statusSource, "routed HUD activity should preserve statusSource exactly");
assert.deepEqual(routedActivity.metadata.permissionStatus, permissionStatus, "routed HUD metadata should preserve permission status exactly");
assert.equal(routedActivity.metadata.degradationState, degradationState, "routed HUD metadata should preserve degradationState exactly");
assert.equal(routedActivity.expandedSurface.title, degradationState, "routed expanded HUD state should preserve exact degradation text");
assert.deepEqual(cloneJson(frozenSourceStatus), sourceStatusBeforeConsumption, "HUD consumption should not mutate the Mac Context source status object");

console.log("mac-context HUD consumption mapping tests passed");
