#!/usr/bin/env node

const assert = require("node:assert");
const crypto = require("node:crypto");
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
  collectBrightnessHudStatus,
  collectClipboardStatus,
  collectVolumeHudStatus,
  collectMediaCandidates,
  collectMediaStatus,
  formatDuration,
  parseDelimitedMedia,
  parseMediaRemoteNowPlaying,
  parsePmsetBattery,
  stabilizeMediaProgress,
  youtubeThumbnailUrl,
  writeMacActivityStatusSnapshot
} = require("../src/mac-activity-status");
const { createClipboardActivityState } = require("../src/clipboard-activity");

process.env.DYNAMAC_YOUTUBE_MEDIA_FILE = path.join(os.tmpdir(), `dynamac-test-youtube-media-${process.pid}.json`);
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

const firstVolumeHudStatus = collectVolumeHudStatus({
  volumeInput: {
    level: 25,
    muted: false,
    deviceName: "MacBook Pro Speakers",
    source: "fixture-volume-observer",
    observedAt: 1718323200000
  }
});
assert.equal(firstVolumeHudStatus.agent, "Volume");
assert.equal(firstVolumeHudStatus.task, "Volume 25%");
assert.equal(firstVolumeHudStatus.volumeHud.activityType, "volume");
assert.equal(firstVolumeHudStatus.volumeHud.status.direction, "initial");
assert.equal(firstVolumeHudStatus.volumeHud.compactSurface.label, "25%");
assert.equal(firstVolumeHudStatus.volumeHud.persisted, false);

const louderVolumeHudStatus = collectVolumeHudStatus({
  volumeActivityState: { active: firstVolumeHudStatus.volumeHud },
  volumeInput: {
    level: 61,
    muted: false,
    deviceName: "MacBook Pro Speakers",
    source: "fixture-volume-observer",
    observedAt: 1718323200200
  }
});
assert.equal(louderVolumeHudStatus.volumeHud.activityId, "volume-1718323200000");
assert.equal(louderVolumeHudStatus.volumeHud.status.previousLevel, 25);
assert.equal(louderVolumeHudStatus.volumeHud.status.direction, "up");
assert.equal(louderVolumeHudStatus.detail, "Output volume increased from 25% to 61%.");

const firstBrightnessHudStatus = collectBrightnessHudStatus({
  brightnessInput: {
    level: 40,
    displayName: "Built-in Liquid Retina XDR",
    source: "fixture-brightness-observer",
    observedAt: 1718323200300
  }
});
assert.equal(firstBrightnessHudStatus.agent, "Brightness");
assert.equal(firstBrightnessHudStatus.task, "Brightness 40%");
assert.equal(firstBrightnessHudStatus.brightnessHud.activityType, "brightness");
assert.equal(firstBrightnessHudStatus.brightnessHud.status.direction, "initial");
assert.equal(firstBrightnessHudStatus.brightnessHud.compactSurface.label, "40%");
assert.equal(firstBrightnessHudStatus.brightnessHud.persisted, false);

const dimmerBrightnessHudStatus = collectBrightnessHudStatus({
  brightnessActivityState: { active: firstBrightnessHudStatus.brightnessHud },
  brightnessInput: {
    level: 17,
    displayName: "Built-in Liquid Retina XDR",
    source: "fixture-brightness-observer",
    observedAt: 1718323200500
  }
});
assert.equal(dimmerBrightnessHudStatus.brightnessHud.activityId, "brightness-1718323200300");
assert.equal(dimmerBrightnessHudStatus.brightnessHud.status.previousLevel, 40);
assert.equal(dimmerBrightnessHudStatus.brightnessHud.status.direction, "down");
assert.equal(dimmerBrightnessHudStatus.detail, "Display brightness decreased from 40% to 17%.");

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
assert.equal(arcMediaRemoteInfo.source, "browser-media");
assert.equal(arcMediaRemoteInfo.title, "Arc Video");
assert.equal(arcMediaRemoteInfo.positionSeconds, 42);
assert.equal(arcMediaRemoteInfo.durationSeconds, 321);
assert.equal(arcMediaRemoteInfo.playbackState, "playing");

