#!/usr/bin/env node

const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { buildActivityRouterSnapshot } = require("../src/activity-router");
const { macContextProviderToActivity } = require("../src/mac-context-provider");
const { buildMacContextStatusSource } = require("./mac-context-status");
const {
  compareUnavailableMacContextHudReliability
} = require("../src/mac-context-main-comparison");

const repoRoot = path.resolve(__dirname, "..");
const nativePath = path.join(repoRoot, ".build", "dynamac-native");
const generatedStatusPath = path.join(repoRoot, ".build", "mac-context-unavailable-status.json");

const payload = buildMacContextStatusSource({
  now: "2026-06-17T00:02:00.000Z",
  activeAppInfo: null,
  activeWindowResult: {
    ok: false,
    stdout: "",
    stderr: "osascript missing",
    error: "ENOENT tool unavailable"
  },
  permissionStatus: {
    accessibility: { status: "denied", diagnostic: "fixture-accessibility-denied", available: false },
    screenRecording: { status: "unknown", diagnostic: "fixture-screen-recording-probe-unavailable", available: false }
  }
});

const hudStatus = macContextProviderToActivity(payload);
hudStatus.updatedAt = payload.sampledAt;
const hudState = buildActivityRouterSnapshot([hudStatus], { now: new Date(payload.sampledAt) });

let reliabilityComparison;
assert.doesNotThrow(() => {
  reliabilityComparison = compareUnavailableMacContextHudReliability(payload, { hudState });
}, "reliability comparison should handle fully unavailable Mac Context payloads without crashing");

assert.equal(reliabilityComparison.schemaVersion, 1);
assert.equal(reliabilityComparison.kind, "dynamac.macContext.unavailableReliabilityComparison");
assert.equal(reliabilityComparison.result.ok, true, reliabilityComparison.result.regressionRisks.join("; "));
assert.equal(reliabilityComparison.result.handlesUnavailableMacContext, true);
assert.equal(reliabilityComparison.result.validDegradedHudOutput, true);
assert.equal(reliabilityComparison.unavailableContext.activeContextUnavailable, true);
assert.deepEqual(reliabilityComparison.unavailableContext.unavailableSources, [
  "activeApplication",
  "activeWindow",
  "accessibilityPermission",
  "screenRecordingPermission",
  "uiTreeContext"
]);
assert.equal(reliabilityComparison.hudDisplay.compactIsMacContext, true);
assert.equal(reliabilityComparison.hudDisplay.displaysMacContext, true);
assert.equal(reliabilityComparison.unavailableContext.activityState, "error");
assert.equal(reliabilityComparison.unavailableContext.activityTask, "Active app unavailable · window degraded");
assert.equal(reliabilityComparison.unavailableContext.compactLabel, "Mac Context");
assert.match(reliabilityComparison.unavailableContext.degradationState, /Active application unavailable/);
assert.match(reliabilityComparison.unavailableContext.degradationState, /Accessibility denied/);
assert.match(reliabilityComparison.comparisonAgainstMain.reliability, /without crashing/);

fs.mkdirSync(path.dirname(generatedStatusPath), { recursive: true });
fs.writeFileSync(generatedStatusPath, JSON.stringify({
  statuses: [hudStatus],
  activityRouter: {
    compactSurface: hudState.compactSurface
  }
}, null, 2));

const nativeResult = childProcess.spawnSync(nativePath, {
  cwd: repoRoot,
  env: {
    ...process.env,
    DYNAMAC_NATIVE_SMOKE_TEST: "1",
    DYNAMAC_NATIVE_STATUS_DUMP: "1",
    DYNAMAC_STATUS_FILE: generatedStatusPath
  },
  encoding: "utf8",
  timeout: 5000
});

assert.equal(nativeResult.status, 0, nativeResult.stderr || nativeResult.stdout);
assert.match(nativeResult.stdout, /DYNAMAC_NATIVE_READY/, "native smoke path should report readiness");
assert.match(nativeResult.stdout, /DYNAMAC_STATUS_DUMP active=activityRouter/, "unavailable Mac Context should still produce a routed HUD dump");
assert.match(nativeResult.stdout, /presentation=macContext/, "unavailable Mac Context should still own the degraded HUD presentation");
assert.match(nativeResult.stdout, /routerCompactType=macContext/, "router compact type should remain macContext while degraded");
assert.match(nativeResult.stdout, /statusState=error/, "fully unavailable Mac Context should be visible as an error HUD activity");
assert.match(nativeResult.stdout, /task=Active app unavailable · window degraded/, "native HUD dump should preserve degraded task text");
assert.match(nativeResult.stdout, /activeApp=/, "native HUD dump should expose the empty activeApp field without crashing");
assert.match(nativeResult.stdout, /activeWindow=/, "native HUD dump should expose the empty activeWindow field without crashing");
assert.match(nativeResult.stdout, /permissionAccessibility=denied/, "native HUD dump should expose Accessibility denial");
assert.match(nativeResult.stdout, /permissionScreenRecording=unknown/, "native HUD dump should expose Screen Recording uncertainty");
assert.match(nativeResult.stdout, /renderedCompactText=⚠ Mac Context/, "compact native HUD text should visibly flag unavailable Mac Context");
assert.match(nativeResult.stdout, /renderedExpandedText=Mac Context · Window unavailable/, "expanded native HUD text should have a safe fallback title");
assert.match(nativeResult.stdout, /AX denied · Screen unknown/, "expanded native HUD text should retain permission status");
assert.match(nativeResult.stdout, /Active application unavailable; showing Mac Context degraded state\./, "expanded native HUD text should retain degradation reason");

console.log("mac-context-reliability-comparison unavailable degraded HUD test passed");
