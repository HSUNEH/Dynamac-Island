#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  addDroppedFileToShelf,
  addDroppedFilesToShelf,
  applyDroppedFileToShelf,
  buildShelfRevealStatus,
  createShelfState
} = require("../src/shelf-state");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dynamac-shelf-invalid-"));
const validPath = path.join(tempDir, "valid-drop.txt");
const dirPath = path.join(tempDir, "folder-drop");
const fixedNow = 1718323300000;
const deferredRevealExecution = {
  canExecuteReveal: false,
  canOpen: false,
  executionState: "deferred",
  executionDetail: "Finder reveal/open execution is deferred until a safe app-mode native pattern is implemented."
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertUnchanged(actual, expected, message) {
  assert.deepEqual(clone(actual), clone(expected), message);
}

try {
  fs.writeFileSync(validPath, "valid shelf input", "utf8");
  fs.mkdirSync(dirPath);

  const seeded = addDroppedFileToShelf(createShelfState({ now: fixedNow }), {
    filePath: validPath,
    type: "text/plain",
    source: "fixture-valid-drop",
    observedAt: fixedNow + 10
  }, { now: fixedNow + 20 });
  const seededSnapshot = createShelfState(seeded);

  const invalidDrops = [
    {
      name: "missing file path object",
      drop: {},
      expectedMessage: /dropped file path is required/,
      expectedCode: "dropped-file-path-required"
    },
    {
      name: "null drop",
      drop: null,
      expectedMessage: /dropped file path is required/,
      expectedCode: "dropped-file-path-required"
    },
    {
      name: "array drop",
      drop: [validPath],
      expectedMessage: /dropped file path is required/,
      expectedCode: "dropped-file-path-required"
    },
    {
      name: "blank path",
      drop: { filePath: "  ", observedAt: fixedNow + 30 },
      expectedMessage: /dropped file path is required/,
      expectedCode: "dropped-file-path-required"
    },
    {
      name: "malformed nul path",
      drop: { filePath: `${tempDir}${path.sep}bad\0name.txt`, observedAt: fixedNow + 40 },
      expectedMessage: /dropped file path is malformed/,
      expectedCode: "dropped-file-path-malformed"
    },
    {
      name: "missing path",
      drop: { filePath: path.join(tempDir, "missing.txt"), observedAt: fixedNow + 50 },
      expectedMessage: /dropped file path must exist/,
      expectedCode: "dropped-file-path-must-exist"
    },
    {
      name: "directory path",
      drop: { filePath: dirPath, observedAt: fixedNow + 60 },
      expectedMessage: /dropped file path must be a file/,
      expectedCode: "dropped-file-path-must-be-file"
    },
    {
      name: "explicitly disallowed drop",
      drop: {
        filePath: validPath,
        allowed: false,
        disallowReason: "native-drag-capture-deferred",
        observedAt: fixedNow + 70
      },
      expectedMessage: /dropped input is explicitly disallowed: native-drag-capture-deferred/,
      expectedCode: "dropped-input-disallowed"
    }
  ];

  for (const scenario of invalidDrops) {
    assert.throws(
      () => addDroppedFileToShelf(seeded, scenario.drop, { now: fixedNow + 100 }),
      scenario.expectedMessage,
      `${scenario.name} should throw a stable model error`
    );
    assertUnchanged(
      seeded,
      seededSnapshot,
      `${scenario.name} must not mutate existing shelf items or active activity`
    );

    const recovery = applyDroppedFileToShelf(seeded, scenario.drop, { now: fixedNow + 100 });
    assert.equal(recovery.ok, false, `${scenario.name} should return a recoverable invalid-input result`);
    assert.equal(recovery.error.code, scenario.expectedCode, `${scenario.name} should expose a stable error code`);
    assert.match(recovery.error.message, scenario.expectedMessage, `${scenario.name} should expose the model error message`);
    assert.equal(recovery.error.recoverable, true, `${scenario.name} should be recoverable`);
    assert.equal(recovery.error.persisted, false, `${scenario.name} error should not persist by default`);
    assert.deepEqual(recovery.error.revealStatus, {
      state: "unavailable",
      canReveal: false,
      ...deferredRevealExecution,
      revealReadyPath: "",
      reason: "no-validated-path",
      detail: "No validated shelf file path is available for reveal.",
      updatedAt: fixedNow + 100,
      persisted: false
    }, `${scenario.name} should not expose reveal-ready data`);
    assert.deepEqual(recovery.state.lastError, recovery.error, `${scenario.name} should store the stable error on state`);
    assert.deepEqual(recovery.state.items, seededSnapshot.items, `${scenario.name} should preserve prior shelf items`);
    assert.deepEqual(recovery.state.active, seededSnapshot.active, `${scenario.name} should preserve prior active shelf activity`);
    assert.equal(recovery.state.persisted, false, `${scenario.name} invalid state should remain non-persistent`);
  }

  assert.throws(
    () => addDroppedFileToShelf(seeded, { filePath: validPath, observedAt: Number.NaN }, { now: fixedNow + 110 }),
    /observedAt must be a finite timestamp/,
    "non-finite observedAt should be rejected before adding shelf metadata"
  );
  assertUnchanged(seeded, seededSnapshot, "non-finite observedAt must not mutate seeded shelf state");

  assert.throws(
    () => addDroppedFilesToShelf(seeded, [], { now: fixedNow + 120 }),
    /dropped input list must include at least one file path/,
    "empty dropped file lists should be rejected"
  );
  assertUnchanged(seeded, seededSnapshot, "empty dropped file lists must not mutate seeded shelf state");

  assert.throws(
    () => addDroppedFilesToShelf(seeded, [
      { filePath: validPath, observedAt: fixedNow + 130 },
      { filePath: path.join(tempDir, "missing-batch.txt"), observedAt: fixedNow + 131 }
    ], { now: fixedNow + 140 }),
    /dropped file path must exist/,
    "mixed valid and invalid batch drops should reject the whole batch"
  );
  assertUnchanged(seeded, seededSnapshot, "mixed invalid batches must not partially add shelf items");

  const malformedReveal = buildShelfRevealStatus(`${tempDir}${path.sep}bad\0name.txt`, { now: fixedNow + 150 });
  assert.deepEqual(malformedReveal, {
    state: "unavailable",
    canReveal: false,
    ...deferredRevealExecution,
    revealReadyPath: "",
    reason: "dropped-file-path-malformed",
    detail: "dropped file path is malformed",
    updatedAt: fixedNow + 150,
    persisted: false
  }, "invalid reveal inputs should stay unavailable and avoid revealReadyPath leakage");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("Shelf invalid input model test passed.");