const serviceBundleExpectations = [
  ["com.tidal.desktop", "tidal"],
  ["com.kakao.melon", "melon"],
  ["com.ktmusic.genie", "genie"],
  ["com.google.YouTubeMusic", "youtube-music"]
];
for (const [bundleIdentifier, expectedSource] of serviceBundleExpectations) {
  const parsed = parseMediaRemoteNowPlaying(JSON.stringify({
    kMRMediaRemoteNowPlayingInfoClientBundleIdentifier: bundleIdentifier,
    kMRMediaRemoteNowPlayingInfoTitle: `${expectedSource} title`,
    kMRMediaRemoteNowPlayingInfoArtist: `${expectedSource} artist`,
    kMRMediaRemoteNowPlayingInfoPlaybackRate: 1
  }));
  assert.equal(parsed.source, expectedSource);
  assert.equal(parsed.playbackState, "playing");
}

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

const candidatesIncludeGenericPlayingSources = collectMediaCandidates({
  browserMediaTexts: [youtubePlayingText],
  mediaRemoteRaw: "",
  spotifyText,
  musicText: "",
  frontmostApp: "Spotify"
});
assert.deepEqual(candidatesIncludeGenericPlayingSources.filter((item) => item.playbackState === "playing").map((item) => item.source), ["youtube", "spotify"]);

const previousSpotifyFirstPayload = {
  statuses: [{
    agent: "Now Playing",
    updatedAt: "2026-06-12T12:00:00.000Z",
    media: {
      source: "spotify",
      title: "Song Title",
      artist: "Artist Name",
      playbackState: "playing",
      firstSeenAt: "2026-06-12T12:00:00.000Z"
    }
  }]
};
const youtubeDoesNotBeatAlreadyPlayingSpotify = collectMediaStatus({
  browserMediaTexts: [youtubePlayingText],
  mediaRemoteRaw: "",
  spotifyText,
  musicText: "",
  frontmostApp: "Google Chrome",
  previousPayload: previousSpotifyFirstPayload,
  now: new Date("2026-06-12T12:00:05.000Z")
});
assert.equal(youtubeDoesNotBeatAlreadyPlayingSpotify.media.source, "spotify");
assert.equal(youtubeDoesNotBeatAlreadyPlayingSpotify.media.title, "Song Title");

const previousYouTubeFirstPayload = {
  statuses: [{
    agent: "Now Playing",
    updatedAt: "2026-06-12T12:00:00.000Z",
    media: {
      source: "youtube",
      title: "Video Title",
      artist: "Channel",
      playbackState: "playing",
      firstSeenAt: "2026-06-12T12:00:00.000Z"
    }
  }]
};
const alreadyPlayingYouTubeStaysSelectedAgainstSpotify = collectMediaStatus({
  frontmostApp: "Spotify",
  frontmostBrowserMediaText: youtubePlayingText,
  mediaRemoteRaw: JSON.stringify({
    kMRMediaRemoteNowPlayingInfoClientBundleIdentifier: "com.spotify.client",
    kMRMediaRemoteNowPlayingInfoTitle: "Crush",
    kMRMediaRemoteNowPlayingInfoArtist: "10CM",
    kMRMediaRemoteNowPlayingInfoDuration: 239,
    kMRMediaRemoteNowPlayingInfoElapsedTime: 33,
    kMRMediaRemoteNowPlayingInfoPlaybackRate: 1
  }),
  spotifyText,
  musicText: "",
  previousPayload: previousYouTubeFirstPayload,
  now: new Date("2026-06-12T12:00:05.000Z")
});
assert.equal(alreadyPlayingYouTubeStaysSelectedAgainstSpotify.media.source, "youtube");
assert.equal(alreadyPlayingYouTubeStaysSelectedAgainstSpotify.media.title, "Video Title");
assert.equal(alreadyPlayingYouTubeStaysSelectedAgainstSpotify.media.positionSeconds, 8);

const frontmostArcTitleDoesNotBeatSpotify = collectMediaStatus({
  frontmostApp: "Arc",
  frontmostBrowserMediaText: "youtube-title||12시간 뒤, 여러분은 다른 사람이 됩니다. - YouTube||browser-window",
  mediaRemoteRaw: JSON.stringify({
    kMRMediaRemoteNowPlayingInfoClientBundleIdentifier: "com.spotify.client",
    kMRMediaRemoteNowPlayingInfoTitle: "Crush",
    kMRMediaRemoteNowPlayingInfoArtist: "10CM",
    kMRMediaRemoteNowPlayingInfoDuration: 239,
    kMRMediaRemoteNowPlayingInfoElapsedTime: 33,
    kMRMediaRemoteNowPlayingInfoPlaybackRate: 1
  }),
  spotifyText,
  musicText: ""
});
assert.equal(frontmostArcTitleDoesNotBeatSpotify.media.source, "spotify");
assert.equal(frontmostArcTitleDoesNotBeatSpotify.media.title, "Song Title");

