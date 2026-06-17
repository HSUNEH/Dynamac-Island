#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  collectMacContextProvider,
  collectMacContextStatusOnly
} = require("../src/mac-context-provider");

const STATUS_SOURCE = "scripts/mac-context-status.js";

function usage() {
  return [
    "Usage: node scripts/mac-context-status.js [--fixture path] [--status-only] [--pretty] [--now iso-date]",
    "",
    "Prints a deterministic local Mac Context JSON status-source payload.",
    "Default mode reads read-only active app/window context plus permission/degradation status.",
    "--status-only preflights permissions without reading active app/window context."
  ].join("\n");
}

function parseArgs(argv) {
  const args = { fixturePath: "", pretty: false, statusOnly: false, now: null, help: false };
  const requireValue = (flag, index) => {
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--pretty") {
      args.pretty = true;
    } else if (arg === "--status-only") {
      args.statusOnly = true;
    } else if (arg === "--fixture") {
      args.fixturePath = requireValue("--fixture", index);
      index += 1;
    } else if (arg.startsWith("--fixture=")) {
      args.fixturePath = arg.slice("--fixture=".length);
      if (!args.fixturePath) throw new Error("Missing value for --fixture");
    } else if (arg === "--now") {
      args.now = requireValue("--now", index);
      index += 1;
    } else if (arg.startsWith("--now=")) {
      args.now = arg.slice("--now=".length);
      if (!args.now) throw new Error("Missing value for --now");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function readFixture(fixturePath) {
  if (!fixturePath) return {};
  const absolutePath = path.resolve(fixturePath);
  const fixture = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  if (!fixture || typeof fixture !== "object" || Array.isArray(fixture)) {
    throw new Error(`Fixture JSON must be an object: ${fixturePath}`);
  }
  return fixture;
}

function requiredPermissionDegradations(permissionStatus = {}) {
  return [
    ["accessibility", permissionStatus.accessibility],
    ["screenRecording", permissionStatus.screenRecording]
  ]
    .map(([name, status]) => ({
      name,
      status: status?.status || "unknown",
      available: status?.available === true,
      diagnostic: status?.diagnostic || ""
    }))
    .filter((permission) => !permission.available);
}

function splitDegradationReasons(degradationState) {
  const text = String(degradationState || "").trim();
  if (!text) return [];
  if (text === "Full read-only active app/window context available.") return [];
  if (text === "Permission preflight passed; active app/window retrieval has not been invoked by this status-only API.") return [];
  return text.split("; ").map((reason) => reason.trim()).filter(Boolean);
}

function buildStructuredDegradation(context, success) {
  const unavailablePermissions = requiredPermissionDegradations(context?.permissionStatus);
  const activeApplicationAvailable = Boolean(context?.activeApp?.name);
  const activeWindowAvailable = Boolean(context?.activeWindow);
  const activeContextUnavailable = !Boolean(activeApplicationAvailable && activeWindowAvailable);
  const uiTreeUnavailable = context?.uiTreeContext?.available !== true;
  const sourceAvailability = {
    activeApplication: activeApplicationAvailable,
    activeWindow: activeWindowAvailable,
    accessibilityPermission: context?.permissionStatus?.accessibility?.available === true,
    screenRecordingPermission: context?.permissionStatus?.screenRecording?.available === true,
    uiTreeContext: !uiTreeUnavailable
  };
  const unavailableSources = Object.entries(sourceAvailability)
    .filter(([, available]) => !available)
    .map(([name]) => name);
  const reasons = Array.isArray(context?.degradationReasons)
    ? context.degradationReasons.filter((reason) => typeof reason === "string" && reason.trim()).map((reason) => reason.trim())
    : splitDegradationReasons(context?.degradationState);

  return {
    degraded: !success,
    state: context?.degradationState || (success ? "Full read-only active app/window context available." : "Mac Context status generated with reduced capability."),
    reasons,
    requiredSourcesUnavailable: unavailableSources.length > 0,
    unavailableSources,
    sourceAvailability,
    requiredPermissionsUnavailable: unavailablePermissions.length > 0,
    unavailablePermissions,
    activeContextUnavailable,
    uiTreeUnavailable
  };
}

function buildGenerationResult(context, options = {}) {
  const hasActiveContext = Boolean(context?.activeApp?.name && context?.activeWindow);
  const permissionsAvailable = Boolean(
    context?.permissionStatus?.accessibility?.available &&
    context?.permissionStatus?.screenRecording?.available
  );
  const uiTreeAvailable = context?.uiTreeContext?.available === true;
  const success = !options.statusOnly && hasActiveContext && permissionsAvailable && uiTreeAvailable;
  return {
    ok: true,
    status: success ? "success" : "degraded",
    success,
    message: context?.degradationState || (success ? "Full read-only active app/window context available." : "Mac Context status generated with reduced capability."),
    activeContextAvailable: hasActiveContext,
    permissionsAvailable,
    uiTreeAvailable,
    degradation: buildStructuredDegradation(context, success)
  };
}

function buildMacContextStatusSource(options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`Invalid --now value: ${options.now}`);
  const providerOptions = {
    ...options,
    statusSource: STATUS_SOURCE
  };
  const context = options.statusOnly
    ? collectMacContextStatusOnly(providerOptions)
    : collectMacContextProvider(providerOptions);
  const result = buildGenerationResult(context, { statusOnly: options.statusOnly });

  return {
    schemaVersion: 1,
    kind: "dynamac.macContext.statusSource",
    sampledAt: now.toISOString(),
    result,
    statusSource: STATUS_SOURCE,
    source: context.source,
    activeApp: context.activeApp,
    activeWindow: context.activeWindow,
    uiTreeContext: context.uiTreeContext,
    permissionStatus: context.permissionStatus,
    degradationState: context.degradationState
  };
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return;
  }
  const fixture = readFixture(args.fixturePath);
  const payload = buildMacContextStatusSource({
    ...fixture,
    now: args.now || fixture.now,
    statusOnly: args.statusOnly || fixture.statusOnly === true
  });
  process.stdout.write(`${JSON.stringify(payload, null, args.pretty ? 2 : 0)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message || String(error));
    process.exit(1);
  }
}

module.exports = {
  buildGenerationResult,
  buildMacContextStatusSource,
  buildStructuredDegradation,
  parseArgs,
  requiredPermissionDegradations,
  readFixture,
  splitDegradationReasons,
  STATUS_SOURCE
};
