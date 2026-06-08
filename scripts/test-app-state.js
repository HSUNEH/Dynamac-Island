#!/usr/bin/env node

const assert = require("node:assert");
const {
  createAppState,
  updateAppStateFromStatusPayload
} = require("../src/app-state");

const appState = createAppState();
const parsedWatchedJsonPayload = {
  ok: true,
  source: "status/status.json",
  statuses: [
    {
      agent: "Snuffles",
      state: "running",
      task: "Watching local status file",
      updatedAt: "2026-06-08T12:00:00.000Z",
      detail: "Snuffles is tailing the v1 JSON source."
    },
    {
      agent: "Codex",
      state: "success",
      task: "Applied app-state update",
      updatedAt: "2026-06-08T12:01:00.000Z",
      detail: "Codex mutated the shared app state."
    },
    {
      agent: "Ouroboros",
      state: "idle",
      task: "Awaiting next governed dispatch",
      updatedAt: "2026-06-08T12:02:00.000Z",
      detail: "Ouroboros is settled."
    }
  ],
  errors: []
};

const returnedState = updateAppStateFromStatusPayload(appState, parsedWatchedJsonPayload, {
  now: () => "2026-06-08T12:03:00.000Z"
});

assert.strictEqual(returnedState, appState, "update function should mutate and return the same app state object");
assert.deepEqual(appState.status, parsedWatchedJsonPayload, "parsed watched JSON payload should become current app status");
assert.equal(appState.lastAppliedAt, "2026-06-08T12:03:00.000Z");

const invalidPayload = {
  ok: false,
  source: "status/status.json",
  statuses: [],
  errors: ["Status JSON is invalid: Unexpected token } in JSON at position 42"]
};

updateAppStateFromStatusPayload(appState, invalidPayload, {
  now: () => "2026-06-08T12:04:00.000Z"
});

assert.deepEqual(appState.status, invalidPayload, "invalid watched JSON payload should remain visible in app state");
assert.equal(appState.lastAppliedAt, "2026-06-08T12:04:00.000Z");

assert.throws(
  () => updateAppStateFromStatusPayload(null, parsedWatchedJsonPayload),
  /appState must be an object/,
  "app state updates should reject a missing state object"
);
assert.throws(
  () => updateAppStateFromStatusPayload(appState, null),
  /status payload must be an object/,
  "app state updates should reject a missing parsed payload"
);

console.log("App state mutation test passed.");
