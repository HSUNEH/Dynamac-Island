#!/usr/bin/env node

const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildActivityRouterSnapshot } = require("../src/activity-router");
const { collectShelfStatus } = require("../src/shelf-file");

const repoRoot = path.resolve(__dirname, "..");
const nativePath = path.join(repoRoot, ".build", "dynamac-native");
const nativeSource = fs.readFileSync(path.join(repoRoot, "native", "DynamacIslandNative.swift"), "utf8");

assert.match(nativeSource, /registerForDraggedTypes\(\[\.fileURL\]\)/, "the island view should accept file drags");
assert.match(nativeSource, /override func performDragOperation/, "the island view should handle file drops");
assert.match(nativeSource, /activateFileViewerSelecting/, "the expanded Shelf should reveal dropped files in Finder");
assert.match(nativeSource, /childEnv\["DYNAMAC_SHELF_FILE"\] = shelfFilePath/, "the packaged writer should read the same shelf file native writes");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dynamac-native-shelf-drop-"));
const statusPath = path.join(tempDir, "status.json");
const shelfPath = path.join(tempDir, "shelf.json");
const firstFile = path.join(tempDir, "brief.key");
const secondFile = path.join(tempDir, "notes.txt");

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

try {
  fs.writeFileSync(firstFile, "keynote");
  fs.writeFileSync(secondFile, "notes");
  fs.writeFileSync(statusPath, `${JSON.stringify({ statuses: [] })}\n`);

  const dropOutput = runNative({
    DYNAMAC_NATIVE_SMOKE_DROP_PATHS: [firstFile, secondFile, firstFile, tempDir, path.join(tempDir, "missing.txt")].join("\n")
  });
  assert.match(dropOutput, /DYNAMAC_SHELF_DROP accepted=true/, "a drop with real files should be accepted");
  assert.match(dropOutput, new RegExp(`shelfFile=${shelfPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), "the shelf file should default to the status file directory");

  const shelf = JSON.parse(fs.readFileSync(shelfPath, "utf8"));
  assert.equal(shelf.version, 1);
  assert.deepEqual(shelf.items.map((item) => item.path), [firstFile, secondFile], "native should persist each existing dropped file once, skipping folders and missing paths");
  assert.ok(shelf.items.every((item) => Number.isFinite(item.droppedAt)), "dropped items should carry an epoch-ms droppedAt");

  const repeatOutput = runNative({ DYNAMAC_NATIVE_SMOKE_DROP_PATHS: secondFile });
  assert.match(repeatOutput, /DYNAMAC_SHELF_DROP accepted=true/, "re-dropping a shelved file is still accepted");
  assert.equal(JSON.parse(fs.readFileSync(shelfPath, "utf8")).items.length, 2, "re-dropping a shelved file should not duplicate it");

  const shelfStatus = collectShelfStatus({ shelfFilePath: shelfPath, now: new Date("2026-06-20T09:00:00.000Z") });
  const statuses = [shelfStatus];
  fs.writeFileSync(statusPath, `${JSON.stringify({ statuses, activityRouter: buildActivityRouterSnapshot(statuses) }, null, 2)}\n`);

  const compactOutput = runNative();
  assert.match(compactOutput, /active=activityRouter/);
  assert.match(compactOutput, /presentation=shelf/, "the dropped files should surface as the Shelf presentation");
  assert.match(compactOutput, /clickTargetActivity=shelf/, "clicking the compact Shelf should expand it");
  assert.match(compactOutput, /shelfFiles=brief\.key\|notes\.txt/, "native should decode the dropped file list for the expanded Shelf");
  assert.match(compactOutput, /renderedCompactText=tray\.full Shelf · 2 files ready/);

  const expandedOutput = runNative({ DYNAMAC_START_EXPANDED: "1", DYNAMAC_NATIVE_STATUS_DUMP_AFTER_MS: "180" });
  assert.match(expandedOutput, /presentation=shelf[^\n]+expanded=true/, "the Shelf should stay routed after expanding");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("Native shelf drop contract test passed.");
