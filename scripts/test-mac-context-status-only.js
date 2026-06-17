#!/usr/bin/env node

const assert = require("node:assert");
const {
  collectMacContextStatusOnly,
  macPermissionStatusDegradationReasons,
  macPermissionStatusDegradationState
} = require("../src/mac-context-provider");

let accessibilityProbeCalls = 0;
let screenRecordingProbeCalls = 0;
const statusOnly = collectMacContextStatusOnly({
  get activeAppInfo() {
    throw new Error("status-only API must not read active app fixtures");
  },
  get activeWindowTitle() {
    throw new Error("status-only API must not read active window fixtures");
  },
  permissionProbes: {
    accessibility: () => {
      accessibilityProbeCalls += 1;
      return { ok: true, stdout: "denied" };
    },
    screenRecording: () => {
      screenRecordingProbeCalls += 1;
      return { ok: true, stdout: "unknown probe output" };
    }
  }
});

assert.equal(accessibilityProbeCalls, 1, "status-only API should invoke Accessibility permission probe once");
assert.equal(screenRecordingProbeCalls, 1, "status-only API should invoke Screen Recording permission probe once");
assert.equal(statusOnly.source, "local-macos-context-status-only");
assert.equal(statusOnly.statusSource, "src/mac-context-provider.js#collectMacContextStatusOnly");
assert.equal(statusOnly.activeApp, null, "status-only API should not synthesize active app context");
assert.equal(statusOnly.activeWindow, "", "status-only API should not synthesize active window context");
assert.deepEqual(statusOnly.uiTreeContext, {
  available: false,
  summary: "Status-only preflight did not request active app, active window, or Accessibility UI tree context.",
  nodes: []
});
assert.equal(statusOnly.permissionStatus.accessibility.status, "denied");
assert.equal(statusOnly.permissionStatus.accessibility.available, false);
assert.equal(statusOnly.permissionStatus.screenRecording.status, "unknown");
assert.equal(statusOnly.permissionStatus.screenRecording.available, false);
assert.match(statusOnly.degradationState, /Accessibility denied; active window title and UI tree context will stay reduced/);
assert.match(statusOnly.degradationState, /Screen Recording status unknown \(unknown probe output\)/);
assert.doesNotMatch(statusOnly.degradationState, /Active application unavailable/);
assert.doesNotMatch(statusOnly.degradationState, /Front window title unavailable/);

const granted = collectMacContextStatusOnly({
  permissionStatus: {
    accessibility: { status: "granted", diagnostic: "fixture" },
    screenRecording: { status: "granted", diagnostic: "fixture" }
  }
});
assert.equal(granted.permissionStatus.accessibility.available, true);
assert.equal(granted.permissionStatus.screenRecording.available, true);
assert.equal(
  granted.degradationState,
  "Permission preflight passed; active app/window retrieval has not been invoked by this status-only API."
);

assert.deepEqual(macPermissionStatusDegradationReasons({
  accessibility: { status: "unknown", diagnostic: "AX timeout", available: false },
  screenRecording: { status: "denied", diagnostic: "fixture", available: false }
}), [
  "Accessibility status unknown (AX timeout); active window title and UI tree context will stay reduced until the local probe succeeds.",
  "Screen Recording denied; screenshot and screen-derived context stay disabled."
]);
assert.match(
  macPermissionStatusDegradationState({
    accessibility: { status: "unknown", diagnostic: "AX timeout", available: false },
    screenRecording: { status: "unknown", diagnostic: "CG timeout", available: false }
  }),
  /Accessibility status unknown \(AX timeout\).*Screen Recording status unknown \(CG timeout\)/
);

console.log("mac-context-status-only tests passed");
