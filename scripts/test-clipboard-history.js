#!/usr/bin/env node

const assert = require("node:assert");
const {
  DEFAULT_RECENCY_MS,
  HISTORY_LIMIT,
  applyClipboardRead,
  createClipboardActivityState,
  textSignature
} = require("../src/clipboard-activity");

const now = Date.parse("2026-06-20T09:00:00.000Z");

function copy(state, text, at) {
  return applyClipboardRead(state, { plainText: text, observedAt: at, source: "fixture-clipboard", type: "text/plain" }, { now: at, recencyMs: DEFAULT_RECENCY_MS });
}

let result = { state: createClipboardActivityState() };
["alpha", "beta", "gamma"].forEach((text, index) => {
  result = copy(result.state, text, now + index * 1000);
});
assert.deepEqual(result.state.history.map((entry) => entry.preview), ["gamma", "beta", "alpha"], "history should list copies newest first");

const recopied = copy(result.state, "alpha", now + 4000);
assert.deepEqual(recopied.state.history.map((entry) => entry.preview), ["alpha", "gamma", "beta"], "re-copying an older clip should move it to the top instead of duplicating it");
assert.equal(recopied.status.activityType, "clipboard", "re-copying an older clip should still surface the copied HUD");

const expired = applyClipboardRead(recopied.state, { plainText: "alpha", observedAt: now + 4000, type: "text/plain" }, { now: now + 4000 + DEFAULT_RECENCY_MS + 1 });
assert.equal(expired.status.state, "idle", "copied HUD should still expire on schedule");
assert.deepEqual(expired.status.clipboardHistory.map((entry) => entry.preview), ["alpha", "gamma", "beta"], "history should outlive the transient copied HUD");

const emptied = applyClipboardRead(expired.state, { plainText: "", observedAt: now + 20000, type: "text/plain" }, { now: now + 20000 });
assert.equal(emptied.state.history.length, 3, "an empty clipboard read should not clear history");

result = { state: createClipboardActivityState() };
for (let index = 0; index < HISTORY_LIMIT + 5; index += 1) {
  result = copy(result.state, `clip ${index}`, now + index * 1000);
}
assert.equal(result.state.history.length, HISTORY_LIMIT, "history should stay bounded");
assert.equal(result.state.history[0].preview, `clip ${HISTORY_LIMIT + 4}`);
assert.equal(result.state.history[0].signature, textSignature(`clip ${HISTORY_LIMIT + 4}`), "history signatures should match the native pasteboard cache key");

const longText = "x".repeat(500);
const long = copy(createClipboardActivityState(), longText, now);
assert.ok(Array.from(long.state.history[0].preview).length <= 120, "history previews should stay truncated");
assert.equal(JSON.stringify(long.status).includes(longText), false, "status payload must never carry the full clipboard text");

const idle = applyClipboardRead(createClipboardActivityState(), { hasPlainText: false }, { now });
assert.equal(idle.status.clipboardHistory, undefined, "statuses without history should not add an empty history field");

console.log("Clipboard history test passed.");