const arcMediaRemoteBeatsSpotify = collectMediaStatus({
  browserMediaTexts: [],
  mediaRemoteRaw: arcMediaRemoteRaw,
  spotifyText,
  musicText: "",
  frontmostApp: "Spotify"
});
assert.equal(arcMediaRemoteBeatsSpotify.media.source, "browser-media");
assert.equal(arcMediaRemoteBeatsSpotify.media.title, "Arc Video");
assert.equal(arcMediaRemoteBeatsSpotify.media.elapsedLabel, "0:42");

const plainArcMediaRemoteEnrichedBySpaceTabs = collectMediaStatus({
  browserMediaTexts: [],
  arcSpaceMediaTexts: ["youtube-title||Arc Video - YouTube||https://www.youtube.com/watch?v=arcPlain123"],
  mediaRemoteRaw: arcMediaRemoteRaw,
  spotifyText: "",
  musicText: "",
  frontmostApp: "Arc"
});
assert.equal(plainArcMediaRemoteEnrichedBySpaceTabs.media.source, "youtube");
assert.equal(plainArcMediaRemoteEnrichedBySpaceTabs.media.title, "Arc Video");
assert.equal(plainArcMediaRemoteEnrichedBySpaceTabs.media.pageUrl, "https://www.youtube.com/watch?v=arcPlain123");
assert.equal(plainArcMediaRemoteEnrichedBySpaceTabs.media.artworkUrl, "https://img.youtube.com/vi/arcPlain123/hqdefault.jpg");
assert.equal(plainArcMediaRemoteEnrichedBySpaceTabs.media.playbackState, "playing");

const mediaRemotePlayingSkipsBrowserProbe = collectMediaStatus({
  cdpMediaText: "",
  browserMediaTexts: ["youtube-json||Slow Browser Probe||Channel||0||0||playing||https://img.example/slow.jpg||https://www.youtube.com/watch?v=slow12345"],
  mediaRemoteRaw: arcMediaRemoteRaw,
  spotifyText,
  musicText: "",
  frontmostApp: "Google Chrome"
});
assert.equal(mediaRemotePlayingSkipsBrowserProbe.media.title, "Arc Video");
assert.equal(mediaRemotePlayingSkipsBrowserProbe.media.positionSeconds, 42);

const cdpYouTubeBeatsSpotifyMediaRemote = collectMediaStatus({
  cdpMediaText: youtubePlayingText,
  browserMediaTexts: [],
  mediaRemoteRaw: JSON.stringify({
    kMRMediaRemoteNowPlayingInfoClientBundleIdentifier: "com.spotify.client",
    kMRMediaRemoteNowPlayingInfoTitle: "Crush",
    kMRMediaRemoteNowPlayingInfoArtist: "10CM",
    kMRMediaRemoteNowPlayingInfoDuration: 239,
    kMRMediaRemoteNowPlayingInfoElapsedTime: 33,
    kMRMediaRemoteNowPlayingInfoPlaybackRate: 1
  }),
  spotifyText,
  musicText: "",
  frontmostApp: "Spotify"
});
assert.equal(cdpYouTubeBeatsSpotifyMediaRemote.media.source, "youtube");
assert.equal(cdpYouTubeBeatsSpotifyMediaRemote.media.title, "Video Title");
assert.equal(cdpYouTubeBeatsSpotifyMediaRemote.media.positionSeconds, 8);

