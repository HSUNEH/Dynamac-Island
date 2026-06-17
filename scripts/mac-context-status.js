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
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--pretty") {
      args.pretty = true;
    } else if (arg === "--status-only") {
      args.statusOnly = true;
    } else if (arg === "--fixture") {
      args.fixturePath = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--fixture=")) {
      args.fixturePath = arg.slice("--fixture=".length);
    } else if (arg === "--now") {
      args.now = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--now=")) {
      args.now = arg.slice("--now=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function readFixture(fixturePath) {
  if (!fixturePath) return {};
  const absolutePath = path.resolve(fixturePath);
  return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
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

  return {
    schemaVersion: 1,
    kind: "dynamac.macContext.statusSource",
    sampledAt: now.toISOString(),
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
  buildMacContextStatusSource,
  parseArgs,
  readFixture,
  STATUS_SOURCE
};
