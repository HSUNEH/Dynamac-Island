#!/usr/bin/env node

const assert = require("node:assert");
const {
  deserializeBrightnessHudState,
  serializeBrightnessHudState
} = require("../src/brightness-hud-status");
const {
  deserializeVolumeHudState,
  serializeVolumeHudState
} = require("../src/volume-hud-status");
const {
  HUD_COMPACT_STATE_SCHEMA_VERSION,
  hudCompactStateSchemaFor,
  deserializeHudCompactState,
  serializeHudCompactState
} = require("../src/hud-compact-state-schema");

assert.equal(HUD_COMPACT_STATE_SCHEMA_VERSION, 1, "shared HUD compact state schema should start at v1");
assert.equal(hudCompactStateSchemaFor("volumeHud"), "dynamac.volumeHud.state.v1");
assert.equal(hudCompactStateSchemaFor("brightnessHud"), "dynamac.brightnessHud.state.v1");

assert.deepEqual(
  serializeVolumeHudState(),
  { schema: "dynamac.volumeHud.state.v1", version: 1, active: null },
  "volume HUD default state should serialize with a deterministic shared v1 envelope"
);
assert.deepEqual(
  serializeBrightnessHudState(),
  { schema: "dynamac.brightnessHud.state.v1", version: 1, active: null },
  "brightness HUD default state should serialize with a deterministic shared v1 envelope"
);

assert.deepEqual(
  deserializeVolumeHudState({ schema: "dynamac.volumeHud.state.v1", version: 1 }),
  { active: null },
  "volume HUD deserialization should default missing active to inactive"
);
assert.deepEqual(
  deserializeBrightnessHudState({ schema: "dynamac.brightnessHud.state.v1" }),
  { active: null },
  "brightness HUD deserialization should default missing version to v1 and active to inactive"
);
assert.deepEqual(
  deserializeVolumeHudState({ active: null }),
  { active: null },
  "volume HUD deserialization should default a missing schema to the current shared schema"
);
assert.deepEqual(
  deserializeBrightnessHudState({ active: null, version: null }),
  { active: null },
  "brightness HUD deserialization should default a null version to the current shared version"
);

const customState = { active: { activityId: "hud-fixture", activityType: "fixture" } };
const customSerialized = serializeHudCompactState({
  hudKey: "volumeHud",
  state: customState,
  serializeActivity: (activity) => ({ activityId: activity.activityId, activityType: activity.activityType })
});
assert.deepEqual(
  customSerialized,
  {
    schema: "dynamac.volumeHud.state.v1",
    version: 1,
    active: { activityId: "hud-fixture", activityType: "fixture" }
  },
  "shared serializer should keep deterministic key order and explicit versioning"
);
assert.equal(
  JSON.stringify(customSerialized),
  "{\"schema\":\"dynamac.volumeHud.state.v1\",\"version\":1,\"active\":{\"activityId\":\"hud-fixture\",\"activityType\":\"fixture\"}}",
  "shared serializer JSON should be stable for fixtures"
);
assert.deepEqual(
  deserializeHudCompactState(customSerialized, {
    hudKey: "volumeHud",
    createState: (active = null) => ({ active }),
    serializeActivity: (activity) => ({ activityId: activity.activityId, activityType: activity.activityType })
  }),
  customState,
  "shared deserializer should round-trip an active HUD compact state deterministically"
);

assert.throws(
  () => hudCompactStateSchemaFor("mediaHud"),
  /unsupported HUD compact state key: mediaHud/,
  "unknown HUD compact schemas should fail predictably"
);
assert.throws(
  () => deserializeVolumeHudState({ schema: "dynamac.volumeHud.state.v1", version: 2, active: null }),
  /volumeHud state version must be 1/,
  "future HUD compact state versions should not be silently accepted"
);
assert.throws(
  () => deserializeBrightnessHudState({ schema: "dynamac.volumeHud.state.v1", version: 1, active: null }),
  /brightnessHud state schema must be dynamac\.brightnessHud\.state\.v1/,
  "mismatched HUD compact state schemas should not cross-deserialize"
);

console.log("Shared HUD compact state schema test passed.");
