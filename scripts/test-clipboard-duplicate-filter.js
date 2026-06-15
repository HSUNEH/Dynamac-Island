#!/usr/bin/env node

const assert = require("node:assert");
const {
  DEFAULT_RECENCY_MS,
  applyClipboardRead,
  createClipboardActivityState,
  textSignature
} = require("../src/clipboard-activity");

const now = 1718323200000;
let state = createClipboardActivityState();

const first = applyClipboardRead(state, {
  plainText: "Copied once",
  observedAt: now,
  source: "duplicate-filter-fixture",
  type: "text/plain"
}, { now, recencyMs: DEFAULT_RECENCY_MS });

assert.equal(first.status.activityType, "clipboard", "first plain-text read should emit a clipboard activity");
assert.equal(first.status.state, "running");
assert.equal(first.state.lastSignature, textSignature("Copied once"));
assert.equal(first.state.active.activityId, `clipboard-copy-${now}-${textSignature("Copied once").slice(0, 12)}`);
assert.equal(first.state.active.metadata.copyEvent.eventType, "copy");
assert.equal(first.state.active.metadata.copyEvent.source, "duplicate-filter-fixture");
state = first.state;

const exactDuplicate = applyClipboardRead(state, {
  plainText: "Copied once",
  observedAt: now + 250,
  source: "duplicate-filter-fixture",
  type: "text/plain"
}, { now: now + 250, recencyMs: DEFAULT_RECENCY_MS });

assert.equal(exactDuplicate.status.state, "running", "exact duplicate should replay the active copied state until expiry");
assert.equal(exactDuplicate.status.activityType, "clipboard", "duplicate replay remains compact-eligible while the original copied activity is active");
assert.equal(exactDuplicate.status.metadata.recentPlainTextChange, true);
assert.equal(exactDuplicate.status.metadata.copiedState, "copied");
assert.equal(exactDuplicate.state.active.activityId, first.state.active.activityId, "duplicate replay should not create a new copied activity");
assert.equal(exactDuplicate.state.active.expiresAt, first.state.active.expiresAt, "duplicate replay must not extend clipboard visibility");
assert.equal(exactDuplicate.state.lastSignature, textSignature("Copied once"), "duplicate baseline should remain the copied text signature");
state = exactDuplicate.state;

const normalizedDuplicate = applyClipboardRead(state, {
  plainText: "  Copied once\n",
  observedAt: now + 500,
  source: "duplicate-filter-fixture",
  type: "text/plain"
}, { now: now + 500, recencyMs: DEFAULT_RECENCY_MS });

assert.equal(normalizedDuplicate.status.state, "running", "whitespace-normalized duplicate should replay the active copied state until expiry");
assert.equal(normalizedDuplicate.status.activityType, "clipboard");
assert.equal(normalizedDuplicate.state.active.activityId, first.state.active.activityId);
assert.equal(normalizedDuplicate.state.lastSignature, textSignature("Copied once"));
state = normalizedDuplicate.state;

const changed = applyClipboardRead(state, {
  plainText: "Copied twice",
  observedAt: now + 750,
  source: "duplicate-filter-fixture",
  type: "text/plain"
}, { now: now + 750, recencyMs: DEFAULT_RECENCY_MS });

assert.equal(changed.status.activityType, "clipboard", "new text after duplicates should emit again");
assert.equal(changed.status.task, "Text copied · 12 chars");
assert.equal(changed.status.metadata.recentPlainTextChange, true);
assert.equal(changed.state.lastSignature, textSignature("Copied twice"));

console.log("Clipboard duplicate filtering test passed.");
