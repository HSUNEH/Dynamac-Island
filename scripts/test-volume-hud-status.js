#!/usr/bin/env node

const assert = require("node:assert");
const { validateStatusPayload } = require("../src/status-schema");
const {
  applyVolumeHudInputChange,
  buildVolumeHudStatusPayload,
  createInitialVolumeHudCompactActivity,
  createVolumeHudState,
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

console.log("Volume HUD status model test passed.");
