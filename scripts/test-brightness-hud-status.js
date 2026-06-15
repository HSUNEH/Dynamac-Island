#!/usr/bin/env node

const assert = require("node:assert");
const { validateStatusPayload } = require("../src/status-schema");
const {
  applyBrightnessHudInputChange,
  brightnessHudToNativeStatus,
  buildBrightnessHudStatusPayload,
  createBrightnessHudState,
  showBrightnessHud
} = require("../src/brightness-hud-status");

const initial = createBrightnessHudState();
assert.deepEqual(initial, { active: null }, "brightness HUD starts with no active transient status");
assert.deepEqual(buildBrightnessHudStatusPayload(initial), { statuses: [] }, "inactive brightness HUD should not emit a status item");

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

console.log("Brightness HUD status model test passed.");
