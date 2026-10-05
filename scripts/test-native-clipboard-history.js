#!/usr/bin/env node

const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const nativePath = path.join(repoRoot, ".build", "dynamac-native");
const nativeSource = fs.readFileSync(path.join(repoRoot, "native", "DynamacIslandNative.swift"), "utf8");

assert.match(nativeSource, /var clipboardHistory: \[ClipboardHistoryEntry\]\?/, "native status items should decode DynaClip history entries");
assert.match(nativeSource, /final class ClipboardPasteboardCache/, "native app should keep restorable clip text in a memory-only pasteboard cache");
assert.match(nativeSource, /org\.nspasteboard\.ConcealedType/, "pasteboard cache should skip password-manager concealed clips");
assert.match(nativeSource, /clipboardCache\.restore\(entry\.signature\)/, "clicking a history row should restore that clip to the pasteboard");
assert.doesNotMatch(nativeSource, /CGEvent\(keyboardEventSource/, "history restore must not synthesize paste keystrokes");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dynamac-native-clipboard-history-"));
const statusPath = path.join(tempDir, "clipboard-history-status.json");

const history = [
  { signature: "a".repeat(40), preview: "latest copied text", classification: "text", characterCount: 18, copiedAt: 1781481609000 },
  { signature: "b".repeat(40), preview: "example.com/b", classification: "link", characterCount: 21, copiedAt: 1781481608000 },
  { signature: "c".repeat(40), preview: "const older = true;", classification: "code", characterCount: 19, copiedAt: 1781481607000 }
];

fs.writeFileSync(statusPath, `${JSON.stringify({
  statuses: [
    {
      agent: "Clipboard",
      activityId: "clipboard-history-router-winner",
      activityType: "clipboard",
      state: "running",
      task: "Text copied · 18 chars",
      detail: "latest copied text",
      updatedAt: "2026-06-15T00:00:09.000Z",
      clipboardActivity: { activityId: "clipboard-history-router-winner", activityType: "clipboard" },
      clipboardHistory: history
    }
  ],
  activityRouter: {
    rankedActivities: [
      { activityId: "clipboard-history-router-winner", activityType: "clipboard", priority: 500, createdAt: 1781481609000, updatedAt: 1781481609000 }
    ],
    compactSurface: {
      activityId: "clipboard-history-router-winner",
      activityType: "clipboard",
      priority: 500,
      label: "Text copied · 18 chars",
      glyph: "doc.on.clipboard"
    }
  }
}, null, 2)}\n`);

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
assert.match(compactOutput, /presentation=clipboard/, "clipboard should be the routed presentation");
assert.match(compactOutput, /renderedClipboardHistory=example\.com\/b\\nconst older = true;/, "history rows should list earlier clips, skipping the current copy");

const expandedOutput = runNative({ DYNAMAC_START_EXPANDED: "1", DYNAMAC_NATIVE_STATUS_DUMP_AFTER_MS: "180" });
assert.match(expandedOutput, /presentation=clipboard[^\n]+expanded=true[^\n]+renderedClipboardHistory=example\.com\/b\\nconst older = true;/, "expanded clipboard view should keep the history rows");

console.log("Native clipboard history contract test passed.");
