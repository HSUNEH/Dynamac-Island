#!/usr/bin/env node

const assert = require("node:assert");
const {
  collectActiveWindowContext,
  collectMacPermissionStatus,
  collectMacContextProvider,
  invokePermissionProbe,
  macContextDegradationReasons,
  macContextProviderToActivity,
  normalizeActiveApplicationInfo,
  normalizeAcquisitionResult,
  normalizePermissionProbeResult,
  permissionStatusWithAvailability,
  parseActiveApplicationText
} = require("../src/mac-context-provider");

assert.deepEqual(parseActiveApplicationText("Arc||company.thebrowser.Browser||4242"), {
  name: "Arc",
  bundleIdentifier: "company.thebrowser.Browser",
  pid: 4242
}, "frontmost app text should normalize into stable metadata");

assert.equal(parseActiveApplicationText("||com.example.Empty||100"), null, "missing active app name should not produce fake metadata");
assert.deepEqual(normalizeActiveApplicationInfo({ localizedName: "Finder", bundleIdentifier: "com.apple.finder", processIdentifier: "101" }), {
  name: "Finder",
  bundleIdentifier: "com.apple.finder",
  pid: 101
}, "provider should accept native-like app objects and normalize pid/name fields");

assert.deepEqual(normalizePermissionProbeResult("accessibility", { ok: true, stdout: "granted" }), {
  status: "granted",
  diagnostic: "preflight-granted"
}, "granted permission probe should produce deterministic status");
assert.deepEqual(normalizePermissionProbeResult("screenRecording", { ok: true, stdout: "false" }), {
  status: "denied",
  diagnostic: "preflight-denied"
}, "boolean false probe should degrade to denied");
assert.deepEqual(normalizePermissionProbeResult("accessibility", { ok: false, stderr: "swift missing" }), {
  status: "unknown",
  diagnostic: "swift missing"
}, "failed permission probe should degrade without throwing");
assert.deepEqual(permissionStatusWithAvailability({ status: "granted", diagnostic: "fixture" }), {
  status: "granted",
  diagnostic: "fixture",
  available: true
}, "permission status should expose explicit availability for HUD contracts");
assert.deepEqual(invokePermissionProbe("accessibility", () => false), {
  ok: true,
  stdout: "denied",
  stderr: "",
  error: ""
}, "boolean injectable permission probes should normalize to command-like results");
assert.deepEqual(invokePermissionProbe("screenRecording", () => { throw new Error("TCC probe unavailable"); }), {
  ok: false,
  stdout: "",
  stderr: "",
  error: "TCC probe unavailable"
}, "throwing injectable permission probes should become unknown/degraded results instead of crashing");

const permissionDeniedAcquisition = normalizeAcquisitionResult("activeWindow", {
  ok: false,
  stdout: "",
  stderr: "System Events got an error: osascript is not authorized to send Apple events to System Events.",
  error: "Command failed"
}, {
  requiredPermission: "accessibility",
  emptyDiagnostic: "Front window title is empty or unavailable."
});
assert.deepEqual(permissionDeniedAcquisition, {
  status: "degraded",
  available: false,
  degraded: true,
  value: "",
  reason: "permissionDenied",
  requiredPermission: "accessibility",
  diagnostic: "System Events got an error: osascript is not authorized to send Apple events to System Events."
}, "permission-denied acquisition responses should become an explicit degraded status object");
assert.deepEqual(collectActiveWindowContext({
  activeWindowResult: {
    ok: false,
    stdout: "",
    stderr: "Operation not permitted: Accessibility permission is required",
    error: ""
  }
}), {
  title: "",
  status: {
    status: "degraded",
    available: false,
    degraded: true,
    value: "",
    reason: "permissionDenied",
    requiredPermission: "accessibility",
    diagnostic: "Operation not permitted: Accessibility permission is required"
  }
}, "active window acquisition should surface permission-denied degradation instead of only an empty title");

const injectedPermissionStatus = collectMacPermissionStatus({
  permissionProbes: {
    accessibility: () => ({ ok: true, stdout: "granted" }),
    screenRecording: () => "denied"
  }
});
assert.deepEqual(injectedPermissionStatus, {
  accessibility: { status: "granted", diagnostic: "preflight-granted", available: true },
  screenRecording: { status: "denied", diagnostic: "preflight-denied", available: false }
}, "permission detector should report Accessibility and Screen Recording availability from injected probes");

