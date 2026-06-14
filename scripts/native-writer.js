#!/usr/bin/env node

// Standalone status-writer service for the packaged .app.
//
// In the dev flow, scripts/native-start.js runs the writer loop in-process and
// spawns the Swift binary as a child. In the packaged .app the Swift app is the
// parent process instead, and it spawns THIS script to run the same writer
// service (status snapshot loop + YouTube media bridge + single-instance lock)
// without rebuilding or launching the overlay. Keeping the writer in node lets
// the bundle reuse src/mac-activity-status.js untouched.

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { writeMacActivityStatusSnapshot } = require("../src/mac-activity-status");

const repoRoot = path.resolve(__dirname, "..");
const env = process.env;
const statusFile = env.DYNAMAC_STATUS_FILE || path.join(repoRoot, ".build/status.json");
const refreshSignal = env.DYNAMAC_STATUS_REFRESH_SIGNAL || path.join(repoRoot, ".build/status.refresh");
const lockPath = env.DYNAMAC_STATUS_LOCK || `${statusFile}.lock`;

// Artwork cache and the YouTube bridge file otherwise default to a cwd-relative
// `.build/` dir. A Finder-launched .app runs from `/`, so those writes fail (or
// land inside the read-only bundle). Anchor them next to the status snapshot —
// a writable location (Application Support in the .app, .build in dev).
const baseDir = path.dirname(statusFile);
const artworkCacheDir = env.DYNAMAC_ARTWORK_CACHE_DIR || path.join(baseDir, "artwork-cache");
const youtubeMediaFile = env.DYNAMAC_YOUTUBE_MEDIA_FILE || path.join(baseDir, "youtube-media.json");
// Share the resolved bridge file with the spawned bridge server and the reader.
env.DYNAMAC_YOUTUBE_MEDIA_FILE = youtubeMediaFile;

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
        console.error(`Dynamac writer already running for ${statusFile} (pid ${existingPid}).`);
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

function startYouTubeBridge() {
  if (env.DYNAMAC_DISABLE_YOUTUBE_BRIDGE === "1") return null;
  const child = childProcess.spawn(process.execPath, [path.join(repoRoot, "scripts/youtube-media-bridge-server.js")], {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "inherit", "inherit"]
  });
  child.on("exit", (code, signal) => {
    if (code !== 0 && signal !== "SIGTERM") console.error(`YouTube media bridge exited: code=${code} signal=${signal || ""}`);
  });
  return child;
}

const youtubeBridge = startYouTubeBridge();

function refreshStatus({ log = false } = {}) {
  try {
    const result = writeMacActivityStatusSnapshot({
      outputPath: statusFile,
      previousPayload: lastStatusPayload,
      artworkCacheDir,
      youtubeBridgePath: youtubeMediaFile
    });
    lastStatusPayload = result.payload;
    if (log) console.log(`Mac activity snapshot written: ${result.outputPath}`);
  } catch (error) {
    console.error(`Mac activity snapshot refresh failed: ${error.message}`);
  }
}

refreshStatus({ log: true });
fs.mkdirSync(path.dirname(refreshSignal), { recursive: true });
fs.writeFileSync(refreshSignal, "0\n");
fs.watchFile(refreshSignal, { interval: 80 }, () => refreshStatus());
const refreshIntervalMs = Number(env.DYNAMAC_STATUS_REFRESH_MS || 250);
const refreshTimer = env.DYNAMAC_DISABLE_STATUS_REFRESH === "1"
  ? null
  : setInterval(refreshStatus, Number.isFinite(refreshIntervalMs) && refreshIntervalMs >= 200 ? refreshIntervalMs : 250);

function cleanup() {
  if (refreshTimer) clearInterval(refreshTimer);
  if (youtubeBridge && youtubeBridge.exitCode === null) youtubeBridge.kill("SIGTERM");
  fs.unwatchFile(refreshSignal);
  try { fs.closeSync(lockFd); } catch (_) {}
  fs.rmSync(lockPath, { force: true });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    cleanup();
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
}

process.on("exit", cleanup);
