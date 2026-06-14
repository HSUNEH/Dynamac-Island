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
const secondFilePath = path.join(tempDir, "fresh note.txt");

try {
  fs.writeFileSync(filePath, "hello shelf", "utf8");
  fs.writeFileSync(secondFilePath, "fresh shelf", "utf8");

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
  const clearedPayload = buildShelfStatusPayload(cleared);
  assert.deepEqual(clearedPayload, { statuses: [] }, "cleared shelf should serialize to no active shelf status");
  const clearedJson = JSON.stringify(clearedPayload);
  assert.equal(clearedJson.includes(filePath), false, "cleared payload must not leak previous dropped file path");
  assert.equal(clearedJson.includes("demo note.txt"), false, "cleared payload must not leak previous dropped file name");
  assert.equal(clearedJson.includes("fixture-drop"), false, "cleared payload must not leak previous dropped source metadata");

  const afterClear = addDroppedFileToShelf(cleared, {
    filePath: secondFilePath,
    type: "text/plain",
    source: "fresh-drop",
    observedAt: 1718323200500
  }, { now: 1718323200600 });
  assert.equal(afterClear.items.length, 1, "new drop after clear should start from an empty shelf");
  assert.equal(afterClear.items[0].itemId, "shelf-1718323200500-000", "new drop after clear should reset shelf item sequence");
  assert.equal(afterClear.active.status.fileCount, 1, "new drop after clear should not count previously cleared files");
  const afterClearPayloadJson = JSON.stringify(buildShelfStatusPayload(afterClear));
  assert.equal(afterClearPayloadJson.includes(secondFilePath), true, "new shelf payload should include the fresh dropped path");
  assert.equal(afterClearPayloadJson.includes(filePath), false, "new shelf payload after clear must not leak previous dropped path");
  assert.equal(afterClearPayloadJson.includes("demo note.txt"), false, "new shelf payload after clear must not leak previous dropped name");
  assert.equal(afterClearPayloadJson.includes("fixture-drop"), false, "new shelf payload after clear must not leak previous source metadata");

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
