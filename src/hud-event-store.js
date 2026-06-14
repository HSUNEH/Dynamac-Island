const fs = require("node:fs");
const path = require("node:path");
const { applyBrightnessHudInputChange, createBrightnessHudState } = require("./brightness-hud-status");
const { applyVolumeHudInputChange, createVolumeHudState } = require("./volume-hud-status");

const STORE_VERSION = 1;
const DEFAULT_MAX_EVENTS = 100;

function finiteTimestamp(value, fieldName) {
  if (!Number.isFinite(Number(value))) {
    throw new Error(`${fieldName} must be a finite timestamp`);
  }
  return Number(value);
}

function assertOutputPath(outputPath) {
  if (typeof outputPath !== "string" || outputPath.trim() === "") {
    throw new Error("outputPath is required");
  }
  return outputPath;
}

function createHudEventStore(options = {}) {
  return {
    version: STORE_VERSION,
    updatedAt: finiteTimestamp(options.now ?? Date.now(), "now"),
    events: []
  };
}

function normalizeStore(value, options = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createHudEventStore(options);
  }
  const events = Array.isArray(value.events) ? value.events.filter((event) => event && typeof event === "object" && !Array.isArray(event)) : [];
  const updatedAt = Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : finiteTimestamp(options.now ?? Date.now(), "now");
  return {
    version: STORE_VERSION,
    updatedAt,
    events
  };
}

function readHudEventStore(options = {}) {
  const outputPath = assertOutputPath(options.outputPath);
  const fileSystem = options.fs || fs;
  try {
    return normalizeStore(JSON.parse(fileSystem.readFileSync(outputPath, "utf8")), options);
  } catch (error) {
    if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
      return createHudEventStore(options);
    }
    throw error;
  }
}

function atomicWriteJson(fileSystem, outputPath, payload) {
  const directory = path.dirname(outputPath);
  fileSystem.mkdirSync(directory, { recursive: true });
  const tempPath = path.join(directory, `.${path.basename(outputPath)}.${process.pid}.${Date.now()}.tmp`);
  fileSystem.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`);
  fileSystem.renameSync(tempPath, outputPath);
}

function maxEventsLimit(value) {
  const maxEvents = Number(value ?? DEFAULT_MAX_EVENTS);
  if (!Number.isFinite(maxEvents) || maxEvents < 1) return DEFAULT_MAX_EVENTS;
  return Math.floor(maxEvents);
}

function sourceForActivity(activity, fallback) {
  return String(activity.source || fallback).trim() || fallback;
}

function eventId(activityType, observedAt, sequence) {
  return `hud-${activityType}-${observedAt}-${String(sequence).padStart(3, "0")}`;
}

function appendHudEvent(options, activityType, activity, input) {
  const outputPath = assertOutputPath(options.outputPath);
  const fileSystem = options.fs || fs;
  const now = finiteTimestamp(options.now ?? Date.now(), "now");
  const store = readHudEventStore({ outputPath, fs: fileSystem, now });
  const sequence = store.events.length;
  const observedAt = finiteTimestamp(activity.updatedAt, "activity.updatedAt");
  const source = sourceForActivity(activity, activityType === "volume" ? "local-volume-observer" : "local-brightness-observer");
  const event = {
    eventId: eventId(activityType, observedAt, sequence),
    activityType,
    observedAt,
    recordedAt: now,
    source,
    input,
    persisted: true
  };
  const events = [...store.events, event].slice(-maxEventsLimit(options.maxEvents));
  const nextStore = {
    version: STORE_VERSION,
    updatedAt: now,
    events
  };

  atomicWriteJson(fileSystem, outputPath, nextStore);

  return {
    outputPath,
    event,
    store: nextStore
  };
}

function recordVolumeHudEvent(options = {}) {
  const state = applyVolumeHudInputChange(createVolumeHudState(), options.input || {}, { now: options.now, transientMs: options.transientMs });
  const activity = state.active;
  return appendHudEvent(options, "volume", activity, {
    level: activity.status.level,
    muted: activity.status.muted,
    deviceName: activity.metadata.deviceName
  });
}

function recordBrightnessHudEvent(options = {}) {
  const state = applyBrightnessHudInputChange(createBrightnessHudState(), options.input || {}, { now: options.now, transientMs: options.transientMs });
  const activity = state.active;
  return appendHudEvent(options, "brightness", activity, {
    level: activity.status.level,
    displayName: activity.metadata.displayName
  });
}

module.exports = {
  createHudEventStore,
  readHudEventStore,
  recordBrightnessHudEvent,
  recordVolumeHudEvent
};
