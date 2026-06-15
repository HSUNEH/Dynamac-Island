#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const storePath = path.join(__dirname, "..", "src", "clipboard-activity-store.js");
const source = fs.readFileSync(storePath, "utf8");
assert.doesNotMatch(source, /require\("node:fs"\)|writeFile|readFile|localStorage|sessionStorage/, "clipboard activity store must remain in-memory only");

const store = require("../src/clipboard-activity-store");
const { textSignature } = require("../src/clipboard-activity");

const now = 1718323200000;

const initial = store.createClipboardActivityStore();
assert.deepEqual(initial, { lastSignature: "", active: null }, "in-memory clipboard store should start empty");
assert.deepEqual(store.readClipboardActivityStore(), initial, "read should return the current in-memory clipboard state");

const created = store.createClipboardActivity({
  plainText: "Clipboard store text",
  observedAt: now,
  source: "memory-store-fixture",
  type: "text/plain"
}, { now });

assert.equal(created.status.activityType, "clipboard", "creating from a fresh text read should emit clipboard activity status");
assert.equal(created.state.lastSignature, textSignature("Clipboard store text"));
assert.equal(created.state.active.activityType, "clipboard");
assert.equal(created.state.active.persisted, false, "clipboard activity store entries must not opt into persistence");
assert.equal(JSON.stringify(created.state).includes("plainText"), false, "clipboard store should never retain raw plainText fields");

const readBack = store.readClipboardActivityStore();
assert.deepEqual(readBack, created.state, "read should return the created in-memory state");
readBack.active.status.label = "mutated outside";
assert.notEqual(store.readClipboardActivityStore().active.status.label, "mutated outside", "read should return a defensive copy, not the mutable module state");

const duplicate = store.createClipboardActivity({
  plainText: "Clipboard store text",
  observedAt: now + 100,
  source: "memory-store-fixture",
  type: "text/plain"
}, { now: now + 100 });
assert.equal(duplicate.status.activityType, "clipboard", "store should replay the in-memory copied activity for duplicate reads before expiry");
assert.equal(duplicate.status.metadata.copiedState, "copied");
assert.equal(duplicate.state.active.activityId, created.state.active.activityId, "duplicate replay should keep the original copied activity instance");
assert.equal(duplicate.state.active.expiresAt, created.state.active.expiresAt, "duplicate replay must not extend clipboard visibility");

const expiredDuplicate = store.createClipboardActivity({
  plainText: "Clipboard store text",
  observedAt: now + 5001,
  source: "memory-store-fixture",
  type: "text/plain"
}, { now: now + 5001 });
assert.equal(expiredDuplicate.status.state, "idle", "store should move unchanged copied activity to idle after lifecycle expiry");
assert.equal(expiredDuplicate.status.task, "Clipboard expired", "store status should expose the copied-to-expired transition");
assert.equal(expiredDuplicate.status.metadata.copiedState, "expired");
assert.equal(expiredDuplicate.status.metadata.expiredActivityId, created.state.active.activityId);
assert.equal(expiredDuplicate.state.active, null, "expired clipboard activity should be cleared from in-memory compact eligibility");

const replacement = store.createClipboardActivity({
  plainText: "Clipboard replacement text",
  observedAt: now + 200,
  source: "memory-store-fixture",
  type: "text/plain"
}, { now: now + 200 });
const replacementSignature = textSignature("Clipboard replacement text");
const serializedReplacementState = JSON.stringify(replacement.state);
assert.equal(replacement.status.activityType, "clipboard", "changed clipboard store updates should emit a fresh active activity");
assert.equal(replacement.state.lastSignature, replacementSignature, "store should keep only the latest clipboard signature");
assert.notEqual(replacement.state.active.activityId, created.state.active.activityId, "changed clipboard store updates should replace the previous transient activity");
assert.equal(replacement.state.active.status.preview, "Clipboard replacement text", "store active activity should reflect only the latest copied preview");
assert.equal(serializedReplacementState.includes(textSignature("Clipboard store text")), false, "store state must not retain older clipboard fingerprints as history");
assert.equal(serializedReplacementState.includes("Clipboard store text"), false, "store state must not retain older clipboard previews after replacement");
assert.equal(Array.isArray(replacement.state.history), false, "store should not expose clipboard history");
assert.equal(Array.isArray(replacement.state.activities), false, "store should not expose accumulated clipboard activity lists");

const cleared = store.clearClipboardActivityStore();
assert.deepEqual(cleared, { lastSignature: "", active: null }, "clear should reset clipboard store memory");
assert.deepEqual(store.readClipboardActivityStore(), cleared, "read after clear should show no retained clipboard activity");

const afterClear = store.createClipboardActivity({
  plainText: "Clipboard store text",
  observedAt: now + 200,
  source: "memory-store-fixture",
  type: "text/plain"
}, { now: now + 200 });
assert.equal(afterClear.status.activityType, "clipboard", "same text should emit again after explicit in-memory clear");

store.clearClipboardActivityStore();
const modulePath = require.resolve("../src/clipboard-activity-store");
delete require.cache[modulePath];
const reloadedStore = require("../src/clipboard-activity-store");
assert.deepEqual(reloadedStore.readClipboardActivityStore(), { lastSignature: "", active: null }, "module reload should not recover clipboard history from disk or restart state");

console.log("Clipboard activity in-memory store test passed.");