const bridgeYouTubeBeatsSpotifyMediaRemote = collectMediaStatus({
  cdpMediaText: "",
  youtubeBridgeInfo: {
    source: "youtube",
    title: "Bridge Arc Video",
    artist: "Arc Channel",
    album: "YouTube",
    artworkUrl: "https://i.ytimg.com/vi/bridge/hqdefault.jpg",
    durationSeconds: 600,
    positionSeconds: 123.5,
    playbackState: "playing",
    pageUrl: "https://www.youtube.com/watch?v=bridge123"
  },
  mediaRemoteRaw: JSON.stringify({
    kMRMediaRemoteNowPlayingInfoClientBundleIdentifier: "com.spotify.client",
    kMRMediaRemoteNowPlayingInfoTitle: "Crush",
    kMRMediaRemoteNowPlayingInfoArtist: "10CM",
    kMRMediaRemoteNowPlayingInfoDuration: 239,
    kMRMediaRemoteNowPlayingInfoElapsedTime: 33,
    kMRMediaRemoteNowPlayingInfoPlaybackRate: 1
  }),
  spotifyText,
  musicText: "",
  frontmostApp: "Spotify"
});
assert.equal(bridgeYouTubeBeatsSpotifyMediaRemote.media.source, "youtube");
assert.equal(bridgeYouTubeBeatsSpotifyMediaRemote.media.title, "Bridge Arc Video");
assert.equal(bridgeYouTubeBeatsSpotifyMediaRemote.media.positionSeconds, 123.5);
assert.match(sourceText, /youtube-media\.json/, "media collector should read the local YouTube media bridge before falling back to MediaRemote-only players");
assert.match(sourceText, /probe-youtube-cdp\.js/, "media collector should query the Chrome DevTools Protocol probe before falling back to broad browser scans");

const spotifyMediaRemoteRaw = JSON.stringify({
  kMRMediaRemoteNowPlayingInfoClientBundleIdentifier: "com.spotify.client",
  kMRMediaRemoteNowPlayingInfoTitle: "Next Song",
  kMRMediaRemoteNowPlayingInfoArtist: "Next Artist",
  kMRMediaRemoteNowPlayingInfoAlbum: "Next Album",
  kMRMediaRemoteNowPlayingInfoDuration: 200,
  kMRMediaRemoteNowPlayingInfoElapsedTime: 1.2,
  kMRMediaRemoteNowPlayingInfoPlaybackRate: 1
});
const spotifyArtworkEnrichedFromNativeApp = collectMediaStatus({
  browserMediaTexts: ["youtube-json||Should Not Poll||Channel||0||0||playing||https://img.example/slow.jpg||https://www.youtube.com/watch?v=slow12345"],
  mediaRemoteRaw: spotifyMediaRemoteRaw,
  spotifyText: "spotify||Next Song||Next Artist||Next Album||https://i.scdn.co/image/next-cover||200000||1.2||playing",
  musicText: "",
  frontmostApp: "Google Chrome"
});
assert.equal(spotifyArtworkEnrichedFromNativeApp.media.source, "spotify");
assert.equal(spotifyArtworkEnrichedFromNativeApp.media.title, "Next Song");
assert.equal(spotifyArtworkEnrichedFromNativeApp.media.artworkUrl, "https://i.scdn.co/image/next-cover");
assert.equal(spotifyArtworkEnrichedFromNativeApp.media.positionSeconds, 1.2);

const cachedArtworkDir = fs.mkdtempSync(path.join(os.tmpdir(), "dynamac-artwork-cache-"));
const cachedArtworkUrl = "https://i.scdn.co/image/pre-cached-next-cover";
const cachedArtworkPath = path.join(cachedArtworkDir, `${crypto.createHash("sha1").update(cachedArtworkUrl).digest("hex")}.img`);
fs.writeFileSync(cachedArtworkPath, "fake image bytes");
const spotifyArtworkUsesLocalCache = collectMediaStatus({
  frontmostApp: "Spotify",
  mediaRemoteRaw: spotifyMediaRemoteRaw,
  spotifyText: `spotify||Next Song||Next Artist||Next Album||${cachedArtworkUrl}||200000||1.2||playing`,
  musicText: "",
  artworkCacheDir: cachedArtworkDir,
  cacheRemoteArtwork: true
});
assert.equal(spotifyArtworkUsesLocalCache.media.artworkUrl, cachedArtworkPath);

