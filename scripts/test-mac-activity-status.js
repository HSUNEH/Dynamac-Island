#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  browserYouTubeScript,
  CHROMIUM_YOUTUBE_BROWSERS,
  chromiumFallbackYouTubeTitleScript,
  FIREFOX_YOUTUBE_BROWSERS,
  SAFARI_YOUTUBE_BROWSERS,
  buildMacActivityStatusPayload,
  classifyClipboardText,
  collectBatteryStatus,
  collectClipboardStatus,
  collectMediaStatus,
  formatDuration,
  parseDelimitedMedia,
  parseMediaRemoteNowPlaying,
  parsePmsetBattery,
  youtubeThumbnailUrl,
  writeMacActivityStatusSnapshot
} = require("../src/mac-activity-status");

const sourceText = fs.readFileSync(path.join(__dirname, "..", "src", "mac-activity-status.js"), "utf8");

assert.deepEqual(parsePmsetBattery("Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1234567)\t19%; discharging; 1:20 remaining present: true"), {
  agent: "Battery",
  state: "warning",
  task: "Battery 19%",
  detail: "Now drawing from 'Battery Power' -InternalBattery-0 (id=1234567) 19%; discharging; 1:20 remaining present: true"
});

assert.equal(parsePmsetBattery("Now drawing from 'AC Power'\n -InternalBattery-0\t82%; charging; 0:35 remaining present: true").task, "Charging 82%");
assert.equal(classifyClipboardText("https://example.com/a").task, "Link copied · 21 chars");
assert.equal(classifyClipboardText("/Users/st/file.txt").task, "Path copied · 18 chars");
assert.equal(classifyClipboardText("hello").task, "Text copied · 5 chars");
assert.equal(formatDuration(65.9), "1:05");
assert.equal(youtubeThumbnailUrl("https://www.youtube.com/watch?v=abcDEF_1234"), "https://img.youtube.com/vi/abcDEF_1234/hqdefault.jpg");

const spotifyText = "spotify||Song Title||Artist Name||Album Name||https://i.scdn.co/image/abc||240000||42.4||playing";
const spotifyInfo = parseDelimitedMedia(spotifyText);
assert.equal(spotifyInfo.source, "spotify");
assert.equal(spotifyInfo.durationSeconds, 240);
assert.equal(spotifyInfo.positionSeconds, 42.4);
assert.equal(spotifyInfo.artworkUrl, "https://i.scdn.co/image/abc");

const musicInfo = parseDelimitedMedia("music||Song Title||Artist Name||Album Name||/tmp/dynamac-music-artwork.jpg||240||42.4||paused");
assert.equal(musicInfo.source, "music");
assert.equal(musicInfo.artworkUrl, "/tmp/dynamac-music-artwork.jpg");
assert.equal(musicInfo.playbackState, "paused");

const youtubeInfo = parseDelimitedMedia("youtube||Video Title||||YouTube||||0||0||unknown||https://www.youtube.com/watch?v=abcDEF_1234");
assert.equal(youtubeInfo.source, "youtube");
assert.equal(youtubeInfo.artworkUrl, "https://img.youtube.com/vi/abcDEF_1234/hqdefault.jpg");

const youtubePlayingText = 'youtube-json||{"title":"Video Title","artist":"Channel","album":"YouTube","artworkUrl":"https://i.ytimg.com/vi/abcDEF_1234/hqdefault.jpg","durationSeconds":1521,"positionSeconds":8,"playbackState":"playing"}||https://www.youtube.com/watch?v=abcDEF_1234';
const youtubeJsonInfo = parseDelimitedMedia(youtubePlayingText);
assert.equal(youtubeJsonInfo.source, "youtube");
assert.equal(youtubeJsonInfo.title, "Video Title");
assert.equal(youtubeJsonInfo.artist, "Channel");
assert.equal(youtubeJsonInfo.durationSeconds, 1521);
assert.equal(youtubeJsonInfo.positionSeconds, 8);
assert.equal(youtubeJsonInfo.playbackState, "playing");
assert.equal(youtubeJsonInfo.artworkUrl, "https://i.ytimg.com/vi/abcDEF_1234/hqdefault.jpg");

