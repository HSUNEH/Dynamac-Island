#!/usr/bin/env node

const assert = require("node:assert");
const {
  collectMacContextProvider,
  macContextProviderToActivity,
  normalizeActiveApplicationInfo,
  normalizePermissionProbeResult,
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
assert.match(degradedContext.degradationState, /front window title unavailable/);
assert.match(degradedContext.degradationState, /Accessibility not granted/);
assert.match(degradedContext.degradationState, /Screen Recording denied/);

const degradedActivity = macContextProviderToActivity(degradedContext);
assert.equal(degradedActivity.state, "warning");
assert.equal(degradedActivity.activeApp, "Finder");
assert.equal(degradedActivity.activeWindow, "");
assert.equal(degradedActivity.metadata.permissionStatus.accessibility.status, "denied");

const unavailableContext = collectMacContextProvider({
  activeAppInfo: null,
  activeWindowTitle: "",
  accessibilityProbeResult: { ok: false, stderr: "swift not installed" },
  screenRecordingProbeResult: { ok: false, stderr: "swift not installed" }
});
const unavailableActivity = macContextProviderToActivity(unavailableContext);
assert.equal(unavailableActivity.state, "error", "missing active app should be a visible error/degradation state");
assert.match(unavailableActivity.detail, /active application unavailable/);
assert.equal(unavailableActivity.activeApp, "");

console.log("mac-context-provider tests passed");