const fullContext = collectMacContextProvider({
  activeAppInfo: { name: "Arc", bundleIdentifier: "company.thebrowser.Browser", pid: 4242 },
  activeWindowTitle: "Dynamac Island · macOS-MCP notes",
  accessibilityPermission: true,
  screenRecordingPermission: true
});
assert.equal(fullContext.source, "local-macos-context-provider");
assert.deepEqual(fullContext.activeApp, { name: "Arc", bundleIdentifier: "company.thebrowser.Browser", pid: 4242 });
assert.equal(fullContext.activeWindow, "Dynamac Island · macOS-MCP notes");
assert.equal(fullContext.permissionStatus.accessibility.status, "granted");
assert.equal(fullContext.permissionStatus.screenRecording.status, "granted");
assert.equal(fullContext.uiTreeContext.available, true);
assert.match(fullContext.degradationState, /Full read-only active app\/window context available/);
assert.deepEqual(macContextDegradationReasons(fullContext.activeApp, fullContext.activeWindow, fullContext.permissionStatus, fullContext.uiTreeContext), [], "full context should have no degradation reasons");

const fullActivity = macContextProviderToActivity(fullContext);
assert.equal(fullActivity.agent, "Mac Context");
assert.equal(fullActivity.state, "running");
assert.equal(fullActivity.activeApp, "Arc");
assert.equal(fullActivity.activeWindow, "Dynamac Island · macOS-MCP notes");
assert.equal(fullActivity.macContext.metadata.bundleIdentifier, "company.thebrowser.Browser");
assert.equal(fullActivity.macContext.compactSurface.glyph, "macwindow");

const degradedContext = collectMacContextProvider({
  activeAppInfo: { name: "Finder", bundleIdentifier: "com.apple.finder", pid: 101 },
  activeWindowTitle: "",
  accessibilityPermission: false,
  screenRecordingPermission: false
});
assert.equal(degradedContext.uiTreeContext.available, false, "UI tree should not be claimed without Accessibility permission");
assert.match(degradedContext.degradationState, /Front window title unavailable/);
assert.match(degradedContext.degradationState, /Accessibility denied; front window title and UI tree are reduced/);
assert.match(degradedContext.degradationState, /Screen Recording denied/);
assert.match(degradedContext.degradationState, /UI tree summary unavailable/);

const degradedActivity = macContextProviderToActivity(degradedContext);
assert.equal(degradedActivity.state, "warning");
assert.equal(degradedActivity.activeApp, "Finder");
assert.equal(degradedActivity.activeWindow, "");
assert.equal(degradedActivity.metadata.permissionStatus.accessibility.status, "denied");

const acquisitionDeniedContext = collectMacContextProvider({
  activeAppInfo: { name: "Finder", bundleIdentifier: "com.apple.finder", pid: 101 },
  activeWindowResult: {
    ok: false,
    stdout: "",
    stderr: "System Events got an error: osascript is not authorized to send Apple events to System Events.",
    error: "Command failed"
  },
  accessibilityPermission: false,
  screenRecordingPermission: true
});
assert.equal(acquisitionDeniedContext.activeWindow, "");
assert.deepEqual(acquisitionDeniedContext.acquisitionStatus.activeWindow, permissionDeniedAcquisition);
assert.match(acquisitionDeniedContext.degradationState, /Active window acquisition permission denied/);
assert.match(acquisitionDeniedContext.degradationState, /not authorized to send Apple events/);

const unavailableContext = collectMacContextProvider({
  activeAppInfo: null,
  activeWindowTitle: "",
  accessibilityProbeResult: { ok: false, stderr: "swift not installed" },
  screenRecordingProbeResult: { ok: false, stderr: "swift not installed" }
});
const unavailableActivity = macContextProviderToActivity(unavailableContext);
assert.equal(unavailableActivity.state, "error", "missing active app should be a visible error/degradation state");
assert.match(unavailableActivity.detail, /Active application unavailable/);
assert.match(unavailableActivity.detail, /Accessibility status unknown \(swift not installed\)/);
assert.match(unavailableActivity.detail, /Screen Recording status unknown \(swift not installed\)/);
assert.equal(unavailableActivity.activeApp, "");

const unknownReasons = macContextDegradationReasons(
  { name: "Preview", bundleIdentifier: "com.apple.Preview", pid: 202 },
  "Contract.pdf",
  {
    accessibility: { status: "unknown", diagnostic: "AX probe timed out", available: false },
    screenRecording: { status: "unknown", diagnostic: "CG preflight unavailable", available: false }
  },
  { available: false, summary: "reduced", nodes: [] }
);
assert.deepEqual(unknownReasons, [
  "Accessibility status unknown (AX probe timed out); front window title and UI tree are reduced until the local probe succeeds.",
  "Screen Recording status unknown (CG preflight unavailable); screenshot and screen-derived context stay disabled until the local probe succeeds.",
  "UI tree summary unavailable; HUD is using the safest app/window-level context only."
], "unknown permissions should derive explicit user-facing degraded reasons");

console.log("mac-context-provider tests passed");
