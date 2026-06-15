#!/usr/bin/env node

const { applyDroppedFileToShelf, createShelfState } = require("../src/shelf-state");

const fixedNow = 1718323400000;
const result = applyDroppedFileToShelf(
  createShelfState({ now: fixedNow }),
  {
    filePath: " ",
    source: "user-runnable-invalid-fixture",
    observedAt: fixedNow + 10
  },
  { now: fixedNow + 20 }
);

if (result.ok) {
  console.log("DynaDrop invalid input fixture unexpectedly accepted input.");
  process.exit(0);
}

const payload = {
  fixture: "dynadrop-invalid-input",
  ok: result.ok,
  error: result.error,
  itemCount: result.state.items.length,
  active: result.state.active,
  persisted: result.state.persisted
};

console.error(`DynaDrop invalid input fixture failed as expected: ${JSON.stringify(payload)}`);
process.exit(1);
