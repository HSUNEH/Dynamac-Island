#!/usr/bin/env node

const assert = require("node:assert");
const childProcess = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const nativePath = path.join(repoRoot, ".build", "dynamac-native");
const statusPath = path.join(repoRoot, "fixtures", "mac-context-success-status.json");

const result = childProcess.spawnSync(nativePath, {
  cwd: repoRoot,
  env: {
    ...process.env,
    DYNAMAC_NATIVE_SMOKE_TEST: "1",
    DYNAMAC_NATIVE_STATUS_DUMP: "1",
    DYNAMAC_STATUS_FILE: statusPath
  },
  encoding: "utf8",
  timeout: 5000
});

assert.equal(result.status, 0, result.stderr || result.stdout);
assert.match(result.stdout, /DYNAMAC_NATIVE_READY/, "native smoke path should report readiness");
assert.match(result.stdout, /DYNAMAC_STATUS_DUMP active=activityRouter/, "Mac Context should be selected through the activity router for HUD display");
assert.match(result.stdout, /presentation=macContext/, "Mac Context success status should own the native HUD presentation");
assert.match(result.stdout, /routerCompactType=macContext/, "native dump should expose the routed Mac Context compact type");
assert.match(result.stdout, /routerCompactActivityId=mac-context-success-fixture/, "native dump should preserve the routed Mac Context activity id");
assert.match(result.stdout, /agent=Mac Context/, "native dump should preserve the Mac Context status agent");
assert.match(result.stdout, /statusState=running/, "success Mac Context status should remain a running HUD activity");
assert.match(result.stdout, /task=Arc · Dynamac Island · macOS-MCP notes/, "native dump should preserve user-facing active app/window task text");
assert.match(result.stdout, /activeApp=Arc/, "native dump should expose the active app returned by the status source");
assert.match(result.stdout, /activeWindow=Dynamac Island · macOS-MCP notes/, "native dump should expose the active window returned by the status source");
assert.match(result.stdout, /permissionAccessibility=granted/, "native dump should expose granted Accessibility status");
assert.match(result.stdout, /permissionScreenRecording=granted/, "native dump should expose granted Screen Recording status");
assert.match(result.stdout, /renderedCompactText=▣ Arc/, "native render smoke should expose compact HUD text derived from active app context");
assert.match(result.stdout, /renderedExpandedText=Arc · Dynamac Island · macOS-MCP notes\\nDynamac Island · macOS-MCP notes\\nAX granted · Screen granted\\nFull read-only active app\/window context available\./, "native render smoke should expose expanded HUD app/window, permission, and success status text");

console.log("Native Mac Context success HUD output test passed.");
