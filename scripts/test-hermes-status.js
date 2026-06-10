#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { writeHermesStatusSnapshot } = require("../src/hermes-status");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dynamac-hermes-status-"));
const hermesHome = path.join(tempDir, ".hermes");
const sessionsDir = path.join(hermesHome, "sessions");
const profilesDir = path.join(hermesHome, "profiles");
fs.mkdirSync(sessionsDir, { recursive: true });
fs.mkdirSync(path.join(profilesDir, "build"), { recursive: true });
fs.mkdirSync(path.join(profilesDir, "youtube"), { recursive: true });
fs.mkdirSync(path.join(profilesDir, "migam-cc", "sessions"), { recursive: true });

fs.writeFileSync(
  path.join(sessionsDir, "sessions.json"),
  JSON.stringify({
    "agent:main:discord:thread:1:1": {
      display_name: "build / dynamac island",
      updated_at: "2026-06-08T14:00:00.000Z",
      platform: "discord",
      total_tokens: 12345,
      estimated_cost_usd: 0.42,
      suspended: false,
      resume_pending: false
    }
  })
);

fs.writeFileSync(
  path.join(profilesDir, "migam-cc", "sessions", "sessions.json"),
  JSON.stringify({
    "agent:migam:discord:thread:1:1": {
      display_name: "private customer channel",
      updated_at: "2026-06-08T14:03:00.000Z",
      platform: "discord",
      total_tokens: 99999,
      estimated_cost_usd: 8.88,
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
  ["Hermes Runtime", "Installed Profiles", "Latest Session"],
  "snapshot should describe the installed Hermes environment instead of synthetic agents"
);
assert.equal(payload.statuses[0].state, "running");
assert.equal(payload.statuses[0].task, "2/4 profiles online");
assert.match(payload.statuses[0].detail, /Active gateway profiles: build, default/);
assert.match(payload.statuses[0].detail, /Installed profiles: build, default, migam-cc, youtube/);
assert.doesNotMatch(payload.statuses[0].detail, /\/Users\/|python -m hermes_cli/, "runtime detail should not expose full process paths or commands");
assert.equal(payload.statuses[1].task, "4 profiles installed");
assert.equal(payload.statuses[1].detail, "Profiles: build, default, migam-cc, youtube.");
assert.equal(payload.statuses[2].agent, "Latest Session");
assert.equal(payload.statuses[2].task, "migam-cc session suspended");
assert.match(payload.statuses[2].detail, /Latest local session is suspended, resume pending on discord/);
assert.doesNotMatch(payload.statuses[2].task, /private customer channel|build \/ dynamac island/, "session titles should be hidden on the overlay");
assert.doesNotMatch(payload.statuses[2].detail, /99,999|99999|\$8\.88|\/Users\//, "token counts, costs, and paths should be hidden on the overlay");

console.log("Hermes status snapshot test passed.");
