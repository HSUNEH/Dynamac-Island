#!/usr/bin/env node

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const calibrationPath = path.join(repoRoot, ".dynamac-calibration.json");

function run(command, args, options = {}) {
  childProcess.execFileSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    ...options
  });
}

function loadCalibrationEnv() {
  if (!fs.existsSync(calibrationPath)) return {};
  const calibration = JSON.parse(fs.readFileSync(calibrationPath, "utf8"));
  const env = {};
  for (const [key, value] of Object.entries(calibration)) {
    if (value !== undefined && value !== null && value !== "") {
      env[key] = String(value);
    }
  }
  return env;
}

run("npm", ["run", "native:build"]);
run("npm", ["run", "status:write"]);

const inherited = { ...loadCalibrationEnv(), ...process.env };
inherited.DYNAMAC_STATUS_FILE = inherited.DYNAMAC_STATUS_FILE || path.join(repoRoot, ".build/status.json");

const native = childProcess.spawn(path.join(repoRoot, ".build/dynamac-native"), {
  cwd: repoRoot,
  env: inherited,
  stdio: "inherit"
});

native.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
