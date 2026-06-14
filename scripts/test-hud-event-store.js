#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createHudEventStore,
  readHudEventStore,
  reconstructHudActivityState,
  recordBrightnessHudEvent,
  recordVolumeHudEvent
} = require("../src/hud-event-store");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dynamac-hud-event-store-"));
const storePath = path.join(tempDir, "nested", "hud-events.json");

try {
  assert.deepEqual(
    createHudEventStore({ now: 1718323200000 }),
    {
      version: 1,
      updatedAt: 1718323200000,
      events: []
    },
    "empty HUD event store should be deterministic"
  );

  const first = recordVolumeHudEvent({
    outputPath: storePath,
    input: {
      level: 33.6,
      muted: false,
      deviceName: "MacBook Pro Speakers",
      source: "fixture-volume-observer",
      observedAt: 1718323200100
    },
    now: 1718323200200
  });

  assert.equal(first.outputPath, storePath, "volume HUD persistence should report the local store path");
  assert.equal(first.event.eventId, "hud-volume-1718323200100-000");
  assert.equal(first.event.activityType, "volume");
  assert.equal(first.event.observedAt, 1718323200100);
  assert.equal(first.event.recordedAt, 1718323200200);
  assert.equal(first.event.source, "fixture-volume-observer");
  assert.deepEqual(first.event.input, {
    level: 34,
    muted: false,
    deviceName: "MacBook Pro Speakers"
  });
  assert.equal(first.event.persisted, true, "explicit HUD input event records are local persisted audit entries");
  assert.deepEqual(first.store, {
    version: 1,
    updatedAt: 1718323200200,
    events: [first.event]
  });

  const second = recordBrightnessHudEvent({
    outputPath: storePath,
    input: {
      level: 8.2,
      displayName: "Built-in Liquid Retina XDR",
      source: "fixture-brightness-observer",
      observedAt: 1718323200300
    },
    now: 1718323200400
  });

  assert.equal(second.event.eventId, "hud-brightness-1718323200300-001");
  assert.equal(second.event.activityType, "brightness");
  assert.deepEqual(second.event.input, {
    level: 8,
    displayName: "Built-in Liquid Retina XDR"
  });
  assert.equal(second.store.events.length, 2, "HUD store should append deterministic local events");
  assert.deepEqual(second.store.events.map((event) => event.eventId), [
    "hud-volume-1718323200100-000",
    "hud-brightness-1718323200300-001"
  ]);

  const third = recordVolumeHudEvent({
    outputPath: storePath,
    input: {
      level: 55,
      muted: false,
      deviceName: "Studio Display Speakers",
      source: "fixture-volume-observer",
      observedAt: 1718323200500
    },
    now: 1718323200600
  });

  assert.equal(third.event.eventId, "hud-volume-1718323200500-002");
  assert.deepEqual(third.store.events.map((event) => event.eventId), [
    "hud-volume-1718323200100-000",
    "hud-brightness-1718323200300-001",
    "hud-volume-1718323200500-002"
  ]);

  const loaded = readHudEventStore({ outputPath: storePath });
  assert.deepEqual(loaded, third.store, "HUD event store should round-trip from local JSON unchanged");
  assert.ok(!loaded.events.some((event) => Object.prototype.hasOwnProperty.call(event.input, "clipboardText")), "HUD persistence must not store clipboard text fields");

  const replayed = reconstructHudActivityState({ outputPath: storePath });
  assert.deepEqual(replayed.replayedEventIds, [
    "hud-volume-1718323200100-000",
    "hud-brightness-1718323200300-001",
    "hud-volume-1718323200500-002"
  ], "HUD event replay should expose deterministic replay order");
  assert.equal(replayed.volume.active.activityId, "volume-1718323200100", "volume replay should preserve burst identity from the first event");
  assert.equal(replayed.volume.active.createdAt, 1718323200100);
  assert.equal(replayed.volume.active.updatedAt, 1718323200500);
  assert.equal(replayed.volume.active.expiresAt, 1718323202100);
  assert.deepEqual(replayed.volume.active.status, {
    level: 55,
    muted: false,
    previousLevel: 34,
    direction: "up",
    displayText: "55%"
  });
  assert.deepEqual(replayed.volume.active.compactSurface, {
    glyph: "speaker",
    label: "55%",
    progress: 0.55
  });
  assert.equal(replayed.volume.active.expandedSurface.subtitle, "Studio Display Speakers · 55%");
  assert.equal(replayed.volume.active.source, "fixture-volume-observer");
  assert.equal(replayed.volume.active.persisted, false, "reconstructed HUD state remains transient display state, not restart-persisted UI state");
  assert.equal(replayed.brightness.active.activityId, "brightness-1718323200300");
  assert.deepEqual(replayed.brightness.active.status, {
    level: 8,
    previousLevel: null,
    direction: "initial",
    displayText: "8%"
  });
  assert.equal(replayed.brightness.active.compactSurface.glyph, "sun.min");
  assert.equal(replayed.brightness.active.expandedSurface.subtitle, "Built-in Liquid Retina XDR · 8%");

  const shuffledReplay = reconstructHudActivityState({
    store: {
      ...third.store,
      events: [third.store.events[2], third.store.events[0], third.store.events[1]]
    }
  });
  assert.deepEqual(shuffledReplay, replayed, "HUD event replay should not depend on serialized array order when timestamps are present");

  const limitedPath = path.join(tempDir, "nested", "limited-hud-events.json");
  recordVolumeHudEvent({
    outputPath: limitedPath,
    input: { level: 10, muted: false, observedAt: 1718323200000 },
    now: 1718323200001,
    maxEvents: 2
  });
  recordBrightnessHudEvent({
    outputPath: limitedPath,
    input: { level: 20, observedAt: 1718323200100 },
    now: 1718323200101,
    maxEvents: 2
  });
  const limited = recordVolumeHudEvent({
    outputPath: limitedPath,
    input: { level: 30, muted: true, observedAt: 1718323200200 },
    now: 1718323200201,
    maxEvents: 2
  });
  assert.deepEqual(
    limited.store.events.map((event) => event.eventId),
    ["hud-brightness-1718323200100-001", "hud-volume-1718323200200-002"],
    "maxEvents should keep the newest deterministic HUD events without re-numbering existing sequence"
  );

  assert.deepEqual(
    readHudEventStore({ outputPath: path.join(tempDir, "missing.json"), now: 1718323200500 }),
    { version: 1, updatedAt: 1718323200500, events: [] },
    "missing HUD event store should read as an empty deterministic store"
  );

  assert.throws(
    () => recordVolumeHudEvent({ input: { level: 50, observedAt: 1718323200000 } }),
    /outputPath is required/,
    "HUD event persistence should fail predictably without a local destination"
  );
  assert.throws(
    () => recordBrightnessHudEvent({ outputPath: storePath, input: { level: 101, observedAt: 1718323200500 } }),
    /brightness level must be between 0 and 100/,
    "HUD persistence should reuse brightness input validation"
  );
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("HUD event store test passed.");
