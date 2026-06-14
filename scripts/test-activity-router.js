#!/usr/bin/env node

const assert = require("node:assert");
const {
  ACTIVITY_PRIORITIES,
  activityTypeForStatus,
  buildActivityRouterSnapshot,
  rankActivities,
  selectCompactActivity
} = require("../src/activity-router");
const { applyVolumeHudInputChange, createVolumeHudState, volumeHudToNativeStatus } = require("../src/volume-hud-status");

const now = new Date("2026-06-15T09:00:00.000Z");
const statuses = [
  {
    agent: "Battery",
    state: "running",
    task: "Battery 82%",
    detail: "AC Power",
    updatedAt: "2026-06-15T08:59:59.000Z"
  },
  {
    agent: "Now Playing",
    state: "running",
    task: "Song Title",
    detail: "Artist Name",
    updatedAt: "2026-06-15T08:59:58.000Z"
  },
  {
    agent: "Timer",
    state: "running",
    task: "Timer · 4m remaining",
    detail: "4m remaining of 5m.",
    updatedAt: "2026-06-15T08:59:57.000Z"
  },
  {
    agent: "DynaDrop",
    state: "running",
    task: "Shelf · 1 file ready",
    detail: "Local reveal is ready; native drag capture is deferred.",
    activityType: "shelf",
    revealReadyPath: "/Users/st/Desktop/demo.pdf",
    metadata: { fileCount: 1 },
    updatedAt: "2026-06-15T08:59:56.000Z"
  },
  {
    agent: "Clipboard",
    state: "running",
    task: "Link copied · 21 chars",
    detail: "https://example.com/a",
    metadata: { classification: "link" },
    persisted: false,
    updatedAt: "2026-06-15T08:59:55.000Z"
  },
  {
    agent: "Brightness",
    state: "running",
    task: "Brightness 64%",
    detail: "DynaKeys HUD fixture",
    expiresAt: "2026-06-15T09:00:02.000Z",
    updatedAt: "2026-06-15T08:59:54.000Z"
  },
  {
    agent: "Volume",
    state: "running",
    task: "Volume 42%",
    detail: "DynaKeys HUD fixture",
    expiresAt: "2026-06-15T09:00:02.000Z",
    updatedAt: "2026-06-15T08:59:55.000Z"
  }
];

assert.equal(ACTIVITY_PRIORITIES.volume, ACTIVITY_PRIORITIES.brightness);
assert.equal(ACTIVITY_PRIORITIES.volume > ACTIVITY_PRIORITIES.clipboard, true);
assert.equal(ACTIVITY_PRIORITIES.clipboard > ACTIVITY_PRIORITIES.shelf, true);
assert.equal(ACTIVITY_PRIORITIES.shelf, ACTIVITY_PRIORITIES.drop);
assert.equal(ACTIVITY_PRIORITIES.shelf > ACTIVITY_PRIORITIES.timer, true);
assert.equal(ACTIVITY_PRIORITIES.timer > ACTIVITY_PRIORITIES.nowPlaying, true);
assert.equal(ACTIVITY_PRIORITIES.nowPlaying > ACTIVITY_PRIORITIES.battery, true);
assert.equal(ACTIVITY_PRIORITIES.battery > ACTIVITY_PRIORITIES.futurePassive, true);

assert.equal(activityTypeForStatus({ agent: "DynaKeys Volume" }), "volume");
assert.equal(activityTypeForStatus({ agent: "DynaClip" }), "clipboard");
assert.equal(activityTypeForStatus({ agent: "DynaDrop" }), "drop");
assert.equal(activityTypeForStatus({ agent: "Unknown Future Provider" }), "futurePassive");

const ranked = rankActivities(statuses, { now });
assert.deepEqual(ranked.map((activity) => activity.activityType), [
  "volume",
  "brightness",
  "clipboard",
  "shelf",
  "timer",
  "nowPlaying",
  "battery"
]);
assert.deepEqual(ranked.map((activity) => activity.priority), [600, 600, 500, 400, 300, 200, 100]);
assert.equal(ranked[0].compactSurface.label, "Volume 42%");
assert.equal(ranked[3].revealReadyPath, "/Users/st/Desktop/demo.pdf");
assert.equal(ranked[4].persisted, false);
assert.equal(selectCompactActivity(statuses, { now }).activityType, "volume");

const volumeHudStatus = volumeHudToNativeStatus(applyVolumeHudInputChange(createVolumeHudState(), {
  level: 44,
  muted: false,
  observedAt: now.getTime(),
  source: "fixture-volume-observer"
}).active);
const rankedVolumeHudStatus = rankActivities([volumeHudStatus], { now })[0];
assert.equal(rankedVolumeHudStatus.activityId, "volume-1781514000000");
assert.equal(rankedVolumeHudStatus.source, "fixture-volume-observer");
assert.equal(rankedVolumeHudStatus.persisted, false);
assert.equal(rankedVolumeHudStatus.compactSurface.activityType, "volume");
assert.equal(rankedVolumeHudStatus.compactSurface.priority, ACTIVITY_PRIORITIES.volume);

const snapshot = buildActivityRouterSnapshot(statuses, { now });
assert.equal(snapshot.compactSurface.activityType, "volume");
assert.deepEqual(snapshot.order, ["volume", "brightness", "clipboard", "shelf", "drop", "timer", "nowPlaying", "battery", "futurePassive"]);

const expiredHudRanksBelowClipboard = rankActivities([
  { agent: "Volume", task: "Volume 10%", expiresAt: "2026-06-15T08:59:59.000Z", updatedAt: "2026-06-15T08:59:59.000Z" },
  { agent: "Clipboard", task: "Text copied · 5 chars", updatedAt: "2026-06-15T08:59:50.000Z" }
], { now });
assert.deepEqual(expiredHudRanksBelowClipboard.map((activity) => activity.activityType), ["clipboard"]);

const tieBrokenByUpdatedAtThenCreatedAtThenId = rankActivities([
  { activityId: "old-volume", activityType: "volume", task: "Volume old", createdAt: "2026-06-15T08:00:00.000Z", updatedAt: "2026-06-15T08:59:00.000Z" },
  { activityId: "new-volume", activityType: "volume", task: "Volume new", createdAt: "2026-06-15T08:10:00.000Z", updatedAt: "2026-06-15T08:59:30.000Z" }
], { now });
assert.equal(tieBrokenByUpdatedAtThenCreatedAtThenId[0].activityId, "new-volume");

console.log("Activity router priority test passed.");
