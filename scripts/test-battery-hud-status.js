#!/usr/bin/env node

const assert = require("node:assert");
const {
  applyBatteryObservation,
  batteryHudToNativeStatus,
  batteryObservationToNativeStatus,
  createBatteryHudState,
  parseBatteryObservationFromPmset
} = require("../src/battery-hud-status");

const raw20 = "Now drawing from 'AC Power'\n -InternalBattery-0\t20%; charging; 0:35 remaining present: true";
const observation20 = parseBatteryObservationFromPmset(raw20);
assert.deepEqual(observation20, {
  percent: 20,
  charging: true,
  rawState: "charging",
  powerSource: "AC Power",
  estimatedTimeText: "0:35 remaining"
});

const now = new Date("2026-06-17T07:00:00.000Z");
const state = createBatteryHudState();
const first = applyBatteryObservation(state, observation20, { now });
assert.equal(first.active.activityType, "battery");
assert.equal(first.active.status.milestonePercent, 20);
assert.equal(first.active.status.rawBatteryTextVisible, false);
assert.equal(first.active.compactSurface.label, "20%");
assert.equal(first.active.compactSurface.hudKind, "batteryMilestone");
assert.equal(first.active.expandedSurface, null, "battery milestone HUD is compact-only");
assert.equal(first.active.expiresAt - now.getTime(), 7000, "battery HUD defaults to a 7 second transient");

const native = batteryHudToNativeStatus(first.active, observation20);
assert.equal(native.task, "Charging 20%");
assert.equal(native.detail, "Battery is charging from AC Power at 20%.");
assert.doesNotMatch(native.detail, /InternalBattery|present: true|pmset/i, "user-facing Battery detail must not expose raw pmset text");
assert.equal(native.batteryHud.compactSurface.label, "20%");
assert.equal(native.metadata.rawBatteryTextVisible, false);

const duplicate = applyBatteryObservation(first.state, observation20, { now: new Date(now.getTime() + 1000) });
assert.equal(duplicate.active.activityId, first.active.activityId, "same milestone remains the current transient instead of re-emitting");

const nonMilestone = applyBatteryObservation(duplicate.state, { ...observation20, percent: 21 }, { now: new Date(now.getTime() + 8000) });
assert.equal(nonMilestone.active, null, "non-milestone charging percentages do not emit Battery HUD");
const passive = batteryObservationToNativeStatus({ ...observation20, percent: 21 });
assert.equal(passive.batteryHud, undefined, "passive Battery status has no transient HUD payload");
assert.equal(passive.detail, "Battery is charging from AC Power at 21%.");

const fullState = createBatteryHudState();
const fullFirst = applyBatteryObservation(fullState, { ...observation20, percent: 100 }, { now });
assert.ok(fullFirst.active, "100% milestone emits once");
const fullDuplicate = applyBatteryObservation(fullFirst.state, { ...observation20, percent: 100 }, { now: new Date(now.getTime() + 8000) });
assert.equal(fullDuplicate.active, null, "100% does not repeat while battery remains full");
const resetAfterDischarge = applyBatteryObservation(fullDuplicate.state, { ...observation20, percent: 99, charging: false }, { now: new Date(now.getTime() + 9000) });
assert.equal(resetAfterDischarge.active, null);
const fullAfterReset = applyBatteryObservation(resetAfterDischarge.state, { ...observation20, percent: 100, charging: true }, { now: new Date(now.getTime() + 10000) });
assert.ok(fullAfterReset.active, "100% can emit again after charging run resets");

console.log("Battery HUD status model test passed.");
