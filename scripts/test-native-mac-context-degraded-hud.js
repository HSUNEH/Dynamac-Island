#!/usr/bin/env node

const assert = require("node:assert");
const childProcess = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const nativePath = path.join(repoRoot, ".build", "dynamac-native");
const statusPath = path.join(repoRoot, "fixtures", "mac-context-degraded-status.json");

function runNative(extraEnv = {}) {
  const result = childProcess.spawnSync(nativePath, {
    cwd: repoRoot,
    env: {
      ...process.env,
      DYNAMAC_NATIVE_SMOKE_TEST: "1",
      DYNAMAC_NATIVE_STATUS_DUMP: "1",
      DYNAMAC_STATUS_FILE: statusPath,
      ...extraEnv
    },
    encoding: "utf8",
    timeout: 5000
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

const compactOutput = runNative();
assert.match(compactOutput, /DYNAMAC_NATIVE_READY/, "native smoke path should report readiness");
assert.match(compactOutput, /DYNAMAC_STATUS_DUMP active=activityRouter/, "degraded Mac Context should still be routed into the HUD");
assert.match(compactOutput, /presentation=macContext/, "degraded Mac Context status should own the native HUD presentation");
assert.match(compactOutput, /routerCompactType=macContext/, "native dump should expose the routed Mac Context compact type");
assert.match(compactOutput, /routerCompactActivityId=mac-context-degraded-fixture/, "native dump should preserve degraded Mac Context activity id");
assert.match(compactOutput, /agent=Mac Context/, "native dump should preserve the Mac Context status agent");
assert.match(compactOutput, /statusState=warning/, "degraded Mac Context status should remain observable as a warning HUD activity");
assert.match(compactOutput, /task=Arc · window degraded/, "native dump should preserve degraded user-facing task text");
assert.match(compactOutput, /activeApp=Arc/, "native dump should expose the active app even when window context degrades");
assert.match(compactOutput, /activeWindow=/, "native dump should expose empty degraded active window state");
assert.match(compactOutput, /permissionAccessibility=denied/, "native dump should expose denied Accessibility status");
assert.match(compactOutput, /permissionScreenRecording=unknown/, "native dump should expose unknown Screen Recording status");
assert.match(compactOutput, /renderedCompactText=⚠ Arc/, "compact HUD text should visibly flag degraded Mac Context permission state");
assert.match(compactOutput, /renderedExpandedText=Arc · Window unavailable\\nAccessibility denied; front window title and UI tree are reduced until permission is granted in System Settings\. Screen Recording status unknown \(probe unavailable\); screenshot and screen-derived context stay disabled until the local probe succeeds\.\\nAX denied · Screen unknown\\nAccessibility denied; front window title and UI tree are reduced until permission is granted in System Settings\. Screen Recording status unknown \(probe unavailable\); screenshot and screen-derived context stay disabled until the local probe succeeds\./, "expanded HUD text should expose degradation and permission state returned by the status source");

const expandedOutput = runNative({
  DYNAMAC_START_EXPANDED: "1",
  DYNAMAC_NATIVE_STATUS_DUMP_AFTER_MS: "180"
});
assert.match(expandedOutput, /expanded=false/, "expanded smoke should include the initial compact degraded HUD state");
assert.match(expandedOutput, /active=activityRouter[^\n]+presentation=macContext[^\n]+expanded=true/, "degraded Mac Context routing should survive compact→expanded HUD rendering");
assert.match(expandedOutput, /renderedExpandedText=Arc · Window unavailable\\nAccessibility denied; front window title and UI tree are reduced until permission is granted in System Settings\. Screen Recording status unknown \(probe unavailable\); screenshot and screen-derived context stay disabled until the local probe succeeds\.\\nAX denied · Screen unknown\\nAccessibility denied; front window title and UI tree are reduced until permission is granted in System Settings\. Screen Recording status unknown \(probe unavailable\); screenshot and screen-derived context stay disabled until the local probe succeeds\./, "expanded degraded Mac Context HUD should visibly retain degradation and permission text after expansion");
assert.doesNotMatch(expandedOutput, /active=media[^\n]+expanded=true/, "expanded degraded Mac Context HUD should not fall back to Now Playing");

console.log("Native Mac Context degraded HUD output test passed.");
