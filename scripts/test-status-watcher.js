#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createJsonStatusWatcher } = require("../src/status-watcher");

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function statusFor(state) {
  return {
    statuses: [
      {
        agent: "Codex",
        state,
        task: `Codex is ${state}`,
        updatedAt: "2026-06-08T12:00:00.000Z",
        detail: `Watcher parsed a ${state} Codex status.`
      }
    ]
  };
}

async function waitForReloads(reloads, expectedCount) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 2500) {
    if (reloads.length >= expectedCount) {
      return;
    }

    await wait(25);
  }

  assert.fail(`Expected ${expectedCount} reload trigger(s), received ${reloads.length}`);
}

async function run() {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "dynamac-status-watcher-"));
  const statusPath = path.join(temporaryDirectory, "status.json");
  const unrelatedPath = path.join(temporaryDirectory, "other.json");
  const reloads = [];

  fs.writeFileSync(statusPath, JSON.stringify(statusFor("idle")), "utf8");

  const watcher = createJsonStatusWatcher({
    statusPath,
    debounceMs: 25,
    pollIntervalMs: 25,
    onReload(event) {
      reloads.push(event);
    }
  });

  try {
    await wait(100);
    fs.writeFileSync(unrelatedPath, JSON.stringify({ ignored: true }), "utf8");
    await wait(100);
    assert.equal(reloads.length, 0, "unrelated JSON files should not trigger status reloads");

    fs.writeFileSync(statusPath, JSON.stringify(statusFor("running")), "utf8");
    await waitForReloads(reloads, 1);

    assert.equal(reloads[0].statusPath, statusPath);
    assert.equal(reloads[0].filename, "status.json");
    assert.equal(reloads[0].payload.ok, true, "watched status edit should parse successfully");
    assert.deepEqual(
      reloads[0].payload.statuses,
      statusFor("running").statuses,
      "watched status edit should deliver the parsed updated payload"
    );
  } finally {
    watcher.close();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  console.log("Status watcher test passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
