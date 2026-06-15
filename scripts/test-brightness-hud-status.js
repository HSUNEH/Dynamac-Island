#!/usr/bin/env node

const assert = require("node:assert");
const { validateStatusPayload } = require("../src/status-schema");
const {
  applyBrightnessHudInputChange,
  brightnessHudToNativeStatus,
  buildBrightnessHudStatusPayload,
  createInitialBrightnessHudCompactActivity,
  createBrightnessHudState,
  deserializeBrightnessHudState,
  expireBrightnessHudState,
  serializeBrightnessHudState,
  showBrightnessHud,
  updateVisibleBrightnessHudState
} = require("../src/brightness-hud-status");

const initial = createBrightnessHudState();
assert.deepEqual(initial, { active: null }, "brightness HUD starts with no active transient status");
assert.deepEqual(buildBrightnessHudStatusPayload(initial), { statuses: [] }, "inactive brightness HUD should not emit a status item");

const initialCompactActivity = createInitialBrightnessHudCompactActivity({
  level: 25,
  displayName: "Built-in Liquid Retina XDR",
  source: "fixture-brightness-observer",
  observedAt: 1718323199000
});
assert.equal(initialCompactActivity.activityType, "brightness", "initial compact state should expose a brightness activity");
assert.equal(initialCompactActivity.isTransient, true, "initial compact state should be transient");
assert.equal(initialCompactActivity.persisted, false, "initial compact state should not persist by default");
assert.equal(initialCompactActivity.status.direction, "initial", "initial compact state should mark first observed level as initial");
assert.deepEqual(initialCompactActivity.compactSurface, {
  glyph: "sun.max",
  label: "25%",
  progress: 0.25
}, "initial compact state should show the observed brightness level");
assert.equal(initialCompactActivity.expiresAt, 1718323200600, "initial compact state should expire after the default HUD window");

const shownBrightness = showBrightnessHud({
  level: 64,
  displayName: "Built-in Liquid Retina XDR",
  source: "fixture-brightness-observer",
  observedAt: 1718323199000
});
assert.equal(shownBrightness.activity.activityType, "brightness", "showing brightness should expose a brightness activity");
assert.equal(shownBrightness.activity.isTransient, true, "shown brightness HUD should be transient");
assert.equal(shownBrightness.activity.persisted, false, "shown brightness HUD should not persist by default");
assert.equal(shownBrightness.activity.status.level, 64, "shown brightness HUD should keep the requested brightness level");
assert.deepEqual(shownBrightness.activity.compactSurface, {
  glyph: "sun.max",
  label: "64%",
  progress: 0.64
}, "shown brightness HUD should create a visible compact brightness surface at the requested level");
assert.equal(shownBrightness.activity.expiresAt, 1718323200600, "shown brightness HUD should use the default transient window");
assert.deepEqual(shownBrightness.state, { active: shownBrightness.activity }, "showing brightness should return the state that owns the visible activity");
assert.equal(shownBrightness.status.task, "Brightness 64%", "shown brightness HUD should be serializable for the native status bridge");

const first = applyBrightnessHudInputChange(initial, {
  level: 12,
  displayName: "Built-in Liquid Retina XDR",
  source: "fixture-brightness-observer",
  observedAt: 1718323200000
});

assert.deepEqual(first.active, {
  activityId: "brightness-1718323200000",
  activityType: "brightness",
  priority: 90,
  createdAt: 1718323200000,
  updatedAt: 1718323200000,
  expiresAt: 1718323201600,
  isTransient: true,
  status: {
    level: 12,
    previousLevel: null,
    direction: "initial",
    displayText: "12%"
  },
  compactSurface: {
    glyph: "sun.max",
    label: "12%",
    progress: 0.12
  },
  expandedSurface: {
    title: "Brightness",
    subtitle: "Built-in Liquid Retina XDR · 12%",
    valueLabel: "12%"
  },
  source: "fixture-brightness-observer",
  metadata: {
    displayName: "Built-in Liquid Retina XDR",
    inputKind: "brightness",
    rawLevel: 12
  },
  revealReadyPath: "",
  persisted: false
}, "first observed brightness input should create a deterministic transient activity");

const brighter = applyBrightnessHudInputChange(first, {
  level: 75.4,
  displayName: "Studio Display",
  source: "fixture-brightness-observer",
  observedAt: 1718323200250
});

