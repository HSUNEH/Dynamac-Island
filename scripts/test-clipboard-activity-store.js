#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const storePath = path.join(__dirname, "..", "src", "clipboard-activity-store.js");
const source = fs.readFileSync(storePath, "utf8");
assert.doesNotMatch(source, /require\("node:fs"\)|writeFile|readFile|localStorage|sessionStorage/, "clipboard activity store must remain in-memory only");
const activityPath = path.join(__dirname, "..", "src", "clipboard-activity.js");
const activitySource = fs.readFileSync(activityPath, "utf8");
assert.doesNotMatch(
  activitySource,
  /require\("node:fs"\)|writeFile|appendFile|createWriteStream|localStorage|sessionStorage|indexedDB|sqlite|database/,
  "clipboard update core must not import or invoke persistence APIs"
);

const store = require("../src/clipboard-activity-store");
const { textSignature } = require("../src/clipboard-activity");
const { collectClipboardStatus } = require("../src/mac-activity-status");

function withPersistenceApisBlocked(callback) {
  const blockedFsMethods = [
    "writeFile",
    "writeFileSync",
    "appendFile",
    "appendFileSync",
    "createWriteStream",
    "mkdirSync",
    "renameSync",
    "copyFileSync",
    "openSync"
  ];
  const originals = new Map();
  const calls = [];
  for (const method of blockedFsMethods) {
    originals.set(method, fs[method]);
    fs[method] = (...args) => {
      calls.push({ api: `fs.${method}`, args });
      throw new Error(`clipboard update attempted persistent storage via fs.${method}`);
    };
  }

  const originalLocalStorage = global.localStorage;
  const originalSessionStorage = global.sessionStorage;
  const originalIndexedDB = global.indexedDB;
  const blockedStorage = (name) => ({
    getItem(key) {
      calls.push({ api: `${name}.getItem`, args: [key] });
      throw new Error(`clipboard update attempted persistent storage via ${name}.getItem`);
    },
    setItem(key, value) {
      calls.push({ api: `${name}.setItem`, args: [key, value] });
      throw new Error(`clipboard update attempted persistent storage via ${name}.setItem`);
    },
    removeItem(key) {
      calls.push({ api: `${name}.removeItem`, args: [key] });
      throw new Error(`clipboard update attempted persistent storage via ${name}.removeItem`);
    }
  });
  global.localStorage = blockedStorage("localStorage");
  global.sessionStorage = blockedStorage("sessionStorage");
  global.indexedDB = {
    open(name) {
      calls.push({ api: "indexedDB.open", args: [name] });
      throw new Error("clipboard update attempted persistent storage via indexedDB.open");
    }
  };

  try {
    const result = callback();
    assert.deepEqual(calls, [], "clipboard update processing must not call persistence APIs or storage mechanisms");
    return result;
  } finally {
    for (const [method, original] of originals) fs[method] = original;
    if (originalLocalStorage === undefined) delete global.localStorage;
    else global.localStorage = originalLocalStorage;
    if (originalSessionStorage === undefined) delete global.sessionStorage;
    else global.sessionStorage = originalSessionStorage;
    if (originalIndexedDB === undefined) delete global.indexedDB;
    else global.indexedDB = originalIndexedDB;
  }
}

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

const guarded = withPersistenceApisBlocked(() => {
  store.clearClipboardActivityStore();
  const storeResult = store.createClipboardActivity({
    plainText: "Clipboard privacy guard text",
    observedAt: now + 300,
    source: "persistence-guard-fixture",
    type: "text/plain"
  }, { now: now + 300 });
  const nativeResult = collectClipboardStatus({
    clipboardText: "Clipboard native guard text",
    clipboardActivityState: storeResult.state,
    clipboardObservedAt: now + 350,
    clipboardSource: "persistence-guard-fixture",
    clipboardType: "text/plain",
    now: new Date(now + 350)
  });
  return { storeResult, nativeResult };
});
assert.equal(guarded.storeResult.status.activityType, "clipboard", "guarded in-memory store update should still produce a clipboard activity");
assert.equal(guarded.nativeResult.activityType, "clipboard", "guarded native clipboard collection should still produce a clipboard status");
assert.equal(guarded.storeResult.state.active.persisted, false, "guarded clipboard state remains explicitly non-persistent");
assert.equal(guarded.nativeResult.persisted, false, "guarded native clipboard status remains explicitly non-persistent");

store.clearClipboardActivityStore();
const modulePath = require.resolve("../src/clipboard-activity-store");
delete require.cache[modulePath];
const reloadedStore = require("../src/clipboard-activity-store");
assert.deepEqual(reloadedStore.readClipboardActivityStore(), { lastSignature: "", active: null }, "module reload should not recover clipboard history from disk or restart state");

console.log("Clipboard activity in-memory store test passed.");
