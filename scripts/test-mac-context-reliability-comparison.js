#!/usr/bin/env node

const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { buildActivityRouterSnapshot } = require("../src/activity-router");
const { macContextProviderToActivity } = require("../src/mac-context-provider");
const { buildMacContextStatusSource } = require("./mac-context-status");
const {
  buildStaleMacContextHudStatus,
  comparePartialMacContextHudReliability,
  compareStaleMacContextHudReliability,
  compareUnavailableMacContextHudReliability,
  macContextStaleness
} = require("../src/mac-context-main-comparison");

const repoRoot = path.resolve(__dirname, "..");
const nativePath = path.join(repoRoot, ".build", "dynamac-native");
const generatedStatusPath = path.join(repoRoot, ".build", "mac-context-unavailable-status.json");
const generatedPartialStatusPath = path.join(repoRoot, ".build", "mac-context-partial-status.json");
const generatedStaleStatusPath = path.join(repoRoot, ".build", "mac-context-stale-status.json");

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

const partialPayload = buildMacContextStatusSource({
  now: "2026-06-17T00:03:00.000Z",
  activeAppInfo: { name: "Arc", bundleIdentifier: "company.thebrowser.Browser", pid: 4242 },
  activeWindowResult: {
    ok: true,
    stdout: "",
    stderr: "",
    error: ""
  },
  permissionStatus: {
    accessibility: { status: "granted", diagnostic: "fixture-accessibility-granted", available: true },
    screenRecording: { status: "granted", diagnostic: "fixture-screen-recording-granted", available: true }
  },
  uiTreeContext: {
    available: false,
    summary: "Fixture UI tree unavailable while active app remains readable.",
    nodes: []
  }
});

const partialHudStatus = macContextProviderToActivity(partialPayload);
partialHudStatus.updatedAt = partialPayload.sampledAt;
const partialHudState = buildActivityRouterSnapshot([partialHudStatus], { now: new Date(partialPayload.sampledAt) });
let partialReliabilityComparison;
assert.doesNotThrow(() => {
  partialReliabilityComparison = comparePartialMacContextHudReliability(partialPayload, { hudState: partialHudState });
}, "reliability comparison should handle partial Mac Context payloads without crashing");
assert.equal(partialReliabilityComparison.schemaVersion, 1);
assert.equal(partialReliabilityComparison.kind, "dynamac.macContext.partialReliabilityComparison");
assert.equal(partialReliabilityComparison.result.ok, true, partialReliabilityComparison.result.regressionRisks.join("; "));
assert.equal(partialReliabilityComparison.result.consumesPartialMacContext, true);
assert.equal(partialReliabilityComparison.result.safelyDegradesMissingFields, true);
assert.equal(partialReliabilityComparison.result.validPartialHudOutput, true);
assert.equal(partialReliabilityComparison.partialContext.partialActiveContext, true);
assert.equal(partialReliabilityComparison.partialContext.activeAppName, "Arc");
assert.equal(partialReliabilityComparison.partialContext.activeWindowAvailable, false);
assert.deepEqual(partialReliabilityComparison.partialContext.unavailableSources, ["activeWindow", "uiTreeContext"]);
assert.equal(partialReliabilityComparison.hudDisplay.compactIsMacContext, true);
assert.equal(partialReliabilityComparison.hudDisplay.displaysMacContext, true);
assert.equal(partialReliabilityComparison.partialContext.activityState, "warning");
assert.equal(partialReliabilityComparison.partialContext.activityTask, "Arc · window degraded");
assert.equal(partialReliabilityComparison.partialContext.compactLabel, "Arc");
assert.match(partialReliabilityComparison.partialContext.degradationState, /Front window title unavailable/);
assert.match(partialReliabilityComparison.partialContext.degradationState, /UI tree summary unavailable/);
assert.match(partialReliabilityComparison.comparisonAgainstMain.reliability, /without crashing/);

fs.writeFileSync(generatedPartialStatusPath, JSON.stringify({
  statuses: [partialHudStatus],
  activityRouter: {
    compactSurface: partialHudState.compactSurface
  }
}, null, 2));

