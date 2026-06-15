#!/usr/bin/env node

const assert = require("node:assert");
const { validateStatusPayload } = require("../src/status-schema");
const {
  applyVolumeHudInputChange,
  buildVolumeHudStatusPayload,
  createInitialVolumeHudCompactActivity,
  createVolumeHudState,
  deserializeVolumeHudState,
  expireVolumeHudState,
  serializeVolumeHudState,
  updateVisibleVolumeHudState,
  volumeHudToNativeStatus
} = require("../src/volume-hud-status");

const initial = createVolumeHudState();
assert.deepEqual(initial, { active: null }, "volume HUD starts with no active transient status");
assert.deepEqual(buildVolumeHudStatusPayload(initial), { statuses: [] }, "inactive volume HUD should not emit a status item");

const initialCompactActivity = createInitialVolumeHudCompactActivity({
  level: 25,
  muted: false,
  deviceName: "MacBook Pro Speakers",
  source: "fixture-volume-observer",
  observedAt: 1718323199000
});
assert.equal(initialCompactActivity.activityType, "volume", "initial compact state should expose a volume activity");
assert.equal(initialCompactActivity.isTransient, true, "initial compact state should be transient");
assert.equal(initialCompactActivity.persisted, false, "initial compact state should not persist by default");
assert.equal(initialCompactActivity.status.direction, "initial", "initial compact state should mark first observed level as initial");
assert.deepEqual(initialCompactActivity.compactSurface, {
  glyph: "speaker",
  label: "25%",
  progress: 0.25
}, "initial compact state should show the observed volume level");
assert.equal(initialCompactActivity.expiresAt, 1718323200600, "initial compact state should expire after the default HUD window");

const first = applyVolumeHudInputChange(initial, {
  level: 20,
  muted: false,
  deviceName: "MacBook Pro Speakers",
  source: "fixture-volume-observer",
  observedAt: 1718323200000
});

assert.deepEqual(first.active, {
  activityId: "volume-1718323200000",
  activityType: "volume",
  priority: 90,
  createdAt: 1718323200000,
  updatedAt: 1718323200000,
  expiresAt: 1718323201600,
  isTransient: true,
  status: {
    level: 20,
    muted: false,
    previousLevel: null,
    direction: "initial",
    displayText: "20%"
  },
  compactSurface: {
    glyph: "speaker",
    label: "20%",
    progress: 0.2
  },
  expandedSurface: {
    title: "Volume",
    subtitle: "MacBook Pro Speakers · 20%",
    valueLabel: "20%"
  },
  source: "fixture-volume-observer",
  metadata: {
    deviceName: "MacBook Pro Speakers",
    inputKind: "volume",
    rawLevel: 20,
    rawMuted: false
  },
  revealReadyPath: "",
  persisted: false
}, "first observed volume input should create a deterministic transient activity");

const louder = applyVolumeHudInputChange(first, {
  level: 42.4,
  muted: false,
  deviceName: "Studio Display Speakers",
  source: "fixture-volume-observer",
  observedAt: 1718323200250
});

assert.equal(louder.active.activityId, "volume-1718323200000", "same burst should keep stable activity identity");
assert.equal(louder.active.createdAt, 1718323200000, "same burst should preserve creation timestamp");
assert.equal(louder.active.updatedAt, 1718323200250);
assert.equal(louder.active.expiresAt, 1718323201850);
assert.equal(louder.active.status.level, 42);
assert.equal(louder.active.status.previousLevel, 20);
assert.equal(louder.active.status.direction, "up");
assert.equal(louder.active.compactSurface.label, "42%");
assert.equal(louder.active.compactSurface.progress, 0.42);
assert.equal(louder.active.expandedSurface.subtitle, "Studio Display Speakers · 42%");

