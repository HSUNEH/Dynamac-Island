#!/usr/bin/env node

const assert = require("node:assert");
const {
  ACTIVITY_PRIORITIES,
  activityTypeForStatus,
  buildActivityRouterSnapshot,
  rankActivities,
  selectCompactActivity
} = require("../src/activity-router");
const { applyBrightnessHudInputChange, brightnessHudToNativeStatus, createBrightnessHudState } = require("../src/brightness-hud-status");
const { applyVolumeHudInputChange, createVolumeHudState, volumeHudToNativeStatus } = require("../src/volume-hud-status");
const { buildClipboardStatusFromText } = require("../src/clipboard-activity");

const now = new Date("2026-06-15T09:00:00.000Z");
const nowMs = now.getTime();

function candidateStatus(activityType, updatedAtOffsetMs = 0, fields = {}) {
  const updatedAtMs = nowMs + updatedAtOffsetMs;
  return {
    agent: activityType,
    activityId: `${activityType}-${updatedAtMs}`,
    activityType,
    state: "running",
    task: `${activityType} candidate`,
    detail: `${activityType} conflict fixture`,
    updatedAt: new Date(updatedAtMs).toISOString(),
    ...fields
  };
}

function assertCompactWinner(expectedType, candidates, message) {
  const selected = selectCompactActivity(candidates, { now });
  assert.equal(selected?.activityType, expectedType, message);
}

