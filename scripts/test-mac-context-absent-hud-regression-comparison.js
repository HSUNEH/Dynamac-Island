#!/usr/bin/env node

const assert = require("node:assert");
const { createClipboardActivityState } = require("../src/clipboard-activity");
const {
  buildMacActivityStatusPayload,
  collectMacContextStatus
} = require("../src/mac-activity-status");
const {
  compareAbsentMacContextHudRegression
} = require("../src/mac-context-main-comparison");

const now = new Date("2026-06-17T03:00:00.000Z");
const sharedNonContextOptions = {
  now,
  mediaInfo: {
    source: "spotify",
    title: "Regression Song",
    artist: "Dynamac Tests",
    album: "Absent Mac Context",
    durationSeconds: 180,
    positionSeconds: 42,
    playbackState: "playing"
  },
  clipboardText: "https://example.com/regression",
  pmsetOutput: "Now drawing from 'AC Power'\n -InternalBattery-0\t82%; charging; 0:35 remaining present: true"
};

function buildMainLikePayloadWithNoMacContext() {
  return buildMacActivityStatusPayload({
    ...sharedNonContextOptions,
    enableMacContext: false,
    clipboardActivityState: createClipboardActivityState()
  });
}

function buildExperimentalPayloadWithAbsentMacContextData() {
  return buildMacActivityStatusPayload({
    ...sharedNonContextOptions,
    macContextStatus: null,
    clipboardActivityState: createClipboardActivityState()
  });
}

const mainLikePayload = buildMainLikePayloadWithNoMacContext();
const experimentalAbsentPayload = buildExperimentalPayloadWithAbsentMacContextData();
const comparison = compareAbsentMacContextHudRegression(mainLikePayload, experimentalAbsentPayload);

assert.equal(comparison.schemaVersion, 1);
assert.equal(comparison.kind, "dynamac.macContext.absentHudRegressionComparison");
assert.equal(comparison.result.ok, true, comparison.result.regressionRisks.join("; "));
assert.equal(comparison.result.macContextAbsentInBaseline, true);
assert.equal(comparison.result.macContextAbsentInExperimental, true);
assert.equal(comparison.result.hudUnchangedWhenMacContextAbsent, true);
assert.deepEqual(comparison.result.regressionRisks, []);
assert.deepEqual(
  comparison.baseline.hudSnapshot.statusAgents,
  ["Now Playing", "Clipboard", "Battery"],
  "main-like baseline should preserve existing non-Mac-Context status ordering"
);
assert.deepEqual(
  comparison.experimental.hudSnapshot.statusAgents,
  comparison.baseline.hudSnapshot.statusAgents,
  "experimental absent-context path must not add/remove/reorder existing statuses"
);
assert.deepEqual(
  comparison.experimental.hudSnapshot.rankedActivities,
  comparison.baseline.hudSnapshot.rankedActivities,
  "experimental absent-context path must keep Dynamic Island activity routing unchanged"
);
assert.equal(comparison.experimental.hudSnapshot.compactSurface.activityType, "clipboard");
assert.equal(comparison.experimental.hudSnapshot.hasMacContextStatus, false);
assert.match(comparison.comparisonAgainstMain.regressionRisk, /unchanged/);

const experimentalWithMacContext = buildMacActivityStatusPayload({
  ...sharedNonContextOptions,
  macContextStatus: collectMacContextStatus({
    activeAppInfo: { name: "Arc", bundleIdentifier: "company.thebrowser.Browser", pid: 4242 },
    activeWindowTitle: "Dynamac Island",
    accessibilityPermission: true,
    screenRecordingPermission: true
  }),
  clipboardActivityState: createClipboardActivityState()
});
const changedComparison = compareAbsentMacContextHudRegression(mainLikePayload, experimentalWithMacContext);
assert.equal(changedComparison.result.ok, false, "regression test must fail if Mac Context leaks into the absent-data path");
assert.deepEqual(changedComparison.result.regressionRisks, [
  "experimental absent-context payload unexpectedly contains Mac Context status",
  "existing HUD routing changed when experimental Mac Context data is absent"
]);

console.log("mac-context-absent-hud-regression-comparison tests passed");