const refreshedVisibleVolume = updateVisibleVolumeHudState(louder, {
  level: 42,
  muted: false,
  deviceName: "Studio Display Speakers",
  source: "fixture-volume-observer",
  observedAt: 1718323200900
});
assert.equal(refreshedVisibleVolume.updateKind, "refreshed", "visible volume HUD should refresh an unexpired visible activity");
assert.equal(refreshedVisibleVolume.activity.activityId, "volume-1718323200000", "refreshed visible volume should keep the same activity identity");
assert.equal(refreshedVisibleVolume.activity.createdAt, 1718323200000, "refreshed visible volume should preserve the original creation timestamp");
assert.equal(refreshedVisibleVolume.activity.updatedAt, 1718323200900, "refreshed visible volume should advance updatedAt");
assert.equal(refreshedVisibleVolume.activity.expiresAt, 1718323202500, "refreshed visible volume should extend the visible HUD expiry");
assert.equal(refreshedVisibleVolume.activity.status.direction, "steady", "refreshing the same level should keep deterministic steady direction");
assert.equal(refreshedVisibleVolume.activity.compactSurface.label, "42%", "refreshed visible volume should keep the visible level label current");

const muted = applyVolumeHudInputChange(louder, {
  level: 42,
  muted: true,
  deviceName: "Studio Display Speakers",
  source: "fixture-volume-observer",
  observedAt: 1718323200400
});

assert.equal(muted.active.status.direction, "muted");
assert.equal(muted.active.status.displayText, "Muted");
assert.deepEqual(muted.active.compactSurface, {
  glyph: "speaker.slash",
  label: "Muted",
  progress: 0
});

const freshAfterExpiry = applyVolumeHudInputChange(muted, {
  level: 35,
  muted: false,
  deviceName: "Studio Display Speakers",
  source: "fixture-volume-observer",
  observedAt: 1718323202501
});

assert.equal(freshAfterExpiry.active.activityId, "volume-1718323202501", "new input after expiry should start a new activity instance");
assert.equal(freshAfterExpiry.active.status.direction, "initial", "expired previous level should not leak into a new burst");

const replacedVisibleVolume = updateVisibleVolumeHudState(refreshedVisibleVolume.state, {
  level: 18,
  muted: false,
  deviceName: "Studio Display Speakers",
  source: "fixture-volume-observer",
  observedAt: 1718323204101
});
assert.equal(replacedVisibleVolume.updateKind, "replaced", "expired visible volume HUD should be replaced by the next input");
assert.equal(replacedVisibleVolume.activity.activityId, "volume-1718323204101", "replacement should receive a fresh activity identity");
assert.equal(replacedVisibleVolume.activity.createdAt, 1718323204101, "replacement should start a fresh creation timestamp");
assert.equal(replacedVisibleVolume.activity.status.previousLevel, null, "replacement should not leak the expired previous level");
assert.equal(replacedVisibleVolume.activity.compactSurface.label, "18%", "replacement should expose the new visible volume level");

const stillVisibleAtExpiryBoundary = expireVolumeHudState(louder, { now: 1718323201850 });
assert.equal(stillVisibleAtExpiryBoundary.active.activityId, "volume-1718323200000", "volume HUD should remain visible through its exact expiry boundary");
assert.equal(stillVisibleAtExpiryBoundary.active.status.level, 42, "visible volume level should remain available before clearing");

const clearedAfterTransientLifetime = expireVolumeHudState(louder, { now: 1718323201851 });
assert.deepEqual(clearedAfterTransientLifetime, { active: null }, "volume HUD should clear level state after its transient lifetime");
assert.deepEqual(buildVolumeHudStatusPayload(clearedAfterTransientLifetime), { statuses: [] }, "cleared volume HUD should not emit a native status item");

const status = volumeHudToNativeStatus(louder.active);
assert.deepEqual(status, {
  agent: "Volume",
  state: "running",
  task: "Volume 42%",
  updatedAt: "2024-06-14T00:00:00.250Z",
  detail: "Output volume increased from 20% to 42%.",
  volumeHud: louder.active
}, "volume activity should serialize into the existing native status shape deterministically");

