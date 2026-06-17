#!/usr/bin/env node

const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  buildGenerationResult,
  buildMacContextStatusSource,
  requiredPermissionDegradations,
  parseArgs,
  STATUS_SOURCE
} = require("./mac-context-status");

const repoRoot = path.join(__dirname, "..");

assert.deepEqual(parseArgs(["--fixture", "fixture.json", "--pretty", "--now", "2026-06-17T00:00:00.000Z"]), {
  fixturePath: "fixture.json",
  pretty: true,
  statusOnly: false,
  now: "2026-06-17T00:00:00.000Z",
  help: false
});
assert.deepEqual(parseArgs(["--fixture=fixture.json", "--status-only", "--now=2026-06-17T00:00:00.000Z"]), {
  fixturePath: "fixture.json",
  pretty: false,
  statusOnly: true,
  now: "2026-06-17T00:00:00.000Z",
  help: false
});
assert.throws(() => parseArgs(["--unknown"]), /Unknown argument/);

assert.deepEqual(buildGenerationResult({
  activeApp: { name: "Arc", bundleIdentifier: "company.thebrowser.Browser", pid: 4242 },
  activeWindow: "Dynamac Island · macOS-MCP notes",
  permissionStatus: {
    accessibility: { status: "granted", diagnostic: "fixture", available: true },
    screenRecording: { status: "granted", diagnostic: "fixture", available: true }
  },
  uiTreeContext: { available: true, summary: "fixture", nodes: [] },
  degradationState: "Full read-only active app/window context available."
}), {
  ok: true,
  status: "success",
  success: true,
  message: "Full read-only active app/window context available.",
  activeContextAvailable: true,
  permissionsAvailable: true,
  uiTreeAvailable: true,
  degradation: {
    degraded: false,
    state: "Full read-only active app/window context available.",
    reasons: [],
    requiredPermissionsUnavailable: false,
    unavailablePermissions: [],
    activeContextUnavailable: false,
    uiTreeUnavailable: false
  }
}, "status generation should expose structured success when app/window data and permissions are available");

const missingPermissionResult = buildGenerationResult({
  activeApp: { name: "Finder", bundleIdentifier: "com.apple.finder", pid: 101 },
  activeWindow: "Downloads",
  permissionStatus: {
    accessibility: { status: "denied", diagnostic: "preflight-denied", available: false },
    screenRecording: { status: "unknown", diagnostic: "CG preflight unavailable", available: false }
  },
  uiTreeContext: { available: false, summary: "reduced", nodes: [] },
  degradationReasons: [
    "Accessibility denied; active window title and UI tree context will stay reduced until permission is granted in System Settings.",
    "Screen Recording status unknown (CG preflight unavailable); screenshot and screen-derived context stay disabled until the local probe succeeds.",
    "UI tree summary unavailable; HUD is using the safest app/window-level context only."
  ],
  degradationState: "Accessibility denied; active window title and UI tree context will stay reduced until permission is granted in System Settings.; Screen Recording status unknown (CG preflight unavailable); screenshot and screen-derived context stay disabled until the local probe succeeds.; UI tree summary unavailable; HUD is using the safest app/window-level context only."
});
assert.equal(missingPermissionResult.status, "degraded");
assert.equal(missingPermissionResult.success, false);
assert.equal(missingPermissionResult.permissionsAvailable, false);
assert.equal(missingPermissionResult.degradation.degraded, true);
assert.equal(missingPermissionResult.degradation.requiredPermissionsUnavailable, true);
assert.deepEqual(missingPermissionResult.degradation.unavailablePermissions, [
  { name: "accessibility", status: "denied", available: false, diagnostic: "preflight-denied" },
  { name: "screenRecording", status: "unknown", available: false, diagnostic: "CG preflight unavailable" }
]);
assert.equal(missingPermissionResult.degradation.activeContextUnavailable, false);
assert.equal(missingPermissionResult.degradation.uiTreeUnavailable, true);
assert.deepEqual(missingPermissionResult.degradation.reasons, [
  "Accessibility denied; active window title and UI tree context will stay reduced until permission is granted in System Settings.",
  "Screen Recording status unknown (CG preflight unavailable); screenshot and screen-derived context stay disabled until the local probe succeeds.",
  "UI tree summary unavailable; HUD is using the safest app/window-level context only."
], "required macOS permission failures should produce machine-readable degradation reasons");
assert.deepEqual(requiredPermissionDegradations({
  accessibility: { status: "denied", diagnostic: "preflight-denied", available: false },
  screenRecording: { status: "granted", diagnostic: "fixture", available: true }
}), [
  { name: "accessibility", status: "denied", available: false, diagnostic: "preflight-denied" }
], "permission degradations should identify each unavailable required macOS permission");