const arcMediaRemoteRaw = JSON.stringify({
  kMRMediaRemoteNowPlayingInfoClientBundleIdentifier: "company.thebrowser.Browser",
  kMRMediaRemoteNowPlayingInfoTitle: "Arc Video",
  kMRMediaRemoteNowPlayingInfoArtist: "Arc Channel",
  kMRMediaRemoteNowPlayingInfoDuration: 321,
  kMRMediaRemoteNowPlayingInfoElapsedTime: 42,
  kMRMediaRemoteNowPlayingInfoPlaybackRate: 1
});
const arcMediaRemoteInfo = parseMediaRemoteNowPlaying(arcMediaRemoteRaw);
assert.equal(arcMediaRemoteInfo.source, "youtube");
assert.equal(arcMediaRemoteInfo.title, "Arc Video");
assert.equal(arcMediaRemoteInfo.positionSeconds, 42);
assert.equal(arcMediaRemoteInfo.durationSeconds, 321);
assert.equal(arcMediaRemoteInfo.playbackState, "playing");

assert.deepEqual(CHROMIUM_YOUTUBE_BROWSERS.includes("Google Chrome"), true);
assert.deepEqual(CHROMIUM_YOUTUBE_BROWSERS.includes("Arc"), true);
assert.deepEqual(CHROMIUM_YOUTUBE_BROWSERS.includes("Vivaldi"), true);
assert.deepEqual(CHROMIUM_YOUTUBE_BROWSERS.includes("Opera"), true);
assert.deepEqual(CHROMIUM_YOUTUBE_BROWSERS.includes("Orion"), true);
assert.deepEqual(SAFARI_YOUTUBE_BROWSERS.includes("Safari"), true);
assert.deepEqual(FIREFOX_YOUTUBE_BROWSERS.includes("Firefox"), true);

const firefoxInfo = parseDelimitedMedia("youtube-title||Lo-fi beats - YouTube — Mozilla Firefox||firefox-window");
assert.equal(firefoxInfo.source, "youtube");
assert.equal(firefoxInfo.title, "Lo-fi beats");
assert.equal(firefoxInfo.playbackState, "unknown");

const arcYouTubeScript = browserYouTubeScript("Arc");
assert.match(arcYouTubeScript, /execute t javascript/, "Arc/Chromium YouTube detection should use Chrome's execute-tab-javascript AppleScript form");
assert.doesNotMatch(arcYouTubeScript, /execute javascript[\s\S]* in t/, "Arc/Chromium YouTube detection must not use the Safari-style execute-javascript-in-tab form");
assert.doesNotMatch(arcYouTubeScript, /execute t javascript "[^"]*\n/, "Arc/Chromium YouTube detection should pass one-line AppleScript-safe JavaScript to osascript");
assert.match(arcYouTubeScript, /getDuration/, "Chromium YouTube detection should read duration from YouTube movie_player API before falling back to video tags");
assert.match(arcYouTubeScript, /getCurrentTime/, "Chromium YouTube detection should read currentTime from YouTube movie_player API before falling back to video tags");
assert.match(arcYouTubeScript, /html5-main-video/, "Chromium YouTube detection should target the main YouTube video element instead of arbitrary sidebar videos");
assert.match(arcYouTubeScript, /System Events/, "Arc/Chromium detection should fall back to window-title probing if browser tab scripting fails");
assert.match(arcYouTubeScript, /does not contain "YouTube Studio"/, "Arc/Chromium title fallback should not treat YouTube Studio as playback");
const arcFallbackScript = chromiumFallbackYouTubeTitleScript("Arc");
assert.match(arcFallbackScript, /System Events/, "Arc fallback should be callable as a separate System Events script after Arc tab scripting times out");
assert.match(sourceText, /browserName === "Arc"[\s\S]*chromiumFallbackYouTubeTitleScript\(browserName\)[\s\S]*return null/, "Arc collection should use fast System Events title fallback first instead of hanging on Arc tab AppleScript");
assert.doesNotMatch(arcFallbackScript, /tell application "Arc"/, "Arc fallback should not depend on Arc's own AppleScript dictionary after a timeout");
assert.match(arcYouTubeScript, /youtube\.com\/watch/, "Arc YouTube detection should scan watch tabs");

const safariYouTubeScript = browserYouTubeScript("Safari");
assert.match(safariYouTubeScript, /do JavaScript[\s\S]* in t/, "Safari YouTube detection should use Safari's do-JavaScript-in-tab form");

const firefoxYouTubeScript = browserYouTubeScript("Firefox");
assert.match(firefoxYouTubeScript, /System Events/, "Firefox fallback should use System Events because Firefox does not expose tab JavaScript via AppleScript");
assert.match(firefoxYouTubeScript, /youtube-title/, "Firefox fallback should return title-based YouTube metadata");
assert.doesNotMatch(firefoxYouTubeScript, /execute javascript|do JavaScript/, "Firefox fallback must not pretend to execute tab JavaScript");