assert.equal(brighter.active.activityId, "brightness-1718323200000", "same burst should keep stable activity identity");
assert.equal(brighter.active.createdAt, 1718323200000, "same burst should preserve creation timestamp");
assert.equal(brighter.active.updatedAt, 1718323200250);
assert.equal(brighter.active.expiresAt, 1718323201850);
assert.equal(brighter.active.status.level, 75);
assert.equal(brighter.active.status.previousLevel, 12);
assert.equal(brighter.active.status.direction, "up");
assert.equal(brighter.active.compactSurface.label, "75%");
assert.equal(brighter.active.compactSurface.progress, 0.75);
assert.equal(brighter.active.expandedSurface.subtitle, "Studio Display · 75%");

const refreshedVisibleBrightness = updateVisibleBrightnessHudState(brighter, {
  level: 75,
  displayName: "Studio Display",
  source: "fixture-brightness-observer",
  observedAt: 1718323200900
});
assert.equal(refreshedVisibleBrightness.updateKind, "refreshed", "visible brightness HUD should refresh an unexpired visible activity");
assert.equal(refreshedVisibleBrightness.activity.activityId, "brightness-1718323200000", "refreshed visible brightness should keep one stable activity identity");
assert.equal(refreshedVisibleBrightness.activity.createdAt, 1718323200000, "refreshed visible brightness should preserve the original creation timestamp");
assert.equal(refreshedVisibleBrightness.activity.updatedAt, 1718323200900, "refreshed visible brightness should advance updatedAt");
assert.equal(refreshedVisibleBrightness.activity.expiresAt, 1718323202500, "refreshed visible brightness should extend the visible HUD expiry");
assert.equal(refreshedVisibleBrightness.activity.status.direction, "steady", "refreshing the same brightness should keep deterministic steady direction");
assert.equal(refreshedVisibleBrightness.activity.compactSurface.label, "75%", "refreshed visible brightness should keep the visible level label current");
assert.deepEqual(refreshedVisibleBrightness.state, { active: refreshedVisibleBrightness.activity }, "visible brightness updates should keep a single active state slot instead of overlapping activities");

const dimmer = applyBrightnessHudInputChange(brighter, {
  level: 8,
  displayName: "Studio Display",
  source: "fixture-brightness-observer",
  observedAt: 1718323200400
});
assert.equal(dimmer.active.status.direction, "down");
assert.equal(dimmer.active.compactSurface.glyph, "sun.min");

const freshAfterExpiry = applyBrightnessHudInputChange(dimmer, {
  level: 35,
  displayName: "Studio Display",
  source: "fixture-brightness-observer",
  observedAt: 1718323202501
});
assert.equal(freshAfterExpiry.active.activityId, "brightness-1718323202501", "new input after expiry should start a new activity instance");
assert.equal(freshAfterExpiry.active.status.direction, "initial", "expired previous level should not leak into a new burst");

const replacedVisibleBrightness = updateVisibleBrightnessHudState(refreshedVisibleBrightness.state, {
  level: 35,
  displayName: "Studio Display",
  source: "fixture-brightness-observer",
  observedAt: 1718323204101
});
assert.equal(replacedVisibleBrightness.updateKind, "replaced", "expired visible brightness HUD should be replaced by the next input");
assert.equal(replacedVisibleBrightness.activity.activityId, "brightness-1718323204101", "replacement should receive a fresh activity identity");
assert.equal(replacedVisibleBrightness.activity.createdAt, 1718323204101, "replacement should start a fresh creation timestamp");
assert.equal(replacedVisibleBrightness.activity.status.previousLevel, null, "replacement should not leak the expired previous brightness level");
assert.equal(replacedVisibleBrightness.activity.compactSurface.label, "35%", "replacement should expose the new visible brightness level");

const stillVisibleAtExpiryBoundary = expireBrightnessHudState(brighter, { now: 1718323201850 });
assert.equal(stillVisibleAtExpiryBoundary.active.activityId, "brightness-1718323200000", "brightness HUD should remain visible through its exact expiry boundary");
assert.equal(stillVisibleAtExpiryBoundary.active.status.level, 75, "visible brightness level should remain available before clearing");

const clearedAfterTransientLifetime = expireBrightnessHudState(brighter, { now: 1718323201851 });
assert.deepEqual(clearedAfterTransientLifetime, { active: null }, "brightness HUD should clear compact level state after its transient lifetime");
assert.deepEqual(buildBrightnessHudStatusPayload(clearedAfterTransientLifetime), { statuses: [] }, "cleared brightness HUD should not emit a native status item");

