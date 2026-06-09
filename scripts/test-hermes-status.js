#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { writeHermesStatusSnapshot } = require("../src/hermes-status");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dynamac-hermes-status-"));
const hermesHome = path.join(tempDir, ".hermes");
const sessionsDir = path.join(hermesHome, "sessions");
fs.mkdirSync(sessionsDir, { recursive: true });

fs.writeFileSync(
  path.join(sessionsDir, "sessions.json"),
  JSON.stringify({
    "agent:main:discord:thread:1:1": {
      display_name: "build / dynamac island",
      updated_at: "2026-06-08T14:00:00.000Z",
      total_tokens: 12345,
      estimated_cost_usd: 0.42,
      suspended: false,
      resume_pending: false
    },
    "agent:main:discord:thread:2:2": {
      display_name: "older thread",
      updated_at: "2026-06-07T14:00:00.000Z",
      total_tokens: 10,
      suspended: true,
      resume_pending: true
    }
  })
);

const outputPath = path.join(tempDir, "status.json");
const result = writeHermesStatusSnapshot({
  hermesHome,
  outputPath,
  now: new Date("2026-06-08T14:05:00.000Z"),
  processList: [
    "sunbot 111 0.1 python -m hermes_cli.main gateway run --replace",
    "sunbot 222 0.1 python -m hermes_cli.main --profile build gateway run --replace"
  ].join("\n")
});

assert.equal(result.ok, true, "snapshot writer should return ok");
assert.equal(fs.existsSync(outputPath), true, "snapshot writer should create the status file");

const payload = JSON.parse(fs.readFileSync(outputPath, "utf8"));
assert.equal(Array.isArray(payload.statuses), true, "snapshot should follow the status schema");
assert.deepEqual(
  payload.statuses.map((status) => status.agent),
  ["Snuffles", "Hermes Gateway", "Active Session"],
  "snapshot should describe real local runtime signals instead of synthetic agents"
);
assert.equal(payload.statuses[0].state, "running");
assert.match(payload.statuses[0].detail, /2 Hermes gateway process/);
assert.equal(payload.statuses[1].state, "running");
assert.equal(payload.statuses[1].detail, "Profiles: build, default.");
assert.doesNotMatch(payload.statuses[1].detail, /\/Users\/|python -m hermes_cli/, "gateway detail should not expose full process paths or commands");
assert.equal(payload.statuses[2].task, "Latest Hermes session");
assert.match(payload.statuses[2].detail, /Session state: active/);
assert.doesNotMatch(payload.statuses[2].task, /build \/ dynamac island/, "session title should be hidden on the overlay");
assert.doesNotMatch(payload.statuses[2].detail, /12,345|\$0\.4200/, "token counts and costs should be hidden on the overlay");

console.log("Hermes status snapshot test passed.");
