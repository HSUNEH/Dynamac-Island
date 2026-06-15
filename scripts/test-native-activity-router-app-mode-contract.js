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
assert.match(nativeSource, /var volumeHud: RoutedActivityInfo\?/, "native status items should decode DynaKeys volume HUD activity ids for exact app-mode routing");
assert.match(nativeSource, /status\.volumeHud\?\.activityId/, "native router binding should include embedded volume HUD activity ids");
assert.match(nativeSource, /var brightnessHud: RoutedActivityInfo\?/, "native status items should decode DynaKeys brightness HUD activity ids for exact app-mode routing");
assert.match(nativeSource, /status\.brightnessHud\?\.activityId/, "native router binding should include embedded brightness HUD activity ids");
assert.match(nativeSource, /var clipboardActivity: RoutedActivityInfo\?/, "native status items should decode DynaClip clipboard activity ids for exact app-mode routing");
assert.match(nativeSource, /status\.clipboardActivity\?\.activityId/, "native router binding should include embedded DynaClip activity ids");
assert.match(nativeSource, /var shelfActivity: RoutedActivityInfo\?/, "native status items should decode DynaDrop shelf activity ids for exact app-mode routing");
assert.match(nativeSource, /status\.shelfActivity\?\.activityId/, "native router binding should include embedded DynaDrop shelf activity ids");
assert.match(nativeSource, /var activityRouter: ActivityRouterSnapshot\?/, "native island view should retain the current Activity Router snapshot");
assert.match(nativeSource, /routedStatusForCompactSurface/, "native UI should resolve the routed compact surface before legacy Timer\/media fallback");
assert.match(nativeSource, /drawRoutedGenericActivity/, "native UI should have a simple generic compact\/expanded activity surface for routed DynaKeys\/DynaClip\/DynaShelf activities");
assert.match(nativeSource, /case "shelf", "drop": return "tray"/, "native generic activity renderer should map DynaDrop shelf routes to the tray glyph family");
assert.match(nativeSource, /compactText: "\\\(glyph\) \\\(label\)"/, "native generic activity renderer should expose a compact app-mode text contract for Shelf MVP");
assert.match(nativeSource, /expandedText: "\\\(label\)\\n\\\(status\.detail \?\? status\.task\)"/, "native generic activity renderer should expose an expanded app-mode detail contract for Shelf MVP");
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

