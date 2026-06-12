#!/usr/bin/env node

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { writeMacActivityStatusSnapshot } = require("../src/mac-activity-status");

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

const inherited = { ...loadCalibrationEnv(), ...process.env };
inherited.DYNAMAC_STATUS_FILE = inherited.DYNAMAC_STATUS_FILE || path.join(repoRoot, ".build/status.json");
inherited.DYNAMAC_STATUS_REFRESH_SIGNAL = inherited.DYNAMAC_STATUS_REFRESH_SIGNAL || path.join(repoRoot, ".build/status.refresh");
const lockPath = inherited.DYNAMAC_STATUS_LOCK || `${inherited.DYNAMAC_STATUS_FILE}.lock`;

function acquireSingleInstanceLock() {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  try {
    const fd = fs.openSync(lockPath, "wx");
    fs.writeFileSync(fd, `${process.pid}\n${new Date().toISOString()}\n`);
    return fd;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existingPid = Number(fs.readFileSync(lockPath, "utf8").split(/\s+/)[0]);
    if (Number.isFinite(existingPid)) {
      try {
        process.kill(existingPid, 0);
        console.error(`Dynamac native-start is already running for ${inherited.DYNAMAC_STATUS_FILE} (pid ${existingPid}).`);
        process.exit(2);
      } catch (_) {
        fs.rmSync(lockPath, { force: true });
        return acquireSingleInstanceLock();
      }
    }
    fs.rmSync(lockPath, { force: true });
    return acquireSingleInstanceLock();
  }
}

const lockFd = acquireSingleInstanceLock();
let lastStatusPayload = null;

function refreshStatus({ log = false } = {}) {
  try {
    const result = writeMacActivityStatusSnapshot({ outputPath: inherited.DYNAMAC_STATUS_FILE, previousPayload: lastStatusPayload });
    lastStatusPayload = result.payload;
    if (log) console.log(`Mac activity snapshot written: ${result.outputPath}`);
  } catch (error) {
    console.error(`Mac activity snapshot refresh failed: ${error.message}`);
  }
}

refreshStatus({ log: true });
fs.mkdirSync(path.dirname(inherited.DYNAMAC_STATUS_REFRESH_SIGNAL), { recursive: true });
fs.writeFileSync(inherited.DYNAMAC_STATUS_REFRESH_SIGNAL, "0\n");
fs.watchFile(inherited.DYNAMAC_STATUS_REFRESH_SIGNAL, { interval: 80 }, () => refreshStatus());
const refreshIntervalMs = Number(inherited.DYNAMAC_STATUS_REFRESH_MS || 250);
const refreshTimer = inherited.DYNAMAC_DISABLE_STATUS_REFRESH === "1"
  ? null
  : setInterval(refreshStatus, Number.isFinite(refreshIntervalMs) && refreshIntervalMs >= 200 ? refreshIntervalMs : 250);

const native = childProcess.spawn(path.join(repoRoot, ".build/dynamac-native"), {
  cwd: repoRoot,
  env: inherited,
  stdio: "inherit"
});

function cleanup() {
  if (refreshTimer) clearInterval(refreshTimer);
  fs.unwatchFile(inherited.DYNAMAC_STATUS_REFRESH_SIGNAL);
  try { fs.closeSync(lockFd); } catch (_) {}
  fs.rmSync(lockPath, { force: true });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    cleanup();
    if (native.exitCode === null) native.kill(signal);
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
}

native.on("exit", (code, signal) => {
  cleanup();
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
