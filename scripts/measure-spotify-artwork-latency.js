#!/usr/bin/env node

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const statusPath = process.env.DYNAMAC_STATUS_FILE || path.join(repoRoot, ".build/status.json");
const refreshSignal = process.env.DYNAMAC_STATUS_REFRESH_SIGNAL || path.join(repoRoot, ".build/status.refresh");

function run(command, args, options = {}) {
  try {
    return childProcess.execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 2000,
      ...options
    }).trim();
  } catch (error) {
    return (error.stdout || error.stderr || error.message || "").toString().trim();
  }
}

function readStatusMedia() {
  try {
    const payload = JSON.parse(fs.readFileSync(statusPath, "utf8"));
    return payload.statuses?.find((status) => status.agent === "Now Playing")?.media || null;
  } catch (_error) {
    return null;
  }
}

function readMediaRemote() {
  const raw = run("nowplaying-cli", ["get-raw"], { timeout: 1200 });
  if (!raw || raw.startsWith("Error")) return null;
  try {
    const payload = JSON.parse(raw);
    return {
      bundle: payload.kMRMediaRemoteNowPlayingInfoClientBundleIdentifier,
      title: payload.kMRMediaRemoteNowPlayingInfoTitle,
      artist: payload.kMRMediaRemoteNowPlayingInfoArtist,
      elapsed: payload.kMRMediaRemoteNowPlayingInfoElapsedTime,
      rate: payload.kMRMediaRemoteNowPlayingInfoPlaybackRate,
      hasArtworkData: Boolean(payload.kMRMediaRemoteNowPlayingInfoArtworkData)
    };
  } catch (_error) {
    return null;
  }
}

function touchRefreshSignal() {
  fs.mkdirSync(path.dirname(refreshSignal), { recursive: true });
  fs.writeFileSync(refreshSignal, `${Date.now()}\n`);
}

function spotify(command) {
  return run("osascript", ["-e", `if application \"Spotify\" is running then tell application \"Spotify\" to ${command}`], { timeout: 5000 });
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const beforeStatus = readStatusMedia();
  const beforeRemote = readMediaRemote();
  console.log("before.status", JSON.stringify(beforeStatus));
  console.log("before.remote", JSON.stringify(beforeRemote));

  if (beforeRemote?.bundle !== "com.spotify.client" && beforeStatus?.source !== "spotify") {
    console.error("Spotify is not the current Now Playing source. Start playback in Spotify first, then rerun this script.");
    process.exitCode = 2;
    return;
  }

  const beforeTitle = beforeStatus?.title || beforeRemote?.title || "";
  const beforeArtwork = beforeStatus?.artworkUrl || "";
  const start = Date.now();
  console.log("command.next", spotify("next track"));
  touchRefreshSignal();

  let titleChangedAt = null;
  let artworkChangedAt = null;
  let lastStatus = null;
  let lastRemote = null;

  for (let i = 0; i < 80; i += 1) {
    touchRefreshSignal();
    await sleep(100);
    lastStatus = readStatusMedia();
    lastRemote = readMediaRemote();
    const title = lastStatus?.title || lastRemote?.title || "";
    const artwork = lastStatus?.artworkUrl || "";
    if (!titleChangedAt && title && title !== beforeTitle) titleChangedAt = Date.now() - start;
    if (!artworkChangedAt && artwork && artwork !== beforeArtwork) artworkChangedAt = Date.now() - start;
    if (titleChangedAt && artworkChangedAt) break;
  }

  console.log("after.status", JSON.stringify(lastStatus));
  console.log("after.remote", JSON.stringify(lastRemote));
  console.log("latency.title_ms", titleChangedAt ?? "not_changed");
  console.log("latency.artwork_ms", artworkChangedAt ?? "not_changed");
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
