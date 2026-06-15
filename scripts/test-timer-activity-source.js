#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { buildActivityRouterSnapshot, normalizeActivity, rankActivities, selectCompactActivity } = require("../src/activity-router");
const { buildMacActivityStatusPayload, collectTimerStatus } = require("../src/mac-activity-status");
const { parseTimerDuration } = require("../src/timer-duration");
const { completeTimerIfElapsed, createTimerState, startTimer, stopTimer, TIMER_STATES } = require("../src/timer-state");
const { buildTimerActivityFromStatus, collectTimerActivityStatus } = require("../src/timer-activity-source");

const activityRouterSource = fs.readFileSync(path.join(__dirname, "..", "src", "activity-router.js"), "utf8");
assert.match(
  activityRouterSource,
  /const \{ isRunningTimer \} = require\("\.\/timer-state"\);/,
  "activity router must import the existing Timer MVP model helper for compact eligibility"
);
assert.doesNotMatch(
  activityRouterSource,
  /timerState\s*===\s*["']running["']/,
  "activity router must not duplicate Timer MVP running-state logic inline"
);

const activeNow = new Date("2026-06-15T09:00:30.000Z");
const activeTimerState = createTimerState();
startTimer(activeTimerState, parseTimerDuration("5m"), {
  id: "timer-router-active",
  now: () => "2026-06-15T09:00:00.000Z"
});

const activeStatus = collectTimerActivityStatus({
  timerState: activeTimerState,
  now: activeNow,
  source: "fixture-timer-source"
});
assert.equal(activeStatus.agent, "Timer");
assert.equal(activeStatus.activityType, "timer");
assert.equal(activeStatus.state, "running");
assert.equal(activeStatus.timer.state, TIMER_STATES.RUNNING);
assert.equal(activeStatus.timer.remainingSeconds, 270);
assert.equal(activeStatus.activity.activityType, "timer");
assert.equal(activeStatus.activity.source, "fixture-timer-source");
assert.equal(activeStatus.activity.status.state, "active");
assert.equal(activeStatus.activity.compactSurface.label, "5m");
assert.equal(activeStatus.activity.compactSurface.progress, 0.1);
assert.equal(activeStatus.activity.persisted, false);

const activeWinner = selectCompactActivity([
  activeStatus,
  {
    agent: "Now Playing",
    state: "running",
    task: "Background media",
    detail: "Timer should route above now playing while active.",
    updatedAt: "2026-06-15T09:00:31.000Z"
  }
], { now: activeNow });
assert.equal(activeWinner.activityType, "timer", "active Timer MVP state should be compact-routed above passive media");
assert.equal(activeWinner.activityId, "timer-timer-router-active");
assert.equal(activeWinner.source, "fixture-timer-source");

const idleTimerState = createTimerState();
startTimer(idleTimerState, parseTimerDuration("5m"), {
  id: "timer-router-idle",
  now: () => "2026-06-15T09:02:00.000Z"
});
stopTimer(idleTimerState, {
  now: () => "2026-06-15T09:03:00.000Z"
});
const idleStatus = collectTimerStatus({
  timerState: idleTimerState,
  now: new Date("2026-06-15T09:03:00.000Z"),
  timerSource: "fixture-timer-source"
});
const idleActivity = normalizeActivity(idleStatus, 0, { now: activeNow });
assert.equal(idleStatus.state, "idle");
assert.equal(idleStatus.timer.state, TIMER_STATES.STOPPED);
assert.equal(idleActivity.activityType, "timer");
assert.equal(idleActivity.status.activity.status.state, "idle");
assert.equal(idleActivity.compactSurface.activityType, "timer");
assert.deepEqual(
  rankActivities([
    idleStatus,
    {
      agent: "Now Playing",
      state: "running",
      task: "Fallback media",
      detail: "Idle timers should be exposed but not compact eligible.",
      updatedAt: "2026-06-15T09:03:01.000Z"
    }
  ], { now: activeNow }).map((activity) => activity.activityType),
  ["nowPlaying"],
  "idle Timer activity should stay available to normalize but not win compact routing"
);

const completedTimerState = createTimerState();
startTimer(completedTimerState, parseTimerDuration("2s"), {
  id: "timer-router-completed",
  now: () => "2026-06-15T09:04:00.000Z"
});
const completedStatus = collectTimerActivityStatus({
  timerState: completedTimerState,
  now: new Date("2026-06-15T09:04:03.000Z"),
  source: "fixture-timer-source"
});
assert.equal(completedStatus.state, "success");
assert.equal(completedStatus.timer.state, TIMER_STATES.DONE);
assert.equal(completedTimerState.activeTimer.state, TIMER_STATES.DONE, "timer source should reuse the existing elapsed-completion transition");
assert.equal(completedStatus.activity.status.state, "completed");
assert.equal(completedStatus.activity.compactSurface.label, "Done");
assert.equal(completedStatus.activity.compactSurface.progress, 1);
assert.deepEqual(
  rankActivities([completedStatus, {
    agent: "Battery",
    state: "running",
    task: "Battery 88%",
    detail: "Completed timers should not be compact eligible by default.",
    updatedAt: "2026-06-15T09:04:03.000Z"
  }], { now: activeNow }).map((activity) => activity.activityType),
  ["battery"],
  "completed Timer activity should be exposed for expanded/status consumers without taking compact focus"
);

const rebuiltActivity = buildTimerActivityFromStatus(completedStatus, { source: "rebuilt-fixture" });
assert.equal(rebuiltActivity.activityId, "timer-timer-router-completed");
assert.equal(rebuiltActivity.source, "rebuilt-fixture");
assert.equal(rebuiltActivity.status.timerState, TIMER_STATES.DONE);

const payload = buildMacActivityStatusPayload({
  now: new Date("2026-06-15T09:00:30.000Z"),
  timerState: activeTimerState,
  timerSource: "fixture-timer-source",
  mediaInfo: {
    source: "spotify",
    title: "Background Song",
    artist: "Artist",
    playbackState: "playing"
  },
  clipboardText: "",
  clipboardObservedAt: Date.parse("2026-06-15T08:55:00.000Z"),
  pmsetOutput: "Now drawing from 'AC Power'\n -InternalBattery-0\t82%; charging; 0:35 remaining present: true"
});
assert.equal(payload.statuses.some((status) => status.agent === "Timer"), true);
assert.equal(payload.activityRouter.compactSurface.activityType, "timer");
assert.deepEqual(payload.activityRouter.rankedActivities.map((activity) => activity.activityType), ["timer", "nowPlaying", "battery", "futurePassive"]);

const snapshot = buildActivityRouterSnapshot([activeStatus], { now: activeNow });
assert.equal(snapshot.compactSurface.activityType, "timer");
assert.equal(snapshot.rankedActivities[0].status.activity.status.state, "active");

completeTimerIfElapsed(createTimerState(), { now: () => activeNow });

console.log("Timer activity router adapter/source test passed.");
