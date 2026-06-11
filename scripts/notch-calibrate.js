#!/usr/bin/env node

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

const repoRoot = path.resolve(__dirname, "..");
const calibrationPath = path.join(repoRoot, ".dynamac-calibration.json");
const nativePath = path.join(repoRoot, ".build/dynamac-native");
const statusPath = path.join(repoRoot, ".build/status.json");

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readCalibration() {
  if (!fs.existsSync(calibrationPath)) {
    return {
      DYNAMAC_NOTCH_WIDTH: 184,
      DYNAMAC_COMPACT_HEIGHT: 30,
      DYNAMAC_WING_WIDTH: 36,
      DYNAMAC_INNER_RADIUS: 5,
      DYNAMAC_OUTER_RADIUS: 8
    };
  }
  const parsed = JSON.parse(fs.readFileSync(calibrationPath, "utf8"));
  return {
    DYNAMAC_NOTCH_WIDTH: number(parsed.DYNAMAC_NOTCH_WIDTH, 184),
    DYNAMAC_COMPACT_HEIGHT: number(parsed.DYNAMAC_COMPACT_HEIGHT, 30),
    DYNAMAC_WING_WIDTH: number(parsed.DYNAMAC_WING_WIDTH, 36),
    DYNAMAC_INNER_RADIUS: number(parsed.DYNAMAC_INNER_RADIUS, 5),
    DYNAMAC_OUTER_RADIUS: number(parsed.DYNAMAC_OUTER_RADIUS, 8)
  };
}

let values = readCalibration();
let child = null;

function run(command, args) {
  childProcess.execFileSync(command, args, { cwd: repoRoot, stdio: "inherit" });
}

function save() {
  fs.writeFileSync(calibrationPath, `${JSON.stringify(values, null, 2)}\n`);
  console.log(`Saved ${path.relative(repoRoot, calibrationPath)}`);
}

function printValues() {
  console.log([
    "",
    "Current calibration:",
    `  notch width  : ${values.DYNAMAC_NOTCH_WIDTH}`,
    `  height       : ${values.DYNAMAC_COMPACT_HEIGHT}`,
    `  wing width   : ${values.DYNAMAC_WING_WIDTH}`,
    `  inner radius : ${values.DYNAMAC_INNER_RADIUS}`,
    `  outer radius : ${values.DYNAMAC_OUTER_RADIUS}`,
    ""
  ].join("\n"));
}

function startNative() {
  if (child) child.kill();
  const env = {
    ...process.env,
    ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)])),
    DYNAMAC_QA_NOTCH_SILHOUETTE: "1",
    DYNAMAC_NATIVE_DIAG: "1",
    DYNAMAC_STATUS_FILE: statusPath
  };
  child = childProcess.spawn(nativePath, { cwd: repoRoot, env, stdio: "inherit" });
}

function apply(command) {
  const [name, rawAmount] = command.trim().split(/\s+/);
  const amount = number(rawAmount, undefined);
  switch (name) {
    case "w+": values.DYNAMAC_NOTCH_WIDTH += amount ?? 4; break;
    case "w-": values.DYNAMAC_NOTCH_WIDTH = Math.max(120, values.DYNAMAC_NOTCH_WIDTH - (amount ?? 4)); break;
    case "h+": values.DYNAMAC_COMPACT_HEIGHT += amount ?? 2; break;
    case "h-": values.DYNAMAC_COMPACT_HEIGHT = Math.max(18, values.DYNAMAC_COMPACT_HEIGHT - (amount ?? 2)); break;
    case "wing+": values.DYNAMAC_WING_WIDTH += amount ?? 2; break;
    case "wing-": values.DYNAMAC_WING_WIDTH = Math.max(8, values.DYNAMAC_WING_WIDTH - (amount ?? 2)); break;
    case "r+":
      values.DYNAMAC_INNER_RADIUS += amount ?? 1;
      values.DYNAMAC_OUTER_RADIUS += amount ?? 1;
      break;
    case "r-":
      values.DYNAMAC_INNER_RADIUS = Math.max(0, values.DYNAMAC_INNER_RADIUS - (amount ?? 1));
      values.DYNAMAC_OUTER_RADIUS = Math.max(0, values.DYNAMAC_OUTER_RADIUS - (amount ?? 1));
      break;
    case "setw": values.DYNAMAC_NOTCH_WIDTH = number(rawAmount, values.DYNAMAC_NOTCH_WIDTH); break;
    case "seth": values.DYNAMAC_COMPACT_HEIGHT = number(rawAmount, values.DYNAMAC_COMPACT_HEIGHT); break;
    case "setwing": values.DYNAMAC_WING_WIDTH = number(rawAmount, values.DYNAMAC_WING_WIDTH); break;
    case "save":
      save();
      printValues();
      return;
    case "quit":
    case "q":
      if (child) child.kill();
      process.exit(0);
      return;
    case "help":
    case "?":
      printHelp();
      return;
    default:
      console.log(`Unknown command: ${command}`);
      printHelp();
      return;
  }
  printValues();
  startNative();
}

function printHelp() {
  console.log(`\nLive notch calibration commands:
  w+ [n] / w- [n]         widen/narrow fake notch + transparent cutout
  h+ [n] / h- [n]         taller/shorter compact overlay
  wing+ [n] / wing- [n]   widen/narrow side nubs
  r+ [n] / r- [n]         round/sharpen corners
  setw N                  set exact notch width
  seth N                  set exact compact height
  setwing N               set exact wing width
  save                    save to .dynamac-calibration.json
  q                       quit
\nLook at the real MacBook screen, not a screenshot. Match the QA silhouette to the physical notch, then save.\n`);
}

run("npm", ["run", "native:build"]);
run("npm", ["run", "status:write"]);
printHelp();
printValues();
startNative();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "calibrate> " });
rl.prompt();
rl.on("line", line => {
  apply(line);
  rl.prompt();
});
rl.on("close", () => {
  if (child) child.kill();
});
