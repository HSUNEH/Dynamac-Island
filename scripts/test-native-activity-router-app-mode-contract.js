#!/usr/bin/env node

const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const nativePath = path.join(repoRoot, ".build", "dynamac-native");
const nativeSource = fs.readFileSync(path.join(repoRoot, "native", "DynamacIslandNative.swift"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));

assert.match(nativeSource, /struct ActivityRouterSnapshot: Decodable/, "native app-mode status payload should decode the Activity Router snapshot");
assert.match(nativeSource, /var activityId: String\?/, "native status items should decode top-level activity ids for exact router binding");
assert.match(nativeSource, /var activityRouter: ActivityRouterSnapshot\?/, "native island view should retain the current Activity Router snapshot");
assert.match(nativeSource, /routedStatusForCompactSurface/, "native UI should resolve the routed compact surface before legacy Timer\/media fallback");
assert.match(nativeSource, /drawRoutedGenericActivity/, "native UI should have a simple generic compact\/expanded activity surface for routed DynaKeys\/DynaClip\/DynaShelf activities");
assert.match(nativeSource, /replaceStatusPayload\(_ payload: StatusPayload\)/, "app-mode status reloads should update statuses and router atomically from the same payload");
assert.match(nativeSource, /expanded=.*islandView\?\.expanded == true/, "native smoke dumps should expose compact-vs-expanded transition state");
assert.match(
  packageJson.scripts.check,
  /test:native-activity-router-app-mode-contract/,
  "full npm check should include the Activity Router app-mode native contract test"
);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dynamac-native-activity-router-"));
const statusPath = path.join(tempDir, "activity-router-status.json");

const payload = {
  statuses: [
    {
      agent: "Timer",
      state: "running",
      task: "Timer · 5m",
      updatedAt: "2026-06-15T00:00:00.000Z",
      detail: "A running timer is present but must not win when Activity Router selects Clipboard.",
      timer: {
        id: "timer-native-router-non-winner",
        durationSeconds: 300,
        remainingSeconds: 270,
        state: "running",
        startedAt: "2026-06-15T00:00:00.000Z",
        updatedAt: "2026-06-15T00:00:00.000Z",
        displayText: "4m 30s",
        error: "",
        replacedPrevious: false
      }
    },
    {
      agent: "Clipboard",
      activityType: "clipboard",
      state: "running",
      task: "Copied URL",
      updatedAt: "2026-06-15T00:00:01.000Z",
      detail: "https://example.com/dynamac",
      metadata: {
        displayGlyph: "link",
        displayLabel: "Copied URL",
        displayPreview: "https://example.com/dynamac"
      },
      persisted: false
    }
  ],
  activityRouter: {
    rankedActivities: [
      {
        activityId: "clipboard-router-winner",
        activityType: "clipboard",
        priority: 500,
        createdAt: 1781481601000,
        updatedAt: 1781481601000
      },
      {
        activityId: "timer-timer-native-router-non-winner",
        activityType: "timer",
        priority: 300,
        createdAt: 1781481600000,
        updatedAt: 1781481600000
      }
    ],
    compactSurface: {
      activityId: "clipboard-router-winner",
      activityType: "clipboard",
      priority: 500,
      label: "Copied URL",
      glyph: "link"
    }
  }
};

function writePayload(nextPayload) {
  fs.writeFileSync(statusPath, `${JSON.stringify(nextPayload, null, 2)}\n`);
}

writePayload(payload);

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
  assert.match(result.stdout, /DYNAMAC_NATIVE_READY/, "native smoke path should report readiness");
  return result.stdout;
}

const compactOutput = runNative();
assert.match(compactOutput, /DYNAMAC_STATUS_DUMP active=activityRouter/, "native smoke should report the Activity Router as the active app-mode contract source");
assert.match(compactOutput, /presentation=clipboard/, "Activity Router compact selection should beat the legacy running Timer presentation");
assert.match(compactOutput, /routerCompactType=clipboard/, "native dump should preserve the routed compact activity type");
assert.match(compactOutput, /routerCompactActivityId=clipboard-router-winner/, "native dump should preserve the routed compact activity id");
assert.match(compactOutput, /expanded=false/, "default app-mode smoke dump should cover the compact transition state");
assert.match(compactOutput, /agent=Clipboard/, "native router resolution should bind the compact surface back to the Clipboard status item");
assert.doesNotMatch(compactOutput, /presentation=timer/, "legacy Timer presentation must not override the routed compact surface");

const expandedOutput = runNative({
  DYNAMAC_START_EXPANDED: "1",
  DYNAMAC_NATIVE_STATUS_DUMP_AFTER_MS: "180"
});
assert.match(expandedOutput, /expanded=false/, "expanded smoke run should still cover the initial compact app-mode state");
assert.match(expandedOutput, /expanded=true/, "expanded smoke run should cover the post-transition app-mode state");
assert.match(expandedOutput, /active=activityRouter[^\n]+presentation=clipboard[^\n]+expanded=true/, "Activity Router selection should survive the compact→expanded app-mode transition");
assert.doesNotMatch(expandedOutput, /active=timer[^\n]+expanded=true/, "expanded transition should not fall back to Timer when router selected Clipboard");

const duplicateTypePayload = {
  statuses: [
    {
      agent: "Clipboard",
      activityId: "clipboard-older-non-winner",
      activityType: "clipboard",
      state: "running",
      task: "Copied older text",
      detail: "first clipboard item must not win by type-only fallback",
      updatedAt: "2026-06-15T00:00:01.000Z",
      persisted: false
    },
    {
      agent: "Clipboard",
      activityId: "clipboard-exact-router-winner",
      activityType: "clipboard",
      state: "running",
      task: "Copied exact routed URL",
      detail: "https://example.com/exact-router-winner",
      updatedAt: "2026-06-15T00:00:02.000Z",
      persisted: false
    }
  ],
  activityRouter: {
    rankedActivities: [
      {
        activityId: "clipboard-exact-router-winner",
        activityType: "clipboard",
        priority: 500,
        createdAt: 1781481602000,
        updatedAt: 1781481602000
      },
      {
        activityId: "clipboard-older-non-winner",
        activityType: "clipboard",
        priority: 500,
        createdAt: 1781481601000,
        updatedAt: 1781481601000
      }
    ],
    compactSurface: {
      activityId: "clipboard-exact-router-winner",
      activityType: "clipboard",
      priority: 500,
      label: "Copied exact routed URL",
      glyph: "link"
    }
  }
};
writePayload(duplicateTypePayload);
const duplicateTypeOutput = runNative();
assert.match(duplicateTypeOutput, /active=activityRouter/, "native router smoke should stay active for duplicate activity-type routing");
assert.match(duplicateTypeOutput, /routerCompactActivityId=clipboard-exact-router-winner/, "native dump should preserve the exact routed compact id for duplicate activity types");
assert.match(duplicateTypeOutput, /task=Copied exact routed URL/, "native router resolution should bind by activityId before falling back to activityType");
assert.doesNotMatch(duplicateTypeOutput, /task=Copied older text/, "native router resolution must not select the first same-type status when compactSurface.activityId matches another status");

fs.rmSync(tempDir, { recursive: true, force: true });

console.log("Native Activity Router app-mode transition contract test passed.");