const mediaRemoteArtworkDir = fs.mkdtempSync(path.join(os.tmpdir(), "dynamac-mediaremote-artwork-"));
const mediaRemoteArtworkBytes = Buffer.from("mediaremote-cover-bytes");
const mediaRemoteArtworkRaw = JSON.stringify({
  kMRMediaRemoteNowPlayingInfoClientBundleIdentifier: "com.spotify.client",
  kMRMediaRemoteNowPlayingInfoTitle: "Instant Cover Song",
  kMRMediaRemoteNowPlayingInfoArtist: "Instant Artist",
  kMRMediaRemoteNowPlayingInfoDuration: 180,
  kMRMediaRemoteNowPlayingInfoElapsedTime: 0,
  kMRMediaRemoteNowPlayingInfoPlaybackRate: 1,
  kMRMediaRemoteNowPlayingInfoArtworkData: mediaRemoteArtworkBytes.toString("base64")
});
const mediaRemoteArtworkStatus = collectMediaStatus({
  frontmostApp: "Spotify",
  mediaRemoteRaw: mediaRemoteArtworkRaw,
  spotifyText: "spotify||Instant Cover Song||Instant Artist||Instant Album||https://i.scdn.co/image/fallback-cover||180000||84.25||playing",
  musicText: "",
  artworkCacheDir: mediaRemoteArtworkDir,
  cacheRemoteArtwork: true
});
const expectedMediaRemoteArtworkPath = path.join(mediaRemoteArtworkDir, `${crypto.createHash("sha1").update(mediaRemoteArtworkBytes).digest("hex")}.jpg`);
assert.equal(mediaRemoteArtworkStatus.media.artworkUrl, expectedMediaRemoteArtworkPath);
assert.equal(mediaRemoteArtworkStatus.media.positionSeconds, 84.25);
assert.equal(fs.readFileSync(expectedMediaRemoteArtworkPath, "utf8"), "mediaremote-cover-bytes");

const previousStablePayload = {
  statuses: [{
    agent: "Now Playing",
    updatedAt: "2026-06-12T12:00:00.000Z",
    media: {
      source: "spotify",
      title: "Stable Song",
      artist: "Stable Artist",
      durationSeconds: 180,
      positionSeconds: 65,
      playbackState: "playing"
    }
  }]
};
const rewoundPayload = {
  statuses: [{
    agent: "Now Playing",
    updatedAt: "2026-06-12T12:00:03.000Z",
    media: {
      source: "spotify",
      title: "Stable Song",
      artist: "Stable Artist",
      durationSeconds: 180,
      positionSeconds: 62,
      playbackState: "playing"
    }
  }]
};
const stabilizedPayload = stabilizeMediaProgress(rewoundPayload, previousStablePayload, new Date("2026-06-12T12:00:03.000Z"));
assert.equal(stabilizedPayload.statuses[0].media.positionSeconds, 68);
assert.equal(stabilizedPayload.statuses[0].media.elapsedLabel, "1:08");

const zeroFallbackPayload = {
  statuses: [{
    agent: "Now Playing",
    updatedAt: "2026-06-12T12:00:06.000Z",
    media: {
      source: "spotify",
      title: "Stable Song",
      artist: "Stable Artist",
      durationSeconds: 180,
      positionSeconds: 0,
      playbackState: "playing"
    }
  }]
};
const stabilizedZeroPayload = stabilizeMediaProgress(zeroFallbackPayload, previousStablePayload, new Date("2026-06-12T12:00:06.000Z"));
assert.equal(stabilizedZeroPayload.statuses[0].media.positionSeconds, 71);
assert.equal(stabilizedZeroPayload.statuses[0].media.elapsedLabel, "1:11");

const frontmostArcTitleFallbackDoesNotBeatSpotify = collectMediaStatus({
  browserMediaTexts: [{ browserName: "Arc", text: "youtube-title||[Vlog] 10년차 무명 배우 브이로그 - YouTube||https://www.youtube.com/watch?v=vlog12345" }],
  mediaRemoteRaw: "",
  spotifyText,
  musicText: "",
  frontmostApp: "Arc"
});
assert.equal(frontmostArcTitleFallbackDoesNotBeatSpotify.media.source, "spotify");

const frontmostArcTitleFallbackWinsWhenNoNativePlayer = collectMediaStatus({
  frontmostBrowserMediaText: "youtube-title||[Vlog] 10년차 무명 배우 브이로그 - YouTube||https://www.youtube.com/watch?v=vlog12345",
  browserMediaTexts: [],
  mediaRemoteRaw: "",
  spotifyText: "",
  musicText: "",
  frontmostApp: "Arc"
});
assert.equal(frontmostArcTitleFallbackWinsWhenNoNativePlayer.media.source, "youtube");
assert.equal(frontmostArcTitleFallbackWinsWhenNoNativePlayer.media.title, "[Vlog] 10년차 무명 배우 브이로그");