const dynaClipEmbeddedPayload = {
  statuses: [
    {
      agent: "DynaClip",
      state: "running",
      task: "Copied older DynaClip text",
      detail: "older copied text must not win embedded clipboardActivity routing",
      updatedAt: "2026-06-15T00:00:07.000Z",
      metadata: {
        classification: "text",
        copied: true,
        copiedState: "copied",
        displayLabel: "Text copied · 44 chars",
        displayPreview: "older copied text must not win routing",
        displayGlyph: "doc.on.clipboard",
        hudKind: "copied",
        recentPlainTextChange: true
      },
      clipboardActivity: {
        activityId: "dynaclip-older-embedded-non-winner",
        activityType: "clipboard",
        priority: 500,
        createdAt: 1781481607000,
        updatedAt: 1781481607000,
        expiresAt: 1781481610000,
        isTransient: true,
        status: {
          label: "Text copied · 44 chars",
          preview: "older copied text must not win routing",
          classification: "text",
          characterCount: 44,
          copied: true
        },
        compactSurface: {
          glyph: "doc.on.clipboard",
          label: "Text copied · 44 chars",
          preview: "older copied text must not win routing",
          hudKind: "copied"
        },
        expandedSurface: {
          title: "Clipboard",
          subtitle: "Text copied · 44 chars",
          preview: "older copied text must not win routing",
          hudKind: "copied"
        },
        source: "fixture-dynaclip",
        metadata: {
          classification: "text",
          characterCount: 44,
          copied: true,
          copiedState: "copied",
          displayLabel: "Text copied · 44 chars",
          displayPreview: "older copied text must not win routing",
          displayGlyph: "doc.on.clipboard",
          hudKind: "copied",
          recentPlainTextChange: true
        },
        revealReadyPath: "",
        persisted: false
      },
      persisted: false
    },
    {
      agent: "DynaClip",
      state: "running",
      task: "Copied DynaClip code snippet",
      detail: "const routed = true;",
      updatedAt: "2026-06-15T00:00:08.000Z",
      metadata: {
        classification: "code",
        copied: true,
        copiedState: "copied",
        displayLabel: "Code copied · 20 chars",
        displayPreview: "const routed = true;",
        displayGlyph: "curlybraces",
        hudKind: "copied",
        recentPlainTextChange: true
      },
      clipboardActivity: {
        activityId: "dynaclip-embedded-router-winner",
        activityType: "clipboard",
        priority: 500,
        createdAt: 1781481608000,
        updatedAt: 1781481608000,
        expiresAt: 1781481611000,
        isTransient: true,
        status: {
          label: "Code copied · 20 chars",
          preview: "const routed = true;",
          classification: "code",
          characterCount: 20,
          copied: true
        },
        compactSurface: {
          glyph: "curlybraces",
          label: "Code copied · 20 chars",
          preview: "const routed = true;",
          hudKind: "copied"
        },
        expandedSurface: {
          title: "Clipboard",
          subtitle: "Code copied · 20 chars",
          preview: "const routed = true;",
          hudKind: "copied"
        },
        source: "fixture-dynaclip",
        metadata: {
          classification: "code",
          characterCount: 20,
          copied: true,
          copiedState: "copied",
          displayLabel: "Code copied · 20 chars",
          displayPreview: "const routed = true;",
          displayGlyph: "curlybraces",
          hudKind: "copied",
          recentPlainTextChange: true
        },
        revealReadyPath: "",
        persisted: false
      },
      persisted: false
    },
    {
      agent: "Timer",
      state: "running",
      task: "Timer · 5m",
      updatedAt: "2026-06-15T00:00:08.000Z",
      detail: "Timer fallback is present but DynaClip is routed compact.",
      timer: {
        id: "timer-dynaclip-non-winner",
        durationSeconds: 300,
        remainingSeconds: 210,
        state: "running",
        startedAt: "2026-06-15T00:00:00.000Z",
        updatedAt: "2026-06-15T00:00:08.000Z",
        displayText: "3m 30s",
        error: "",
        replacedPrevious: false
      }
    }
  ],
  activityRouter: {
    rankedActivities: [
      {
        activityId: "dynaclip-embedded-router-winner",
        activityType: "clipboard",
        priority: 500,
        createdAt: 1781481608000,
        updatedAt: 1781481608000
      },
      {
        activityId: "dynaclip-older-embedded-non-winner",
        activityType: "clipboard",
        priority: 500,
        createdAt: 1781481607000,
        updatedAt: 1781481607000
      },
      {
        activityId: "timer-timer-dynaclip-non-winner",
        activityType: "timer",
        priority: 300,
        createdAt: 1781481600000,
        updatedAt: 1781481608000
      }
    ],
    compactSurface: {
      activityId: "dynaclip-embedded-router-winner",
      activityType: "clipboard",
      priority: 500,
      label: "Code copied · 20 chars",
      glyph: "curlybraces"
    }
  }
};
writePayload(dynaClipEmbeddedPayload);
const dynaClipCompactOutput = runNative();
assert.match(dynaClipCompactOutput, /active=activityRouter/, "native DynaClip smoke should use Activity Router in app mode");
assert.match(dynaClipCompactOutput, /presentation=clipboard/, "DynaClip copied HUD should surface as the compact app-mode presentation");
assert.match(dynaClipCompactOutput, /routerCompactType=clipboard/, "native dump should preserve the DynaClip compact activity type");
assert.match(dynaClipCompactOutput, /routerCompactActivityId=dynaclip-embedded-router-winner/, "native dump should preserve the exact embedded DynaClip compact activity id");
assert.match(dynaClipCompactOutput, /agent=DynaClip/, "native router resolution should bind the DynaClip status item");
assert.match(dynaClipCompactOutput, /task=Copied DynaClip code snippet/, "native app-mode dump should expose the routed DynaClip copied payload label");
assert.match(dynaClipCompactOutput, /renderedCompactText=curlybraces Code copied · 20 chars/, "compact app-mode rendering should show the DynaClip glyph and copied HUD label");
assert.match(dynaClipCompactOutput, /renderedExpandedText=Code copied · 20 chars\\nconst routed = true;/, "compact smoke dump should expose the expanded DynaClip preview contract even before expansion");
assert.match(dynaClipCompactOutput, /expanded=false/, "DynaClip smoke should cover compact app-mode behavior");
assert.doesNotMatch(dynaClipCompactOutput, /task=Copied older DynaClip text/, "DynaClip routing must not select the first same-type status when compactSurface.activityId matches an embedded clipboardActivity id");
assert.doesNotMatch(dynaClipCompactOutput, /presentation=timer/, "legacy Timer presentation must not override routed DynaClip copied HUD");