const partialNativeResult = childProcess.spawnSync(nativePath, {
  cwd: repoRoot,
  env: {
    ...process.env,
    DYNAMAC_NATIVE_SMOKE_TEST: "1",
    DYNAMAC_NATIVE_STATUS_DUMP: "1",
    DYNAMAC_STATUS_FILE: generatedPartialStatusPath
  },
  encoding: "utf8",
  timeout: 5000
});

assert.equal(partialNativeResult.status, 0, partialNativeResult.stderr || partialNativeResult.stdout);
assert.match(partialNativeResult.stdout, /DYNAMAC_NATIVE_READY/, "native partial smoke path should report readiness");
assert.match(partialNativeResult.stdout, /DYNAMAC_STATUS_DUMP active=activityRouter/, "partial Mac Context should still produce a routed HUD dump");
assert.match(partialNativeResult.stdout, /presentation=macContext/, "partial Mac Context should still own the degraded HUD presentation");
assert.match(partialNativeResult.stdout, /routerCompactType=macContext/, "router compact type should remain macContext while partially degraded");
assert.match(partialNativeResult.stdout, /statusState=warning/, "partial Mac Context should be visible as a warning HUD activity");
assert.match(partialNativeResult.stdout, /task=Arc · window degraded/, "native HUD dump should preserve partial missing-window task text");
assert.match(partialNativeResult.stdout, /activeApp=Arc/, "native partial HUD dump should preserve active app context");
assert.match(partialNativeResult.stdout, /activeWindow=/, "native partial HUD dump should expose the missing activeWindow field without crashing");
assert.match(partialNativeResult.stdout, /permissionAccessibility=granted/, "native partial HUD dump should preserve Accessibility status");
assert.match(partialNativeResult.stdout, /permissionScreenRecording=granted/, "native partial HUD dump should preserve Screen Recording status");
assert.match(partialNativeResult.stdout, /renderedCompactText=⚠ Arc/, "compact native HUD text should visibly flag partial Mac Context");
assert.match(partialNativeResult.stdout, /renderedExpandedText=Arc · Window unavailable/, "expanded native HUD text should safely degrade missing window title while preserving active app");
assert.match(partialNativeResult.stdout, /AX granted · Screen granted/, "expanded native HUD text should retain permission status for partial context");
assert.match(partialNativeResult.stdout, /Front window title unavailable/, "expanded native HUD text should retain missing-window degradation reason");

const stalePayload = buildMacContextStatusSource({
  now: "2026-06-17T00:00:00.000Z",
  activeAppInfo: { name: "Arc", bundleIdentifier: "company.thebrowser.Browser", pid: 4242 },
  activeWindowTitle: "Dynamac Island · stale context note",
  permissionStatus: {
    accessibility: { status: "granted", diagnostic: "fixture-accessibility-granted", available: true },
    screenRecording: { status: "granted", diagnostic: "fixture-screen-recording-granted", available: true }
  }
});
const staleNow = "2026-06-17T00:02:00.000Z";
const staleness = macContextStaleness(stalePayload, { now: staleNow, staleAfterMs: 30_000 });
assert.equal(staleness.stale, true, "120s-old Mac Context payload should be detected as stale");
assert.equal(staleness.reason, "sample age exceeds threshold");
assert.equal(staleness.ageMs, 120_000);

const staleHudStatus = buildStaleMacContextHudStatus(stalePayload, { now: staleNow, staleAfterMs: 30_000 });
assert.equal(staleHudStatus.state, "warning", "stale readable Mac Context should degrade to a warning HUD activity");
assert.match(staleHudStatus.task, /Stale context · Arc/);
assert.match(staleHudStatus.degradationState, /Mac Context snapshot stale/);
assert.match(staleHudStatus.degradationState, /stale\/degraded read-only context/);
assert.equal(staleHudStatus.macContext.metadata.stale, true);
assert.equal(staleHudStatus.macContext.metadata.staleAgeMs, 120_000);