// A background (non-frontmost) open YouTube tab with no playback evidence must
// NOT surface as Now Playing when nothing is actually playing — otherwise an
// idle tab title stays pinned on the island forever.
const backgroundIdleTabDoesNotShowWhenNothingPlays = collectMediaStatus({
  browserMediaTexts: [{ browserName: "Arc", text: "youtube-title||Voice AI Instrumental Composition - YouTube||https://www.youtube.com/watch?v=idle9999" }],
  mediaRemoteRaw: "",
  spotifyText: "",
  musicText: "",
  frontmostApp: "Finder"
});
assert.equal(backgroundIdleTabDoesNotShowWhenNothingPlays.media.source, "none");

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
  clipboardActivityState: createClipboardActivityState(),
  clipboardText: "https://example.com/b",
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
assert.equal(payload.activityRouter.compactSurface.activityType, "clipboard");
assert.deepEqual(payload.activityRouter.rankedActivities.map((activity) => activity.activityType), ["clipboard", "nowPlaying", "battery"]);

const payloadWithBrightnessHud = buildMacActivityStatusPayload({
  now: new Date("2026-06-11T09:00:01.000Z"),
  brightnessInput: {
    level: 73,
    displayName: "Studio Display",
    source: "fixture-brightness-observer",
    observedAt: Date.parse("2026-06-11T09:00:00.500Z")
  },
  mediaInfo: spotifyInfo,
  clipboardActivityState: createClipboardActivityState(),
  clipboardText: "https://example.com/c",
  pmsetOutput: "Now drawing from 'AC Power'\n -InternalBattery-0\t82%; charging; 0:35 remaining present: true"
});
assert.deepEqual(payloadWithBrightnessHud.statuses.map((status) => status.agent), ["Brightness", "Now Playing", "Clipboard", "Battery"]);
assert.equal(payloadWithBrightnessHud.statuses[0].brightnessHud.activityType, "brightness");
assert.equal(payloadWithBrightnessHud.statuses[0].brightnessHud.status.level, 73);
assert.equal(payloadWithBrightnessHud.statuses[0].brightnessHud.metadata.displayName, "Studio Display");
assert.equal(payloadWithBrightnessHud.activityRouter.compactSurface.activityType, "brightness");
assert.deepEqual(payloadWithBrightnessHud.activityRouter.rankedActivities.map((activity) => activity.activityType), ["brightness", "clipboard", "nowPlaying", "battery"]);

const payloadWithOverlappingHuds = buildMacActivityStatusPayload({
  now: new Date("2026-06-11T09:00:01.000Z"),
  volumeInput: {
    level: 40,
    muted: false,
    source: "fixture-volume-observer",
    observedAt: Date.parse("2026-06-11T09:00:00.400Z")
  },
  brightnessInput: {
    level: 73,
    displayName: "Studio Display",
    source: "fixture-brightness-observer",
    observedAt: Date.parse("2026-06-11T09:00:00.500Z")
  },
  mediaInfo: spotifyInfo,
  clipboardActivityState: createClipboardActivityState(),
  clipboardText: "https://example.com/d",
  pmsetOutput: "Now drawing from 'AC Power'\n -InternalBattery-0\t82%; charging; 0:35 remaining present: true"
});
assert.deepEqual(payloadWithOverlappingHuds.statuses.map((status) => status.agent), ["Volume", "Brightness", "Now Playing", "Clipboard", "Battery"]);
assert.deepEqual(
  payloadWithOverlappingHuds.activityRouter.rankedActivities.map((activity) => activity.activityType),
  ["brightness", "clipboard", "nowPlaying", "battery"],
  "router should collapse simultaneous volume/brightness statuses to one compact HUD lane"
);
assert.equal(payloadWithOverlappingHuds.activityRouter.compactSurface.activityType, "brightness");
assert.equal(
  payloadWithOverlappingHuds.activityRouter.rankedActivities.filter((activity) => activity.activityType === "volume" || activity.activityType === "brightness").length,
  1,
  "activityRouter should not emit overlapping DynaKeys HUD events even when both statuses exist"
);

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