const dynaClipExpandedOutput = runNative({
  DYNAMAC_START_EXPANDED: "1",
  DYNAMAC_NATIVE_STATUS_DUMP_AFTER_MS: "180"
});
assert.match(dynaClipExpandedOutput, /expanded=false/, "DynaClip expanded smoke should include the initial compact state");
assert.match(dynaClipExpandedOutput, /active=activityRouter[^\n]+presentation=clipboard[^\n]+expanded=true/, "DynaClip routing should survive compact→expanded app-mode transition");
assert.match(dynaClipExpandedOutput, /renderedCompactText=curlybraces Code copied · 20 chars/, "expanded smoke should retain the same routed DynaClip compact text contract");
assert.match(dynaClipExpandedOutput, /renderedExpandedText=Code copied · 20 chars\\nconst routed = true;/, "expanded app-mode rendering should show the copied label and clipboard preview rather than Timer fallback text");
assert.match(dynaClipExpandedOutput, /task=Copied DynaClip code snippet/, "expanded app-mode dump should retain the routed DynaClip copied payload");
assert.doesNotMatch(dynaClipExpandedOutput, /active=timer[^\n]+expanded=true/, "expanded transition should not fall back to Timer when router selected DynaClip");

const dynaKeysVolumePayload = {
  statuses: [
    {
      agent: "Volume",
      state: "running",
      task: "Volume 12%",
      updatedAt: "2026-06-15T00:00:03.000Z",
      detail: "Older volume HUD must not win exact app-mode routing.",
      volumeHud: {
        activityId: "volume-older-non-winner",
        activityType: "volume",
        priority: 90,
        createdAt: 1781481603000,
        updatedAt: 1781481603000,
        expiresAt: 1781481604600,
        isTransient: true,
        status: {
          level: 12,
          muted: false,
          previousLevel: null,
          direction: "initial",
          displayText: "12%"
        },
        compactSurface: {
          glyph: "speaker",
          label: "12%",
          progress: 0.12
        },
        expandedSurface: {
          title: "Volume",
          subtitle: "MacBook Pro Speakers · 12%",
          valueLabel: "12%"
        },
        source: "fixture-volume-observer",
        metadata: {
          deviceName: "MacBook Pro Speakers",
          inputKind: "volume",
          rawLevel: 12,
          rawMuted: false
        },
        revealReadyPath: "",
        persisted: false
      }
    },
    {
      agent: "Volume",
      state: "running",
      task: "Volume 61%",
      updatedAt: "2026-06-15T00:00:04.000Z",
      detail: "Output volume increased from 12% to 61%.",
      volumeHud: {
        activityId: "volume-exact-router-winner",
        activityType: "volume",
        priority: 90,
        createdAt: 1781481604000,
        updatedAt: 1781481604000,
        expiresAt: 1781481605600,
        isTransient: true,
        status: {
          level: 61,
          muted: false,
          previousLevel: 12,
          direction: "up",
          displayText: "61%"
        },
        compactSurface: {
          glyph: "speaker",
          label: "61%",
          progress: 0.61
        },
        expandedSurface: {
          title: "Volume",
          subtitle: "MacBook Pro Speakers · 61%",
          valueLabel: "61%"
        },
        source: "fixture-volume-observer",
        metadata: {
          deviceName: "MacBook Pro Speakers",
          inputKind: "volume",
          rawLevel: 61,
          rawMuted: false
        },
        revealReadyPath: "",
        persisted: false
      }
    },
    {
      agent: "Timer",
      state: "running",
      task: "Timer · 5m",
      updatedAt: "2026-06-15T00:00:04.000Z",
      detail: "Timer fallback is present but DynaKeys volume is routed compact.",
      timer: {
        id: "timer-dynakeys-volume-non-winner",
        durationSeconds: 300,
        remainingSeconds: 240,
        state: "running",
        startedAt: "2026-06-15T00:00:00.000Z",
        updatedAt: "2026-06-15T00:00:04.000Z",
        displayText: "4m 0s",
        error: "",
        replacedPrevious: false
      }
    }
  ],
  activityRouter: {
    rankedActivities: [
      {
        activityId: "volume-exact-router-winner",
        activityType: "volume",
        priority: 90,
        createdAt: 1781481604000,
        updatedAt: 1781481604000
      },
      {
        activityId: "timer-timer-dynakeys-volume-non-winner",
        activityType: "timer",
        priority: 300,
        createdAt: 1781481600000,
        updatedAt: 1781481604000
      }
    ],
    compactSurface: {
      activityId: "volume-exact-router-winner",
      activityType: "volume",
      priority: 90,
      label: "61%",
      glyph: "speaker"
    }
  }
};
writePayload(dynaKeysVolumePayload);
const dynaKeysVolumeCompactOutput = runNative();
assert.match(dynaKeysVolumeCompactOutput, /active=activityRouter/, "native DynaKeys volume smoke should use Activity Router in app mode");
assert.match(dynaKeysVolumeCompactOutput, /presentation=volume/, "DynaKeys volume HUD should surface as the compact app-mode presentation");
assert.match(dynaKeysVolumeCompactOutput, /routerCompactType=volume/, "native dump should preserve the DynaKeys volume compact activity type");
assert.match(dynaKeysVolumeCompactOutput, /routerCompactActivityId=volume-exact-router-winner/, "native dump should preserve the exact DynaKeys volume compact activity id");
assert.match(dynaKeysVolumeCompactOutput, /agent=Volume/, "native router resolution should bind the DynaKeys volume status item");
assert.match(dynaKeysVolumeCompactOutput, /task=Volume 61%/, "native app-mode dump should expose the routed volume level label");
assert.match(dynaKeysVolumeCompactOutput, /expanded=false/, "DynaKeys volume smoke should cover compact app-mode behavior");
assert.doesNotMatch(dynaKeysVolumeCompactOutput, /task=Volume 12%/, "DynaKeys volume routing must not select the first same-type status when compactSurface.activityId matches another status");
assert.doesNotMatch(dynaKeysVolumeCompactOutput, /presentation=timer/, "legacy Timer presentation must not override routed DynaKeys volume HUD");