const staleHudState = buildActivityRouterSnapshot([staleHudStatus], { now: new Date(staleNow) });
let staleReliabilityComparison;
assert.doesNotThrow(() => {
  staleReliabilityComparison = compareStaleMacContextHudReliability(stalePayload, {
    hudState: staleHudState,
    now: staleNow,
    staleAfterMs: 30_000
  });
}, "reliability comparison should handle stale Mac Context payloads without crashing");
assert.equal(staleReliabilityComparison.schemaVersion, 1);
assert.equal(staleReliabilityComparison.kind, "dynamac.macContext.staleReliabilityComparison");
assert.equal(staleReliabilityComparison.result.ok, true, staleReliabilityComparison.result.regressionRisks.join("; "));
assert.equal(staleReliabilityComparison.result.handlesStaleMacContext, true);
assert.equal(staleReliabilityComparison.result.validStaleDegradedHudOutput, true);
assert.equal(staleReliabilityComparison.staleContext.detected, true);
assert.equal(staleReliabilityComparison.staleContext.activityState, "warning");
assert.match(staleReliabilityComparison.staleContext.activityTask, /Stale context · Arc/);
assert.match(staleReliabilityComparison.staleContext.degradationState, /Mac Context snapshot stale/);
assert.match(staleReliabilityComparison.comparisonAgainstMain.reliability, /without crashing/);

fs.writeFileSync(generatedStaleStatusPath, JSON.stringify({
  statuses: [staleHudStatus],
  activityRouter: {
    compactSurface: staleHudState.compactSurface
  }
}, null, 2));

const staleNativeResult = childProcess.spawnSync(nativePath, {
  cwd: repoRoot,
  env: {
    ...process.env,
    DYNAMAC_NATIVE_SMOKE_TEST: "1",
    DYNAMAC_NATIVE_STATUS_DUMP: "1",
    DYNAMAC_STATUS_FILE: generatedStaleStatusPath
  },
  encoding: "utf8",
  timeout: 5000
});

assert.equal(staleNativeResult.status, 0, staleNativeResult.stderr || staleNativeResult.stdout);
assert.match(staleNativeResult.stdout, /DYNAMAC_NATIVE_READY/, "native stale smoke path should report readiness");
assert.match(staleNativeResult.stdout, /DYNAMAC_STATUS_DUMP active=activityRouter/, "stale Mac Context should still produce a routed HUD dump");
assert.match(staleNativeResult.stdout, /presentation=macContext/, "stale Mac Context should still own the degraded HUD presentation");
assert.match(staleNativeResult.stdout, /routerCompactType=macContext/, "router compact type should remain macContext while stale");
assert.match(staleNativeResult.stdout, /statusState=warning/, "stale Mac Context should be visible as a warning HUD activity");
assert.match(staleNativeResult.stdout, /task=Stale context · Arc · Dynamac Island · stale context note/, "native HUD dump should preserve stale task text");
assert.match(staleNativeResult.stdout, /activeApp=Arc/, "native stale HUD dump should preserve stale active app context");
assert.match(staleNativeResult.stdout, /activeWindow=Dynamac Island · stale context note/, "native stale HUD dump should preserve stale active window context");
assert.match(staleNativeResult.stdout, /permissionAccessibility=granted/, "native stale HUD dump should preserve Accessibility status");
assert.match(staleNativeResult.stdout, /permissionScreenRecording=granted/, "native stale HUD dump should preserve Screen Recording status");
assert.match(staleNativeResult.stdout, /renderedCompactText=⚠ Arc/, "compact native HUD text should visibly flag stale Mac Context");
assert.match(staleNativeResult.stdout, /renderedExpandedText=Arc · Dynamac Island · stale context note/, "expanded native HUD text should preserve stale active context");
assert.match(staleNativeResult.stdout, /Mac Context snapshot stale \(120s old; sample age exceeds threshold\)/, "expanded native HUD text should retain stale degradation reason");

console.log("mac-context-reliability-comparison unavailable, partial, and stale degraded HUD tests passed");
