#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { collectShelfStatus, readShelfFileItems, shelfStateFromFile } = require("../src/shelf-file");
const { buildMacActivityStatusPayload } = require("../src/mac-activity-status");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dynamac-shelf-file-"));
const shelfPath = path.join(tempDir, "shelf.json");
const firstFile = path.join(tempDir, "report.pdf");
const secondFile = path.join(tempDir, "photo.png");
const now = new Date("2026-06-20T09:00:00.000Z");

function payloadWithShelf(shelfFilePath) {
  return buildMacActivityStatusPayload({
    now,
    shelfFilePath,
    macContextStatus: null,
    mediaInfo: null,
    clipboardText: "",
    pmsetOutput: ""
  });
}

try {
  fs.writeFileSync(firstFile, "pdf bytes");
  fs.writeFileSync(secondFile, "png bytes");

  assert.deepEqual(readShelfFileItems(shelfPath), [], "a missing shelf file should read as an empty shelf");
  assert.equal(collectShelfStatus({ shelfFilePath: shelfPath, now }), null, "an empty shelf should not publish a status");
  assert.equal(collectShelfStatus({ now }), null, "no configured shelf file should not publish a status");

  fs.writeFileSync(shelfPath, "{not json");
  assert.equal(collectShelfStatus({ shelfFilePath: shelfPath, now }), null, "a corrupt shelf file should be ignored instead of failing the snapshot");
  assert.equal(payloadWithShelf(shelfPath).statuses.some((status) => status.activityType === "shelf"), false);

  fs.writeFileSync(shelfPath, JSON.stringify({
    version: 1,
    items: [
      { path: firstFile, droppedAt: 1781946000000 },
      { path: path.join(tempDir, "moved-away.txt"), droppedAt: 1781946000100 },
      { path: secondFile, droppedAt: 1781946000200 },
      { droppedAt: 1781946000300 }
    ]
  }));

  const state = shelfStateFromFile(shelfPath, { now });
  assert.deepEqual(state.items.map((item) => item.name), ["report.pdf", "photo.png"], "missing or malformed entries should be skipped while valid drops stay on the shelf");
  assert.equal(state.items[0].source, "native-drag");
  assert.equal(state.items[1].observedAt, 1781946000200, "droppedAt should become the shelf observation time");

  const status = collectShelfStatus({ shelfFilePath: shelfPath, now });
  assert.equal(status.agent, "DynaShelf");
  assert.equal(status.task, "Shelf · 2 files ready");
  assert.equal(status.revealReadyPath, secondFile, "the latest dropped file should be reveal-ready");
  assert.equal(status.revealStatus.canExecuteReveal, true, "native Finder reveal should be advertised once drag capture exists");
  assert.equal(status.revealStatus.canOpen, false, "opening files stays deferred");
  assert.deepEqual(status.shelfFiles, [
    { path: firstFile, name: "report.pdf" },
    { path: secondFile, name: "photo.png" }
  ]);

  const payload = payloadWithShelf(shelfPath);
  const shelfStatus = payload.statuses.find((item) => item.activityType === "shelf");
  assert.ok(shelfStatus, "the status writer payload should include the dropped-file shelf");
  assert.equal(shelfStatus.updatedAt, now.toISOString());
  assert.equal(payload.activityRouter.compactSurface.activityType, "shelf", "Activity Router should surface the shelf when nothing transient outranks it");
  assert.equal(payload.activityRouter.compactSurface.label, "Shelf · 2 files ready");
  assert.equal(payload.activityRouter.clickTargetActivity, "shelf");

  fs.writeFileSync(shelfPath, JSON.stringify({ version: 1, items: [] }));
  assert.equal(payloadWithShelf(shelfPath).statuses.some((item) => item.activityType === "shelf"), false, "clearing the shelf file should remove the shelf status");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("Shelf file status test passed.");