const status = brightnessHudToNativeStatus(brighter.active);
assert.deepEqual(status, {
  agent: "Brightness",
  state: "running",
  task: "Brightness 75%",
  updatedAt: "2024-06-14T00:00:00.250Z",
  detail: "Display brightness increased from 12% to 75%.",
  brightnessHud: brighter.active
}, "brightness activity should serialize into the existing native status shape deterministically");

const payload = buildBrightnessHudStatusPayload(brighter);
const validation = validateStatusPayload(payload);
assert.equal(validation.ok, true, "brightness HUD payload should pass shared status schema validation");
assert.deepEqual(validation.errors, []);
assert.equal(validation.statuses[0].brightnessHud.persisted, false, "brightness HUD state must not persist by default");

const serializedBrightnessState = serializeBrightnessHudState(brighter);
assert.deepEqual(serializedBrightnessState, {
  schema: "dynamac.brightnessHud.state.v1",
  version: 1,
  active: brighter.active
}, "brightness HUD compact state should serialize through a stable schema envelope");

const serializedBrightnessJson = JSON.stringify(serializedBrightnessState);
assert.equal(
  serializedBrightnessJson,
  "{\"schema\":\"dynamac.brightnessHud.state.v1\",\"version\":1,\"active\":{\"activityId\":\"brightness-1718323200000\",\"activityType\":\"brightness\",\"priority\":90,\"createdAt\":1718323200000,\"updatedAt\":1718323200250,\"expiresAt\":1718323201850,\"isTransient\":true,\"status\":{\"level\":75,\"previousLevel\":12,\"direction\":\"up\",\"displayText\":\"75%\"},\"compactSurface\":{\"glyph\":\"sun.max\",\"label\":\"75%\",\"progress\":0.75},\"expandedSurface\":{\"title\":\"Brightness\",\"subtitle\":\"Studio Display · 75%\",\"valueLabel\":\"75%\"},\"source\":\"fixture-brightness-observer\",\"metadata\":{\"displayName\":\"Studio Display\",\"inputKind\":\"brightness\",\"rawLevel\":75.4},\"revealReadyPath\":\"\",\"persisted\":false}}",
  "brightness HUD compact state JSON should be deterministic for fixture round-trip tests"
);

const deserializedBrightnessState = deserializeBrightnessHudState(JSON.parse(serializedBrightnessJson));
assert.deepEqual(deserializedBrightnessState, brighter, "deserialized brightness HUD compact state should match the source state exactly");
assert.equal(
  JSON.stringify(serializeBrightnessHudState(deserializedBrightnessState)),
  serializedBrightnessJson,
  "brightness HUD compact state should survive a deterministic serialize/deserialize/serialize round trip"
);
assert.deepEqual(serializeBrightnessHudState(createBrightnessHudState()), {
  schema: "dynamac.brightnessHud.state.v1",
  version: 1,
  active: null
}, "inactive brightness HUD compact state should serialize explicitly without persisted clipboard-like history");

assert.throws(
  () => applyBrightnessHudInputChange(initial, { level: 101, observedAt: 1718323200000 }),
  /brightness level must be between 0 and 100/,
  "invalid brightness levels should fail predictably"
);
assert.throws(
  () => applyBrightnessHudInputChange(initial, { level: 50, observedAt: "bad" }),
  /observedAt must be a finite timestamp/,
  "invalid observation timestamps should fail predictably"
);
assert.throws(
  () => expireBrightnessHudState(brighter, { now: "bad" }),
  /now must be a finite timestamp/,
  "invalid expiry timestamps should fail predictably"
);
assert.throws(
  () => deserializeBrightnessHudState({ schema: "dynamac.brightnessHud.state.v0", active: null }),
  /brightnessHud state schema must be dynamac\.brightnessHud\.state\.v1/,
  "brightness HUD compact state should reject unknown serialization schemas"
);
assert.throws(
  () => deserializeBrightnessHudState({ schema: "dynamac.brightnessHud.state.v1", active: { ...brighter.active, activityType: "volume" } }),
  /brightnessHud\.active\.activityType must be brightness/,
  "brightness HUD compact state should reject non-brightness activities during deserialization"
);

console.log("Brightness HUD status model test passed.");
