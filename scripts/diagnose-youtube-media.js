#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const {
  browserYouTubeScript,
  chromiumFallbackYouTubeTitleScript,
  CHROMIUM_YOUTUBE_BROWSERS,
  SAFARI_YOUTUBE_BROWSERS,
  FIREFOX_YOUTUBE_BROWSERS,
  parseDelimitedMedia,
  parseMediaRemoteNowPlaying
} = require("../src/mac-activity-status");

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 8000 });
  return {
    status: result.status,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
    error: result.error ? String(result.error.message || result.error) : ""
  };
}

function appInstalled(name) {
  const result = run("osascript", ["-e", `id of application ${JSON.stringify(name)}`]);
  return result.status === 0;
}

function frontmostApp() {
  const result = run("osascript", ["-e", 'tell application "System Events" to name of first application process whose frontmost is true']);
  return result.stdout || "unknown";
}

function summarizeRaw(raw) {
  if (!raw) return { kind: "empty", summary: "no YouTube tab result" };
  const info = parseDelimitedMedia(raw);
  if (!info) return { kind: "unparsed", summary: raw.slice(0, 220) };
  const kind = info.source === "youtube" ? (raw.startsWith("youtube-json||") ? "youtube-json" : "youtube-title") : info.source;
  const zeroTimingHint = kind === "youtube-json" && (!info.durationSeconds || !info.positionSeconds) ? " · timing=missing" : "";
  return {
    kind,
    summary: `${info.title || "untitled"} · state=${info.playbackState || "unknown"} · duration=${info.durationSeconds || 0} · position=${info.positionSeconds || 0}${zeroTimingHint}`
  };
}

function arcWindowTitles() {
  const script = [
    'try',
    'tell application "System Events"',
    'tell process "Arc"',
    'set titles to {}',
    'repeat with w in windows',
    'set end of titles to name of w',
    'end repeat',
    'return titles as text',
    'end tell',
    'end tell',
    'on error errMsg number errNo',
    'return "ERR||" & errNo & "||" & errMsg',
    'end try'
  ].join("\n");
  return run("osascript", ["-e", script]).stdout;
}

const browsers = [...CHROMIUM_YOUTUBE_BROWSERS, ...SAFARI_YOUTUBE_BROWSERS, ...FIREFOX_YOUTUBE_BROWSERS];
console.log(`Frontmost app: ${frontmostApp()}`);
const cdpRaw = run(process.execPath, [require("node:path").join(__dirname, "probe-youtube-cdp.js")]).stdout;
const cdpSummary = summarizeRaw(cdpRaw);
console.log(`CDP YouTube probe: ${cdpSummary.kind} — ${cdpSummary.summary}`);
const bridgePath = process.env.DYNAMAC_YOUTUBE_MEDIA_FILE || path.join(process.cwd(), ".build", "youtube-media.json");
let bridgeRaw = "";
try {
  const bridgePayload = JSON.parse(fs.readFileSync(bridgePath, "utf8"));
  bridgeRaw = `youtube-json||${JSON.stringify(bridgePayload)}||${bridgePayload.pageUrl || ""}`;
} catch (_) {}
const bridgeSummary = summarizeRaw(bridgeRaw);
console.log(`Local YouTube bridge: ${bridgeSummary.kind} — ${bridgeSummary.summary}`);
const mediaRemote = parseMediaRemoteNowPlaying(run("nowplaying-cli", ["get-raw"]).stdout);
if (mediaRemote) {
  console.log(`MediaRemote current: ${mediaRemote.source} — ${mediaRemote.title} · state=${mediaRemote.playbackState} · duration=${mediaRemote.durationSeconds} · position=${mediaRemote.positionSeconds}`);
} else {
  console.log("MediaRemote current: empty");
}
console.log("YouTube media probe:");
for (const browser of browsers) {
  if (!appInstalled(browser)) continue;
  let result;
  let raw;
  if (browser === "Arc") {
    result = run("osascript", ["-e", chromiumFallbackYouTubeTitleScript(browser)]);
    raw = result.stdout;
  } else {
    result = run("osascript", ["-e", browserYouTubeScript(browser)]);
    raw = result.stdout;
    if (!raw && CHROMIUM_YOUTUBE_BROWSERS.includes(browser)) {
      const fallback = run("osascript", ["-e", chromiumFallbackYouTubeTitleScript(browser)]);
      if (fallback.stdout) {
        result = fallback;
        raw = fallback.stdout;
      }
    }
  }
  const summary = summarizeRaw(raw);
  console.log(`- ${browser}: ${summary.kind} — ${summary.summary}`);
  if (browser === "Arc" && summary.kind === "empty") {
    const titles = arcWindowTitles();
    if (titles) console.log(`  Arc windows: ${titles}`);
    if (/Sign In to Arc/i.test(titles)) console.log("  Arc is open but signed out/onboarding; finish Arc sign-in once, then rerun this diagnostic.");
  }
  if (result.stderr) console.log(`  stderr: ${result.stderr.split("\n")[0]}`);
  if (result.status !== 0) console.log(`  status: ${result.status}${result.error ? ` error=${result.error}` : ""}`);
}

console.log("\nFor Arc/Chrome extension-player mode, run Dynamac with `npm run native:start`, relaunch Arc-Snuffles with `npm run start:arc-media` or Chrome with `npm run start:chrome-media`, allow YouTube loopback access to `127.0.0.1` when Arc asks, reload the YouTube tab, then play YouTube; Local YouTube bridge should become `youtube-json`.");
console.log("CDP and Apple Events browser probes remain compatibility paths; title-only probes do not beat active native players.");