const dynaKeysVolumeExpandedOutput = runNative({
  DYNAMAC_START_EXPANDED: "1",
  DYNAMAC_NATIVE_STATUS_DUMP_AFTER_MS: "180"
});
assert.match(dynaKeysVolumeExpandedOutput, /expanded=false/, "DynaKeys volume expanded smoke should include the initial compact state");
assert.match(dynaKeysVolumeExpandedOutput, /active=activityRouter[^\n]+presentation=volume[^\n]+expanded=true/, "DynaKeys volume routing should survive compact→expanded app-mode transition");
assert.match(dynaKeysVolumeExpandedOutput, /task=Volume 61%/, "expanded app-mode dump should retain the routed volume HUD status");
assert.doesNotMatch(dynaKeysVolumeExpandedOutput, /active=timer[^\n]+expanded=true/, "expanded transition should not fall back to Timer when router selected DynaKeys volume");

const dynaKeysBrightnessPayload = {
  statuses: [
    {
      agent: "Brightness",
      state: "running",
      task: "Brightness 18%",
      updatedAt: "2026-06-15T00:00:05.000Z",
      detail: "Older brightness HUD must not win exact app-mode routing.",
      brightnessHud: {
        activityId: "brightness-older-non-winner",
        activityType: "brightness",
        priority: 90,
        createdAt: 1781481605000,
        updatedAt: 1781481605000,
        expiresAt: 1781481606600,
        isTransient: true,
        status: {
          level: 18,
          previousLevel: null,
          direction: "initial",
          displayText: "18%"
        },
        compactSurface: {
          glyph: "sun",
          label: "18%",
          progress: 0.18
        },
        expandedSurface: {
          title: "Brightness",
          subtitle: "Built-in Display · 18%",
          valueLabel: "18%"
        },
        source: "fixture-brightness-observer",
        metadata: {
          displayName: "Built-in Display",
          inputKind: "brightness",
          rawLevel: 18
        },
        revealReadyPath: "",
        persisted: false
      }
    },
    {
      agent: "Brightness",
      state: "running",
      task: "Brightness 72%",
      updatedAt: "2026-06-15T00:00:06.000Z",
      detail: "Display brightness increased from 18% to 72%.",
      brightnessHud: {
        activityId: "brightness-exact-router-winner",
        activityType: "brightness",
        priority: 90,
        createdAt: 1781481606000,
        updatedAt: 1781481606000,
        expiresAt: 1781481607600,
        isTransient: true,
        status: {
          level: 72,
          previousLevel: 18,
          direction: "up",
          displayText: "72%"
        },
        compactSurface: {
          glyph: "sun",
          label: "72%",
          progress: 0.72
        },
        expandedSurface: {
          title: "Brightness",
          subtitle: "Built-in Display · 72%",
          valueLabel: "72%"
        },
        source: "fixture-brightness-observer",
        metadata: {
          displayName: "Built-in Display",
          inputKind: "brightness",
          rawLevel: 72
        },
        revealReadyPath: "",
        persisted: false
      }
    },
    {
      agent: "Timer",
      state: "running",
      task: "Timer · 5m",
      updatedAt: "2026-06-15T00:00:06.000Z",
      detail: "Timer fallback is present but DynaKeys brightness is routed compact.",
      timer: {
        id: "timer-dynakeys-brightness-non-winner",
        durationSeconds: 300,
        remainingSeconds: 180,
        state: "running",
        startedAt: "2026-06-15T00:00:00.000Z",
        updatedAt: "2026-06-15T00:00:06.000Z",
        displayText: "3m 0s",
        error: "",
        replacedPrevious: false
      }
    }
  ],
  activityRouter: {
    rankedActivities: [
      {
        activityId: "brightness-exact-router-winner",
        activityType: "brightness",
        priority: 90,
        createdAt: 1781481606000,
        updatedAt: 1781481606000
      },
      {
        activityId: "timer-timer-dynakeys-brightness-non-winner",
        activityType: "timer",
        priority: 300,
        createdAt: 1781481600000,
        updatedAt: 1781481606000
      }
    ],
    compactSurface: {
      activityId: "brightness-exact-router-winner",
      activityType: "brightness",
      priority: 90,
      label: "72%",
      glyph: "sun"
    }
  }
};
writePayload(dynaKeysBrightnessPayload);
const dynaKeysBrightnessCompactOutput = runNative();
assert.match(dynaKeysBrightnessCompactOutput, /active=activityRouter/, "native DynaKeys brightness smoke should use Activity Router in app mode");
assert.match(dynaKeysBrightnessCompactOutput, /presentation=brightness/, "DynaKeys brightness HUD should surface as the compact app-mode presentation");
assert.match(dynaKeysBrightnessCompactOutput, /routerCompactType=brightness/, "native dump should preserve the DynaKeys brightness compact activity type");
assert.match(dynaKeysBrightnessCompactOutput, /routerCompactActivityId=brightness-exact-router-winner/, "native dump should preserve the exact DynaKeys brightness compact activity id");
assert.match(dynaKeysBrightnessCompactOutput, /agent=Brightness/, "native router resolution should bind the DynaKeys brightness status item");
assert.match(dynaKeysBrightnessCompactOutput, /task=Brightness 72%/, "native app-mode dump should expose the routed brightness level label");
assert.match(dynaKeysBrightnessCompactOutput, /expanded=false/, "DynaKeys brightness smoke should cover compact app-mode behavior");
assert.doesNotMatch(dynaKeysBrightnessCompactOutput, /task=Brightness 18%/, "DynaKeys brightness routing must not select the first same-type status when compactSurface.activityId matches another status");
assert.doesNotMatch(dynaKeysBrightnessCompactOutput, /presentation=timer/, "legacy Timer presentation must not override routed DynaKeys brightness HUD");

