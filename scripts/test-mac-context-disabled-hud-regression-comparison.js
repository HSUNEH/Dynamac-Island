#!/usr/bin/env node

const assert = require("node:assert");
const { createClipboardActivityState } = require("../src/clipboard-activity");
const {
  buildMacActivityStatusPayload,
  collectMacContextStatus
} = require("../src/mac-activity-status");
const {
  compareDisabledMacContextHudRegression
} = require("../src/mac-context-main-comparison");

const now = new Date("2026-06-17T04:00:00.000Z");
const sharedExistingHudOptions = {
  now,
  mediaInfo: {
    source: "spotify",
    title: "Disabled Regression Song",
    artist: "Dynamac Tests",
    album: "Mac Context Disabled",
    durationSeconds: 240,
    positionSeconds: 64,
    playbackState: "playing"
  },
  clipboardText: "https://example.com/disabled-regression",
  pmsetOutput: "Now drawing from 'AC Power'\n -InternalBattery-0\t82%; charging; 0:35 remaining present: true"
};

function buildMainLikePayload() {
  return buildMacActivityStatusPayload({
    ...sharedExistingHudOptions,
    enableMacContext: false,
    clipboardActivityState: createClipboardActivityState()
  });
}

function buildExperimentalPayloadWithOptionDisabled() {
  return buildMacActivityStatusPayload({
    ...sharedExistingHudOptions,
    enableMacContext: false,
    activeAppInfo: { name: "Arc", bundleIdentifier: "company.thebrowser.Browser", pid: 4242 },
    activeWindowTitle: "Dynamac Island should not surface while disabled",
    accessibilityPermission: true,
    screenRecordingPermission: true,
    clipboardActivityState: createClipboardActivityState()
  });
}

function buildExperimentalPayloadWithEnvDisabled() {
  const originalDisable = process.env.DYNAMAC_DISABLE_MAC_CONTEXT_HUD;
  process.env.DYNAMAC_DISABLE_MAC_CONTEXT_HUD = "1";
  try {
    return buildMacActivityStatusPayload({
      ...sharedExistingHudOptions,
      activeAppInfo: { name: "Arc", bundleIdentifier: "company.thebrowser.Browser", pid: 4242 },
      activeWindowTitle: "Dynamac Island should not surface while disabled by env",
      accessibilityPermission: true,
      screenRecordingPermission: true,
      clipboardActivityState: createClipboardActivityState()
    });
  } finally {
    if (originalDisable === undefined) {
      delete process.env.DYNAMAC_DISABLE_MAC_CONTEXT_HUD;
    } else {
      process.env.DYNAMAC_DISABLE_MAC_CONTEXT_HUD = originalDisable;
    }
  }
}

const mainLikePayload = buildMainLikePayload();
const optionDisabledPayload = buildExperimentalPayloadWithOptionDisabled();
const optionDisabledComparison = compareDisabledMacContextHudRegression(mainLikePayload, optionDisabledPayload, {
  disabledBy: "enableMacContext:false"
});

assert.equal(optionDisabledComparison.schemaVersion, 1);
assert.equal(optionDisabledComparison.kind, "dynamac.macContext.disabledHudRegressionComparison");
assert.equal(optionDisabledComparison.disabledBy, "enableMacContext:false");
assert.equal(optionDisabledComparison.result.ok, true, optionDisabledComparison.result.regressionRisks.join("; "));
assert.equal(optionDisabledComparison.result.macContextAbsentInBaseline, true);
assert.equal(optionDisabledComparison.result.macContextAbsentInExperimental, true);
assert.equal(optionDisabledComparison.result.hudUnchangedWhenMacContextDisabled, true);
assert.deepEqual(optionDisabledComparison.result.regressionRisks, []);
assert.deepEqual(
  optionDisabledComparison.experimental.hudSnapshot.statusAgents,
  optionDisabledComparison.baseline.hudSnapshot.statusAgents,
  "explicit option disable must not add/remove/reorder existing HUD statuses"
);
assert.deepEqual(
  optionDisabledComparison.experimental.hudSnapshot.rankedActivities,
  optionDisabledComparison.baseline.hudSnapshot.rankedActivities,
  "explicit option disable must keep existing Dynamic Island activity routing unchanged"
);
assert.equal(optionDisabledComparison.experimental.hudSnapshot.hasMacContextStatus, false);
assert.equal(optionDisabledComparison.experimental.hudSnapshot.compactSurface.activityType, "clipboard");
assert.match(optionDisabledComparison.comparisonAgainstMain.regressionRisk, /unchanged/);

const envDisabledPayload = buildExperimentalPayloadWithEnvDisabled();
const envDisabledComparison = compareDisabledMacContextHudRegression(mainLikePayload, envDisabledPayload, {
  disabledBy: "DYNAMAC_DISABLE_MAC_CONTEXT_HUD=1"
});
assert.equal(envDisabledComparison.disabledBy, "DYNAMAC_DISABLE_MAC_CONTEXT_HUD=1");
assert.equal(envDisabledComparison.result.ok, true, envDisabledComparison.result.regressionRisks.join("; "));
assert.equal(envDisabledComparison.result.hudUnchangedWhenMacContextDisabled, true);
assert.deepEqual(envDisabledComparison.experimental.hudSnapshot, optionDisabledComparison.experimental.hudSnapshot);

const experimentalWithMacContextLeak = buildMacActivityStatusPayload({
  ...sharedExistingHudOptions,
  macContextStatus: collectMacContextStatus({
    activeAppInfo: { name: "Arc", bundleIdentifier: "company.thebrowser.Browser", pid: 4242 },
    activeWindowTitle: "Leaked Mac Context",
    accessibilityPermission: true,
    screenRecordingPermission: true
  }),
  clipboardActivityState: createClipboardActivityState()
});
const leakComparison = compareDisabledMacContextHudRegression(mainLikePayload, experimentalWithMacContextLeak);
assert.equal(leakComparison.result.ok, false, "regression comparison must fail if Mac Context leaks into the disabled path");
assert.deepEqual(leakComparison.result.regressionRisks, [
  "experimental disabled-context payload unexpectedly contains Mac Context status",
  "existing HUD routing changed when experimental Mac Context integration is disabled"
]);

console.log("mac-context-disabled-hud-regression-comparison tests passed");
