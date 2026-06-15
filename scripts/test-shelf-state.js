#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { validateStatusPayload } = require("../src/status-schema");
const {
  addDroppedFileToShelf,
  addDroppedFilesToShelf,
  applyDroppedFileToShelf,
  buildShelfStatusPayload,
  buildShelfRevealStatus,
  clearShelf,
  createShelfState
} = require("../src/shelf-state");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dynamac-shelf-state-"));
const filePath = path.join(tempDir, "demo note.txt");
const secondFilePath = path.join(tempDir, "fresh note.txt");
const deferredRevealExecution = {
  canExecuteReveal: false,
  canOpen: false,
  executionState: "deferred",
  executionDetail: "Finder reveal/open execution is deferred until a safe app-mode native pattern is implemented."
};

try {
  fs.writeFileSync(filePath, "hello shelf", "utf8");
  fs.writeFileSync(secondFilePath, "fresh shelf", "utf8");

  const initial = createShelfState({ now: 1718323200000 });
  assert.deepEqual(initial, {
    version: 1,
    updatedAt: 1718323200000,
    items: [],
    active: null,
    lastError: null,
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
  assert.deepEqual(item.revealStatus, {
    state: "ready",
    canReveal: true,
    ...deferredRevealExecution,
    revealReadyPath: filePath,
    reason: "",
    detail: "Validated local file path is reveal-ready; Finder reveal/open execution is deferred.",
    updatedAt: 1718323200200,
    persisted: false
  }, "valid local shelf items should expose a ready path while deferring Finder reveal/open execution");
  assert.equal(item.persisted, false);

  assert.equal(first.active.activityId, "shelf-1718323200100");
  assert.equal(first.active.activityType, "shelf");
  assert.equal(first.active.status.fileCount, 1);
  assert.equal(first.active.status.latestFile.name, "demo note.txt");
  assert.deepEqual(first.active.status.revealStatus, item.revealStatus);
  assert.equal(first.active.metadata.fileCount, 1);
  assert.equal(first.active.metadata.latestFile.path, filePath);
  assert.deepEqual(first.active.metadata.revealStatus, item.revealStatus);
  assert.equal(first.active.revealReadyPath, filePath);
  assert.deepEqual(first.active.revealStatus, item.revealStatus);
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
  assert.deepEqual(payload.statuses[0].revealStatus, item.revealStatus, "native shelf status should expose ready reveal status beside revealReadyPath");
  assert.match(payload.statuses[0].detail, /reveal-ready/, "ready shelf status should describe reveal readiness without implying Finder reveal execution");
  assert.match(payload.statuses[0].detail, /Finder reveal\/open execution are deferred/, "native shelf status should explicitly defer Finder reveal/open execution");
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
    lastError: null,
    persisted: false
  }, "clearing shelf should remove file metadata and active shelf activity");
  const clearedPayload = buildShelfStatusPayload(cleared);
  assert.deepEqual(clearedPayload, { statuses: [] }, "cleared shelf should serialize to no active shelf status");
  const clearedJson = JSON.stringify(clearedPayload);
  assert.equal(clearedJson.includes(filePath), false, "cleared payload must not leak previous dropped file path");
  assert.equal(clearedJson.includes("demo note.txt"), false, "cleared payload must not leak previous dropped file name");
  assert.equal(clearedJson.includes("fixture-drop"), false, "cleared payload must not leak previous dropped source metadata");

  const unavailableReveal = buildShelfRevealStatus("", { now: 1718323200350 });
  assert.deepEqual(unavailableReveal, {
    state: "unavailable",
    canReveal: false,
    ...deferredRevealExecution,
    revealReadyPath: "",
    reason: "no-validated-path",
    detail: "No validated shelf file path is available for reveal.",
    updatedAt: 1718323200350,
    persisted: false
  }, "empty shelf reveal status should be explicit and unavailable");
  const missingReveal = buildShelfRevealStatus(path.join(tempDir, "missing-reveal.txt"), { now: 1718323200360 });
  assert.deepEqual(missingReveal, {
    state: "unavailable",
    canReveal: false,
    ...deferredRevealExecution,
    revealReadyPath: "",
    reason: "dropped-file-path-must-exist",
    detail: "dropped file path must exist",
    updatedAt: 1718323200360,
    persisted: false
  }, "missing shelf reveal paths should be unavailable instead of exposing a stale revealReadyPath");

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

  const beforeDisallowed = createShelfState(afterClear);
  assert.throws(
    () => addDroppedFileToShelf(afterClear, {
      filePath,
      type: "text/plain",
      source: "fixture-drop",
      observedAt: 1718323200700,
      allowed: false,
      disallowReason: "native-drag-capture-deferred"
    }, { now: 1718323200800 }),
    /dropped input is explicitly disallowed: native-drag-capture-deferred/,
    "explicitly disallowed dropped inputs should fail before adding shelf metadata"
  );
  assert.deepEqual(
    afterClear,
    beforeDisallowed,
    "explicitly disallowed dropped inputs must not mutate or add a shelf item"
  );
  assert.equal(afterClear.items.length, 1, "explicit disallow should leave the shelf item count unchanged");
  assert.equal(afterClear.items[0].itemId, "shelf-1718323200500-000", "explicit disallow should not consume a shelf item sequence");
  assert.equal(afterClear.active.status.fileCount, 1, "explicit disallow should not change active shelf activity metadata");

  const blankRecovery = applyDroppedFileToShelf(afterClear, {
    filePath: " ",
    source: "fixture-drop",
    observedAt: 1718323200820
  }, { now: 1718323200830 });
  const expectedBlankError = {
    code: "dropped-file-path-required",
    message: "dropped file path is required",
    inputKind: "filePath",
    observedAt: 1718323200820,
    updatedAt: 1718323200830,
    recoverable: true,
    revealStatus: {
      state: "unavailable",
      canReveal: false,
      ...deferredRevealExecution,
      revealReadyPath: "",
      reason: "no-validated-path",
      detail: "No validated shelf file path is available for reveal.",
      updatedAt: 1718323200830,
      persisted: false
    },
    persisted: false
  };
  assert.equal(blankRecovery.ok, false, "invalid dropped inputs should be represented as a recoverable shelf result");
  assert.deepEqual(blankRecovery.error, expectedBlankError, "invalid dropped inputs should expose a stable error value");
  assert.deepEqual(blankRecovery.state.lastError, expectedBlankError, "invalid dropped inputs should preserve the same stable error on shelf state");
  assert.equal(blankRecovery.state.items.length, 1, "invalid dropped inputs should not add shelf items while preserving error state");
  assert.deepEqual(blankRecovery.state.items, afterClear.items, "invalid dropped inputs should preserve previous shelf items exactly");
  assert.deepEqual(blankRecovery.state.active, afterClear.active, "invalid dropped inputs should preserve previous active shelf activity exactly");

  const repeatedBlankRecovery = applyDroppedFileToShelf(afterClear, {
    filePath: "",
    observedAt: 1718323200820
  }, { now: 1718323200830 });
  assert.deepEqual(
    repeatedBlankRecovery.state.lastError,
    expectedBlankError,
    "semantically identical invalid inputs should produce consistent shelf error values"
  );

  const recovered = applyDroppedFileToShelf(blankRecovery.state, {
    filePath,
    type: "text/plain",
    source: "recovery-drop",
    observedAt: 1718323200840
  }, { now: 1718323200850 });
  assert.equal(recovered.ok, true, "a valid drop after an invalid one should recover through the same model API");
  assert.equal(recovered.error, null, "successful recovery should not carry the previous error value");
  assert.equal(recovered.state.lastError, null, "successful recovery should clear the stable shelf error state");
  assert.equal(recovered.state.items.length, 2, "successful recovery should append the valid dropped file");
  assert.equal(recovered.state.items[1].itemId, "shelf-1718323200840-001", "successful recovery should use the next shelf sequence after preserved items");

  const beforeEmptyList = createShelfState(afterClear);
  assert.throws(
    () => addDroppedFilesToShelf(afterClear, [], { now: 1718323200900 }),
    /dropped input list must include at least one file path/,
    "empty dropped input lists should fail before adding shelf metadata"
  );
  assert.deepEqual(
    afterClear,
    beforeEmptyList,
    "empty dropped input lists must not mutate or add a shelf item"
  );
  assert.equal(afterClear.items.length, 1, "empty dropped input lists should leave the shelf item count unchanged");
  assert.equal(afterClear.items[0].itemId, "shelf-1718323200500-000", "empty dropped input lists should not consume a shelf item sequence");

  const beforeMixedBlankList = createShelfState(afterClear);
  assert.throws(
    () => addDroppedFilesToShelf(afterClear, [
      { filePath, type: "text/plain", observedAt: 1718323200950 },
      { filePath: " ", type: "text/plain", observedAt: 1718323200951 }
    ], { now: 1718323200960 }),
    /dropped file path is required/,
    "dropped input lists containing blank paths should fail before adding any shelf metadata"
  );
  assert.deepEqual(
    afterClear,
    beforeMixedBlankList,
    "dropped input lists containing blank paths must not partially add shelf items"
  );
  assert.equal(afterClear.items.length, 1, "dropped input lists containing blank paths should leave the shelf item count unchanged");
  assert.equal(afterClear.items[0].itemId, "shelf-1718323200500-000", "dropped input lists containing blank paths should not consume a shelf item sequence");

  for (const blankPath of ["", "   "]) {
    const beforeBlankPath = createShelfState(afterClear);
    assert.throws(
      () => addDroppedFileToShelf(afterClear, { filePath: blankPath, observedAt: 1718323201000 }, { now: 1718323201100 }),
      /dropped file path is required/,
      "blank dropped file paths should fail before adding shelf metadata"
    );
    assert.deepEqual(
      afterClear,
      beforeBlankPath,
      "blank dropped file paths must not mutate or add a shelf item"
    );
    assert.equal(afterClear.items.length, 1, "blank dropped file paths should leave the shelf item count unchanged");
    assert.equal(afterClear.items[0].itemId, "shelf-1718323200500-000", "blank dropped file paths should not consume a shelf item sequence");
  }

  const beforeMalformedPath = createShelfState(afterClear);
  assert.throws(
    () => addDroppedFileToShelf(afterClear, { filePath: `${tempDir}${path.sep}bad\0name.txt`, observedAt: 1718323201200 }, { now: 1718323201300 }),
    /dropped file path is malformed/,
    "malformed dropped file path strings should fail before adding shelf metadata"
  );
  assert.deepEqual(
    afterClear,
    beforeMalformedPath,
    "malformed dropped file path strings must not mutate or add a shelf item"
  );
  assert.equal(afterClear.items.length, 1, "malformed dropped file path strings should leave the shelf item count unchanged");
  assert.equal(afterClear.items[0].itemId, "shelf-1718323200500-000", "malformed dropped file path strings should not consume a shelf item sequence");

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