const dynaKeysBrightnessExpandedOutput = runNative({
  DYNAMAC_START_EXPANDED: "1",
  DYNAMAC_NATIVE_STATUS_DUMP_AFTER_MS: "180"
});
assert.match(dynaKeysBrightnessExpandedOutput, /expanded=false/, "DynaKeys brightness expanded smoke should include the initial compact state");
assert.match(dynaKeysBrightnessExpandedOutput, /active=activityRouter[^\n]+presentation=brightness[^\n]+expanded=true/, "DynaKeys brightness routing should survive compact→expanded app-mode transition");
assert.match(dynaKeysBrightnessExpandedOutput, /task=Brightness 72%/, "expanded app-mode dump should retain the routed brightness HUD status");
assert.doesNotMatch(dynaKeysBrightnessExpandedOutput, /active=timer[^\n]+expanded=true/, "expanded transition should not fall back to Timer when router selected DynaKeys brightness");

const dynaDropShelfPayload = {
  statuses: [
    {
      agent: "DynaShelf",
      state: "running",
      task: "Shelf · 1 file ready",
      updatedAt: "2026-06-15T00:00:09.000Z",
      detail: "Older shelf metadata must not win exact app-mode routing.",
      revealReadyPath: "/tmp/dynamac-old.txt",
      revealStatus: {
        state: "ready",
        canReveal: true,
        canOpen: false,
        executionState: "deferred",
        revealReadyPath: "/tmp/dynamac-old.txt",
        reason: "validated-local-file",
        detail: "Validated shelf path is ready for future Finder reveal.",
        persisted: false
      },
      metadata: {
        fileCount: 1,
        latestFile: {
          itemId: "shelf-old-000",
          name: "dynamac-old.txt",
          path: "/tmp/dynamac-old.txt",
          revealReadyPath: "/tmp/dynamac-old.txt",
          type: "text/plain",
          size: 11
        }
      },
      shelfActivity: {
        activityId: "dynadrop-shelf-older-non-winner",
        activityType: "shelf",
        priority: 400,
        createdAt: 1781481609000,
        updatedAt: 1781481609000,
        expiresAt: null,
        isTransient: false,
        status: {
          fileCount: 1,
          label: "Shelf · 1 file ready"
        },
        compactSurface: {
          glyph: "tray.full",
          label: "Shelf · 1 file ready",
          preview: "dynamac-old.txt"
        },
        expandedSurface: {
          title: "Shelf",
          subtitle: "1 file ready for local reveal"
        },
        source: "fixture-dynadrop",
        metadata: {
          fileCount: 1
        },
        revealReadyPath: "/tmp/dynamac-old.txt",
        persisted: false
      },
      persisted: false
    },
    {
      agent: "DynaShelf",
      state: "running",
      task: "Shelf · 2 files ready",
      updatedAt: "2026-06-15T00:00:10.000Z",
      detail: "Local shelf metadata is reveal-ready; native drag capture and Finder reveal/open execution are deferred.",
      revealReadyPath: "/tmp/dynamac-final.png",
      revealStatus: {
        state: "ready",
        canReveal: true,
        canOpen: false,
        executionState: "deferred",
        revealReadyPath: "/tmp/dynamac-final.png",
        reason: "validated-local-file",
        detail: "Validated shelf path is ready for future Finder reveal.",
        persisted: false
      },
      metadata: {
        fileCount: 2,
        latestFile: {
          itemId: "shelf-final-001",
          name: "dynamac-final.png",
          path: "/tmp/dynamac-final.png",
          revealReadyPath: "/tmp/dynamac-final.png",
          type: "image/png",
          size: 2048
        }
      },
      shelfActivity: {
        activityId: "dynadrop-shelf-router-winner",
        activityType: "shelf",
        priority: 400,
        createdAt: 1781481610000,
        updatedAt: 1781481610000,
        expiresAt: null,
        isTransient: false,
        status: {
          fileCount: 2,
          label: "Shelf · 2 files ready"
        },
        compactSurface: {
          glyph: "tray.full",
          label: "Shelf · 2 files ready",
          preview: "dynamac-final.png"
        },
        expandedSurface: {
          title: "Shelf",
          subtitle: "2 files ready for local reveal"
        },
        source: "fixture-dynadrop",
        metadata: {
          fileCount: 2
        },
        revealReadyPath: "/tmp/dynamac-final.png",
        persisted: false
      },
      persisted: false
    },
    {
      agent: "Timer",
      state: "running",
      task: "Timer · 5m",
      updatedAt: "2026-06-15T00:00:10.000Z",
      detail: "Timer fallback is present but DynaDrop shelf is routed compact.",
      timer: {
        id: "timer-dynadrop-shelf-non-winner",
        durationSeconds: 300,
        remainingSeconds: 120,
        state: "running",
        startedAt: "2026-06-15T00:00:00.000Z",
        updatedAt: "2026-06-15T00:00:10.000Z",
        displayText: "2m 0s",
        error: "",
        replacedPrevious: false
      }
    }
  ],
  activityRouter: {
    rankedActivities: [
      {
        activityId: "dynadrop-shelf-router-winner",
        activityType: "shelf",
        priority: 400,
        createdAt: 1781481610000,
        updatedAt: 1781481610000
      },
      {
        activityId: "dynadrop-shelf-older-non-winner",
        activityType: "shelf",
        priority: 400,
        createdAt: 1781481609000,
        updatedAt: 1781481609000
      },
      {
        activityId: "timer-timer-dynadrop-shelf-non-winner",
        activityType: "timer",
        priority: 300,
        createdAt: 1781481600000,
        updatedAt: 1781481610000
      }
    ],
    compactSurface: {
      activityId: "dynadrop-shelf-router-winner",
      activityType: "shelf",
      priority: 400,
      label: "Shelf · 2 files ready",
      glyph: "tray.full"
    }
  }
};
writePayload(dynaDropShelfPayload);
const dynaDropShelfCompactOutput = runNative();
assert.match(dynaDropShelfCompactOutput, /active=activityRouter/, "native DynaDrop shelf smoke should use Activity Router in app mode");
assert.match(dynaDropShelfCompactOutput, /presentation=shelf/, "DynaDrop shelf should surface as the compact app-mode presentation");
assert.match(dynaDropShelfCompactOutput, /routerCompactType=shelf/, "native dump should preserve the DynaDrop shelf compact activity type");
assert.match(dynaDropShelfCompactOutput, /routerCompactActivityId=dynadrop-shelf-router-winner/, "native dump should preserve the exact embedded DynaDrop shelf compact activity id");
assert.match(dynaDropShelfCompactOutput, /agent=DynaShelf/, "native router resolution should bind the DynaDrop shelf status item");
assert.match(dynaDropShelfCompactOutput, /task=Shelf · 2 files ready/, "native app-mode dump should expose the routed DynaDrop shelf payload label");
assert.match(dynaDropShelfCompactOutput, /renderedCompactText=tray\.full Shelf · 2 files ready/, "compact app-mode rendering should show the DynaDrop tray glyph and shelf-ready label");
assert.match(dynaDropShelfCompactOutput, /renderedExpandedText=Shelf · 2 files ready\\nLocal shelf metadata is reveal-ready; native drag capture and Finder reveal\/open execution are deferred\./, "compact smoke dump should expose the expanded DynaDrop preview contract without implying native drag or Finder reveal execution works");
assert.doesNotMatch(dynaDropShelfCompactOutput, /renderedExpandedText=.*Drop files here|renderedExpandedText=.*Open in Finder|renderedExpandedText=.*Reveal in Finder/i, "expanded Shelf MVP app-mode rendering must keep native drag and Finder reveal/open actions deferred");
assert.match(dynaDropShelfCompactOutput, /expanded=false/, "DynaDrop shelf smoke should cover compact app-mode behavior");
assert.doesNotMatch(dynaDropShelfCompactOutput, /task=Shelf · 1 file ready/, "DynaDrop shelf routing must not select the first same-type status when compactSurface.activityId matches an embedded shelfActivity id");
assert.doesNotMatch(dynaDropShelfCompactOutput, /presentation=timer/, "legacy Timer presentation must not override routed DynaDrop shelf");