const payload = buildVolumeHudStatusPayload(louder);
const validation = validateStatusPayload(payload);
assert.equal(validation.ok, true, "volume HUD payload should pass shared status schema validation");
assert.deepEqual(validation.errors, []);
assert.equal(validation.statuses[0].volumeHud.persisted, false, "clipboard/history-like HUD state must not persist by default");

const serializedVolumeState = serializeVolumeHudState(louder);
assert.deepEqual(serializedVolumeState, {
  schema: "dynamac.volumeHud.state.v1",
  version: 1,
  active: louder.active
}, "volume HUD compact state should serialize through a stable schema envelope");

const serializedVolumeJson = JSON.stringify(serializedVolumeState);
assert.equal(
  serializedVolumeJson,
  "{\"schema\":\"dynamac.volumeHud.state.v1\",\"version\":1,\"active\":{\"activityId\":\"volume-1718323200000\",\"activityType\":\"volume\",\"priority\":90,\"createdAt\":1718323200000,\"updatedAt\":1718323200250,\"expiresAt\":1718323201850,\"isTransient\":true,\"status\":{\"level\":42,\"muted\":false,\"previousLevel\":20,\"direction\":\"up\",\"displayText\":\"42%\"},\"compactSurface\":{\"glyph\":\"speaker\",\"label\":\"42%\",\"progress\":0.42},\"expandedSurface\":{\"title\":\"Volume\",\"subtitle\":\"Studio Display Speakers · 42%\",\"valueLabel\":\"42%\"},\"source\":\"fixture-volume-observer\",\"metadata\":{\"deviceName\":\"Studio Display Speakers\",\"inputKind\":\"volume\",\"rawLevel\":42.4,\"rawMuted\":false},\"revealReadyPath\":\"\",\"persisted\":false}}",
  "volume HUD compact state JSON should be deterministic for fixture round-trip tests"
);

const deserializedVolumeState = deserializeVolumeHudState(JSON.parse(serializedVolumeJson));
assert.deepEqual(deserializedVolumeState, louder, "deserialized volume HUD compact state should match the source state exactly");
assert.equal(
  JSON.stringify(serializeVolumeHudState(deserializedVolumeState)),
  serializedVolumeJson,
  "volume HUD compact state should survive a deterministic serialize/deserialize/serialize round trip"
);
assert.deepEqual(serializeVolumeHudState(createVolumeHudState()), {
  schema: "dynamac.volumeHud.state.v1",
  version: 1,
  active: null
}, "inactive volume HUD compact state should serialize explicitly without persisted clipboard-like history");

assert.throws(
  () => applyVolumeHudInputChange(initial, { level: -1, observedAt: 1718323200000 }),
  /volume level must be between 0 and 100/,
  "invalid volume levels should fail predictably"
);
assert.throws(
  () => applyVolumeHudInputChange(initial, { level: 50, observedAt: "bad" }),
  /observedAt must be a finite timestamp/,
  "invalid observation timestamps should fail predictably"
);
assert.throws(
  () => expireVolumeHudState(louder, { now: "bad" }),
  /now must be a finite timestamp/,
  "invalid expiry timestamps should fail predictably"
);
assert.throws(
  () => deserializeVolumeHudState({ schema: "dynamac.volumeHud.state.v0", active: null }),
  /volumeHud state schema must be dynamac\.volumeHud\.state\.v1/,
  "volume HUD compact state should reject unknown serialization schemas"
);
assert.throws(
  () => deserializeVolumeHudState({ schema: "dynamac.volumeHud.state.v1", active: { ...louder.active, activityType: "brightness" } }),
  /volumeHud\.active\.activityType must be volume/,
  "volume HUD compact state should reject non-volume activities during deserialization"
);

console.log("Volume HUD status model test passed.");