const youtubeBeatsSpotify = collectMediaStatus({
  browserMediaTexts: [youtubePlayingText],
  mediaRemoteRaw: "",
  spotifyText,
  musicText: "",
  frontmostApp: "Spotify"
});
assert.equal(youtubeBeatsSpotify.media.source, "youtube");
assert.equal(youtubeBeatsSpotify.media.title, "Video Title");

const arcMediaRemoteBeatsSpotify = collectMediaStatus({
  browserMediaTexts: [],
  mediaRemoteRaw: arcMediaRemoteRaw,
  spotifyText,
  musicText: "",
  frontmostApp: "Spotify"
});
assert.equal(arcMediaRemoteBeatsSpotify.media.source, "youtube");
assert.equal(arcMediaRemoteBeatsSpotify.media.title, "Arc Video");
assert.equal(arcMediaRemoteBeatsSpotify.media.elapsedLabel, "0:42");

const frontmostArcTitleFallbackDoesNotBeatSpotify = collectMediaStatus({
  browserMediaTexts: [{ browserName: "Arc", text: "youtube-title||[Vlog] 10년차 무명 배우 브이로그 - YouTube||https://www.youtube.com/watch?v=vlog12345" }],
  mediaRemoteRaw: "",
  spotifyText,
  musicText: "",
  frontmostApp: "Arc"
});
assert.equal(frontmostArcTitleFallbackDoesNotBeatSpotify.media.source, "spotify");

const frontmostArcTitleFallbackWinsWhenNoNativePlayer = collectMediaStatus({
  browserMediaTexts: [{ browserName: "Arc", text: "youtube-title||[Vlog] 10년차 무명 배우 브이로그 - YouTube||https://www.youtube.com/watch?v=vlog12345" }],
  mediaRemoteRaw: "",
  spotifyText: "",
  musicText: "",
  frontmostApp: "Arc"
});
assert.equal(frontmostArcTitleFallbackWinsWhenNoNativePlayer.media.source, "youtube");
assert.equal(frontmostArcTitleFallbackWinsWhenNoNativePlayer.media.title, "[Vlog] 10년차 무명 배우 브이로그");

const backgroundYoutubeFallbackDoesNotBeatSpotify = collectMediaStatus({
  browserMediaTexts: ["youtube-title||Old tab - YouTube||https://www.youtube.com/watch?v=old12345"],
  mediaRemoteRaw: "",
  spotifyText,
  musicText: "",
  frontmostApp: "Spotify"
});
assert.equal(backgroundYoutubeFallbackDoesNotBeatSpotify.media.source, "spotify");

const payload = buildMacActivityStatusPayload({
  now: new Date("2026-06-11T09:00:00.000Z"),
  mediaInfo: spotifyInfo,
  clipboardText: "https://example.com/a",
  pmsetOutput: "Now drawing from 'AC Power'\n -InternalBattery-0\t82%; charging; 0:35 remaining present: true"
});

assert.deepEqual(payload.statuses.map((status) => status.agent), ["Now Playing", "Clipboard", "Battery"]);
assert.equal(payload.statuses[0].state, "running");
assert.equal(payload.statuses[0].task, "Song Title");
assert.equal(payload.statuses[0].detail, "Artist Name");
assert.equal(payload.statuses[0].media.title, "Song Title");
assert.equal(payload.statuses[0].media.artist, "Artist Name");
assert.equal(payload.statuses[0].media.elapsedLabel, "0:42");
assert.equal(payload.statuses[0].media.durationLabel, "4:00");
assert.equal(payload.statuses[1].task, "Link copied · 21 chars");
assert.equal(payload.statuses[2].task, "Charging 82%");
assert.equal(payload.statuses.every((status) => status.updatedAt === "2026-06-11T09:00:00.000Z"), true);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dynamac-mac-activity-"));
const outputPath = path.join(tempDir, "status.json");
const result = writeMacActivityStatusSnapshot({
  outputPath,
  now: new Date("2026-06-11T09:00:00.000Z"),
  mediaInfo: null,
  clipboardText: "hello",
  pmsetOutput: "Now drawing from 'Battery Power'\n -InternalBattery-0\t77%; discharging; 5:00 remaining present: true"
});
assert.equal(result.ok, true);
assert.equal(fs.existsSync(outputPath), true);
const written = JSON.parse(fs.readFileSync(outputPath, "utf8"));
assert.equal(written.statuses.length, 3);
assert.equal(written.statuses[0].media.playbackState, "idle");

console.log("Mac activity status snapshot test passed.");