const brightnessConflictCandidates = [
  {
    label: "clipboard",
    status: candidateStatus("clipboard", 900, { agent: "Clipboard" })
  },
  {
    label: "shelf",
    status: candidateStatus("shelf", 900, {
      agent: "DynaShelf",
      revealReadyPath: "/Users/st/Desktop/demo.pdf",
      metadata: { fileCount: 1 }
    })
  },
  {
    label: "drop",
    status: candidateStatus("drop", 900, {
      agent: "DynaDrop",
      metadata: { fileCount: 2 }
    })
  },
  {
    label: "timer",
    status: candidateStatus("timer", 900, { agent: "Timer" })
  },
  {
    label: "now playing",
    status: candidateStatus("nowPlaying", 900, { agent: "Now Playing" })
  },
  {
    label: "battery/passive",
    status: candidateStatus("battery", 900, { agent: "Battery" })
  },
  {
    label: "future passive",
    status: candidateStatus("futurePassive", 900, { agent: "Unknown Future Provider" })
  }
];

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
    agent: "DynaDrop",
    state: "running",
    task: "Drop · 2 files staged",
    detail: "Local shelf staging is ready; native drag capture is deferred.",
    activityType: "drop",
    revealReadyPath: "",
    metadata: { fileCount: 2 },
    updatedAt: "2026-06-15T08:59:55.500Z"
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
  },
  {
    agent: "Unknown Future Provider",
    state: "running",
    task: "Future passive status",
    detail: "Unknown providers remain lowest priority until modeled.",
    updatedAt: "2026-06-15T08:59:53.000Z"
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

for (const passiveType of ["clipboard", "shelf", "drop", "timer", "nowPlaying", "battery", "futurePassive"]) {
  assertCompactWinner(
    "volume",
    [
      candidateStatus(passiveType, 900, { agent: passiveType === "futurePassive" ? "Unknown Future Provider" : passiveType }),
      candidateStatus("volume", 0, { agent: "Volume", expiresAt: "2026-06-15T09:00:02.000Z" })
    ],
    `volume HUD should beat newer ${passiveType} candidate`
  );
}

for (const { label, status } of brightnessConflictCandidates) {
  assertCompactWinner(
    "brightness",
    [
      status,
      candidateStatus("brightness", 0, { agent: "Brightness", expiresAt: "2026-06-15T09:00:02.000Z" })
    ],
    `brightness HUD should beat newer ${label} candidate`
  );
}

const clipboardVsShelfDropConflict = [
  candidateStatus("shelf", 300, {
    agent: "DynaShelf",
    revealReadyPath: "/Users/st/Desktop/fresh-shelf.pdf",
    metadata: { fileCount: 1 }
  }),
  candidateStatus("drop", 200, {
    agent: "DynaDrop",
    metadata: { fileCount: 2 }
  }),
  buildClipboardStatusFromText("https://example.com/router-conflict", {
    now: now.getTime(),
    observedAt: now.getTime(),
    source: "fixture-clipboard"
  }).status
];
const clipboardConflictWinner = selectCompactActivity(clipboardVsShelfDropConflict, { now });
assert.equal(
  clipboardConflictWinner.activityType,
  "clipboard",
  "clipboard should win compact routing over newer shelf/drop candidates when no volume or brightness HUD is active"
);
assert.equal(clipboardConflictWinner.compactSurface.activityType, "clipboard");
assert.deepEqual(
  rankActivities(clipboardVsShelfDropConflict, { now }).map((activity) => activity.activityType),
  ["clipboard", "shelf", "drop"]
);

const clipboardVsTimerConflict = [
  candidateStatus("timer", 600, {
    agent: "Timer",
    task: "Timer · 2m remaining",
    detail: "Newer timer candidate should not beat a fresh clipboard activity."
  }),
  buildClipboardStatusFromText("https://example.com/clipboard-vs-timer", {
    now: now.getTime(),
    observedAt: now.getTime(),
    source: "fixture-clipboard"
  }).status
];
const clipboardTimerConflictWinner = selectCompactActivity(clipboardVsTimerConflict, { now });
assert.equal(
  clipboardTimerConflictWinner.activityType,
  "clipboard",
  "clipboard should win compact routing over newer timer candidates when no volume or brightness HUD is active"
);
assert.equal(clipboardTimerConflictWinner.compactSurface.activityType, "clipboard");
assert.deepEqual(
  rankActivities(clipboardVsTimerConflict, { now }).map((activity) => activity.activityType),
  ["clipboard", "timer"]
);

const clipboardVsNowPlayingConflict = [
  candidateStatus("nowPlaying", 750, {
    agent: "Now Playing",
    task: "Song Title",
    detail: "Newer now playing candidate should stay below a fresh clipboard activity."
  }),
  buildClipboardStatusFromText("https://example.com/clipboard-vs-now-playing", {
    now: now.getTime(),
    observedAt: now.getTime(),
    source: "fixture-clipboard"
  }).status
];
const clipboardNowPlayingConflictWinner = selectCompactActivity(clipboardVsNowPlayingConflict, { now });
assert.equal(
  clipboardNowPlayingConflictWinner.activityType,
  "clipboard",
  "clipboard should win compact routing over newer now playing candidates when no volume or brightness HUD is active"
);
assert.equal(clipboardNowPlayingConflictWinner.compactSurface.activityType, "clipboard");
assert.deepEqual(
  rankActivities(clipboardVsNowPlayingConflict, { now }).map((activity) => activity.activityType),
  ["clipboard", "nowPlaying"]
);

const ranked = rankActivities(statuses, { now });
assert.deepEqual(ranked.map((activity) => activity.activityType), [
  "volume",
  "clipboard",
  "shelf",
  "drop",
  "timer",
  "nowPlaying",
  "battery",
  "futurePassive"
]);
assert.deepEqual(ranked.map((activity) => activity.priority), [600, 500, 400, 400, 300, 200, 100, 0]);
assert.equal(ranked[0].compactSurface.label, "Volume 42%");
assert.equal(ranked[2].revealReadyPath, "/Users/st/Desktop/demo.pdf");
assert.equal(ranked[3].compactSurface.priority, ACTIVITY_PRIORITIES.drop);
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

const brightnessHudStatus = brightnessHudToNativeStatus(applyBrightnessHudInputChange(createBrightnessHudState(), {
  level: 66,
  observedAt: now.getTime(),
  source: "fixture-brightness-observer"
}).active);
const rankedBrightnessHudStatus = rankActivities([brightnessHudStatus], { now })[0];
assert.equal(rankedBrightnessHudStatus.activityId, "brightness-1781514000000");
assert.equal(rankedBrightnessHudStatus.source, "fixture-brightness-observer");
assert.equal(rankedBrightnessHudStatus.compactSurface.activityType, "brightness");
assert.equal(rankedBrightnessHudStatus.compactSurface.priority, ACTIVITY_PRIORITIES.brightness);

assert.equal(rankedBrightnessHudStatus.persisted, false);

const overlappingVolumeHud = applyVolumeHudInputChange(createVolumeHudState(), {
  level: 44,
  muted: false,
  observedAt: now.getTime(),
  source: "fixture-volume-observer"
}).active;
const overlappingBrightnessHud = applyBrightnessHudInputChange(createBrightnessHudState(), {
  level: 66,
  observedAt: now.getTime() + 125,
  source: "fixture-brightness-observer"
}).active;
const overwrittenStatusTimestamp = new Date(now.getTime() + 500).toISOString();
const overlappingHudRank = rankActivities([
  {
    ...volumeHudToNativeStatus(overlappingVolumeHud),
    updatedAt: overwrittenStatusTimestamp
  },
  {
    ...brightnessHudToNativeStatus(overlappingBrightnessHud),
    updatedAt: overwrittenStatusTimestamp
  },
  {
    ...volumeHudToNativeStatus({
      ...overlappingVolumeHud,
      activityId: "volume-duplicate",
      updatedAt: now.getTime() + 80
    }),
    updatedAt: overwrittenStatusTimestamp
  },
  candidateStatus("clipboard", 400, { agent: "Clipboard" })
], { now: new Date(now.getTime() + 500) });
assert.deepEqual(
  overlappingHudRank.map((activity) => activity.activityType),
  ["brightness", "clipboard"],
  "router should expose only the newest DynaKeys HUD lane when volume and brightness arrive close together"
);
assert.equal(
  overlappingHudRank.filter((activity) => activity.activityType === "volume" || activity.activityType === "brightness").length,
  1,
  "router should suppress duplicate HUD events so compact rendering cannot overlap"
);

const clipboardStatus = buildClipboardStatusFromText("hello", {
  now: now.getTime(),
  observedAt: now.getTime(),
  source: "fixture-clipboard"
}).status;
const rankedClipboardStatus = rankActivities([clipboardStatus], { now })[0];
assert.equal(rankedClipboardStatus.activityId, "clipboard-1781514000000");
assert.equal(rankedClipboardStatus.source, "fixture-clipboard");
assert.equal(rankedClipboardStatus.metadata.classification, "text");
assert.equal(rankedClipboardStatus.compactSurface.activityType, "clipboard");
assert.equal(rankedClipboardStatus.persisted, false);

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