const payload = buildMacContextStatusSource({
  now: "2026-06-17T00:00:00.000Z",
  activeAppInfo: { name: "Arc", bundleIdentifier: "company.thebrowser.Browser", pid: 4242 },
  activeWindowTitle: "Dynamac Island · macOS-MCP notes",
  permissionStatus: {
    accessibility: { status: "granted", diagnostic: "fixture" },
    screenRecording: { status: "denied", diagnostic: "fixture" }
  },
  uiTreeContext: {
    available: true,
    summary: "Front window for Arc: Dynamac Island · macOS-MCP notes",
    nodes: [{ role: "application", title: "Arc" }, { role: "window", title: "Dynamac Island · macOS-MCP notes" }]
  }
});

assert.equal(payload.schemaVersion, 1);
assert.equal(payload.kind, "dynamac.macContext.statusSource");
assert.equal(payload.sampledAt, "2026-06-17T00:00:00.000Z");
assert.equal(payload.result.ok, true);
assert.equal(payload.result.status, "degraded");
assert.equal(payload.result.success, false);
assert.equal(payload.result.activeContextAvailable, true);
assert.equal(payload.result.permissionsAvailable, false);
assert.equal(payload.result.uiTreeAvailable, true);
assert.equal(payload.result.degradation.requiredPermissionsUnavailable, true);
assert.deepEqual(payload.result.degradation.unavailablePermissions, [
  { name: "screenRecording", status: "denied", available: false, diagnostic: "fixture" }
]);
assert.equal(payload.statusSource, STATUS_SOURCE);
assert.equal(payload.source, "local-macos-context-provider");
assert.deepEqual(payload.activeApp, { name: "Arc", bundleIdentifier: "company.thebrowser.Browser", pid: 4242 });
assert.equal(payload.activeWindow, "Dynamac Island · macOS-MCP notes");
assert.equal(payload.permissionStatus.accessibility.available, true);
assert.equal(payload.permissionStatus.screenRecording.available, false);
assert.match(payload.degradationState, /Screen Recording denied/);
assert.equal(payload.uiTreeContext.available, true);
assert.deepEqual(Object.keys(payload), [
  "schemaVersion",
  "kind",
  "sampledAt",
  "result",
  "statusSource",
  "source",
  "activeApp",
  "activeWindow",
  "uiTreeContext",
  "permissionStatus",
  "degradationState"
], "local command schema should remain stable and deterministic");

const statusOnlyPayload = buildMacContextStatusSource({
  now: "2026-06-17T00:00:01.000Z",
  statusOnly: true,
  permissionStatus: {
    accessibility: { status: "unknown", diagnostic: "AX probe unavailable" },
    screenRecording: { status: "granted", diagnostic: "fixture" }
  }
});
assert.equal(statusOnlyPayload.source, "local-macos-context-status-only");
assert.equal(statusOnlyPayload.result.ok, true);
assert.equal(statusOnlyPayload.result.status, "degraded");
assert.equal(statusOnlyPayload.result.success, false);
assert.equal(statusOnlyPayload.result.activeContextAvailable, false);
assert.equal(statusOnlyPayload.result.degradation.requiredPermissionsUnavailable, true);
assert.deepEqual(statusOnlyPayload.result.degradation.unavailablePermissions, [
  { name: "accessibility", status: "unknown", available: false, diagnostic: "AX probe unavailable" }
]);
assert.equal(statusOnlyPayload.activeApp, null);
assert.equal(statusOnlyPayload.activeWindow, "");
assert.equal(statusOnlyPayload.uiTreeContext.available, false);
assert.match(statusOnlyPayload.degradationState, /Accessibility status unknown \(AX probe unavailable\)/);

const fixturePath = path.join(os.tmpdir(), `dynamac-mac-context-command-${process.pid}.json`);
fs.writeFileSync(fixturePath, JSON.stringify({
  activeAppInfo: { name: "Finder", bundleIdentifier: "com.apple.finder", pid: 101 },
  activeWindowTitle: "Downloads",
  accessibilityPermission: true,
  screenRecordingPermission: true,
  uiTreeContext: {
    available: true,
    summary: "Front window for Finder: Downloads",
    nodes: [{ role: "application", title: "Finder" }, { role: "window", title: "Downloads" }]
  }
}));
const stdout = childProcess.execFileSync(process.execPath, [
  path.join(repoRoot, "scripts", "mac-context-status.js"),
  "--fixture",
  fixturePath,
  "--now",
  "2026-06-17T00:00:02.000Z"
], { encoding: "utf8" });
const commandPayload = JSON.parse(stdout);
assert.equal(commandPayload.statusSource, STATUS_SOURCE);
assert.equal(commandPayload.activeApp.name, "Finder");
assert.equal(commandPayload.activeWindow, "Downloads");
assert.equal(commandPayload.result.status, "success");
assert.equal(commandPayload.result.success, true);
assert.equal(commandPayload.result.activeContextAvailable, true);
assert.equal(commandPayload.result.permissionsAvailable, true);
assert.equal(commandPayload.permissionStatus.accessibility.status, "granted");
assert.equal(commandPayload.degradationState, "Full read-only active app/window context available.");
fs.unlinkSync(fixturePath);

console.log("mac-context-status command tests passed");