const dynaDropShelfExpandedOutput = runNative({
  DYNAMAC_START_EXPANDED: "1",
  DYNAMAC_NATIVE_STATUS_DUMP_AFTER_MS: "180"
});
assert.match(dynaDropShelfExpandedOutput, /expanded=false/, "DynaDrop shelf expanded smoke should include the initial compact state");
assert.match(dynaDropShelfExpandedOutput, /active=activityRouter[^\n]+presentation=shelf[^\n]+expanded=true/, "DynaDrop shelf routing should survive compact→expanded app-mode transition");
assert.match(dynaDropShelfExpandedOutput, /renderedCompactText=tray\.full Shelf · 2 files ready/, "expanded smoke should retain the same routed DynaDrop compact text contract");
assert.match(dynaDropShelfExpandedOutput, /renderedExpandedText=Shelf · 2 files ready\\nLocal shelf metadata is reveal-ready; native drag capture and Finder reveal\/open execution are deferred\./, "expanded app-mode rendering should show shelf metadata and honest deferred native behavior copy");
assert.doesNotMatch(dynaDropShelfExpandedOutput, /renderedExpandedText=.*Drop files here|renderedExpandedText=.*Open in Finder|renderedExpandedText=.*Reveal in Finder/i, "expanded Shelf MVP app-mode rendering must not advertise deferred native drag or Finder reveal actions");
assert.match(dynaDropShelfExpandedOutput, /task=Shelf · 2 files ready/, "expanded app-mode dump should retain the routed DynaDrop shelf payload");
assert.doesNotMatch(dynaDropShelfExpandedOutput, /active=timer[^\n]+expanded=true/, "expanded transition should not fall back to Timer when router selected DynaDrop shelf");

fs.rmSync(tempDir, { recursive: true, force: true });

console.log("Native Activity Router app-mode transition contract test passed.");
