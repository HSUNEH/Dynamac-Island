#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { validateStatusPayload } = require("../src/status-schema");
const {
  addDroppedFileToShelf,
  buildShelfStatusPayload,
  clearShelf,
  createShelfState
} = require("../src/shelf-state");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dynamac-shelf-state-"));
const filePath = path.join(tempDir, "demo note.txt");

try {
  fs.writeFileSync(filePath, "hello shelf", "utf8");

  const initial = createShelfState({ now: 1718323200000 });
  assert.deepEqual(initial, {
    version: 1,
    updatedAt: 1718323200000,
    items: [],
    active: null,
    persisted: false
  }, "shelf state should start empty and non-persistent by default");

  const first = addDroppedFileToShelf(initial, {
    filePath,
    type: "text/plain",
    source: "fixture-drop",
    observedAt: 1718323200100
  }, { now: 1718323200200 });

  assert.equal(first.items.length, 1, "one valid dropped file should be stored in shelf state");
  assert.equal(first.updatedAt, 1718323200200);
  assert.equal(first.persisted, false, "DynaDrop shelf state should not persist by default");

  const item = first.items[0];
  assert.equal(item.itemId, "shelf-1718323200100-000");
  assert.equal(item.path, filePath);
  assert.equal(item.name, "demo note.txt");
  assert.equal(item.type, "text/plain");
  assert.equal(item.size, 11);
  assert.equal(item.source, "fixture-drop");
  assert.equal(item.observedAt, 1718323200100);
  assert.equal(item.revealReadyPath, filePath);
  assert.equal(item.persisted, false);

  assert.equal(first.active.activityId, "shelf-1718323200100");
  assert.equal(first.active.activityType, "shelf");
  assert.equal(first.active.status.fileCount, 1);
  assert.equal(first.active.status.latestFile.name, "demo note.txt");
  assert.equal(first.active.metadata.fileCount, 1);
  assert.equal(first.active.metadata.latestFile.path, filePath);
  assert.equal(first.active.revealReadyPath, filePath);
  assert.equal(first.active.persisted, false);
  assert.deepEqual(first.active.compactSurface, {
    glyph: "tray.full",
    label: "Shelf · 1 file ready",
    preview: "demo note.txt"
  });

  const payload = buildShelfStatusPayload(first);
  assert.equal(payload.statuses[0].agent, "DynaShelf");
  assert.equal(payload.statuses[0].activityType, "shelf");
  assert.equal(payload.statuses[0].revealReadyPath, filePath);
  assert.deepEqual(payload.statuses[0].metadata.latestFile, {
    path: filePath,
    name: "demo note.txt",
    type: "text/plain",
    size: 11
  });
  const validation = validateStatusPayload(payload);
  assert.equal(validation.ok, true, "shelf status payload should satisfy the shared native status schema");
  assert.deepEqual(validation.errors, []);

  const cleared = clearShelf(first, { now: 1718323200300 });
  assert.deepEqual(cleared, {
    version: 1,
    updatedAt: 1718323200300,
    items: [],
    active: null,
    persisted: false
  }, "clearing shelf should remove file metadata and active shelf activity");

  assert.throws(
    () => addDroppedFileToShelf(initial, { filePath: path.join(tempDir, "missing.pdf"), observedAt: 1718323200400 }),
    /dropped file path must exist/,
    "missing file paths should fail predictably instead of implying reveal support"
  );
  assert.throws(
    () => addDroppedFileToShelf(initial, { filePath: tempDir, observedAt: 1718323200400 }),
    /dropped file path must be a file/,
    "directories should not enter the MVP shelf file state"
  );
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("Shelf state model test passed.");
