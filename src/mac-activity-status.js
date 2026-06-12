const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function runCommand(command, args, options = {}) {
  try {
    return childProcess.execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2200,
      ...options
    }).trim();
  } catch (_error) {
    return "";
  }
}

function truncate(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function formatDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return "--:--";
  const whole = Math.floor(value);
  const minutes = Math.floor(whole / 60);
  const remainingSeconds = String(whole % 60).padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function parsePmsetBattery(output) {
  const percentMatch = output.match(/(\d+)%/);
  const stateMatch = output.match(/;\s*([^;]+);/);
  if (!percentMatch) return null;

  const percent = Number(percentMatch[1]);
  const rawState = stateMatch ? stateMatch[1].trim().toLowerCase() : "unknown";
  const charging = rawState === "charging" || rawState === "charged" || rawState.includes("finishing charge") || output.toLowerCase().includes("'ac power'");
  const state = percent <= 20 && !charging ? "warning" : "running";
  const label = charging ? "Charging" : "Battery";

  return {
    agent: "Battery",
    state,
    task: `${label} ${percent}%`,
    detail: output.split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).join(" ")
  };
}

function collectBatteryStatus(options = {}) {
  const output = options.pmsetOutput ?? runCommand("pmset", ["-g", "batt"]);
  return parsePmsetBattery(output) || {
    agent: "Battery",
    state: "idle",
    task: "Battery unavailable",
    detail: "Battery state is unavailable on this Mac or display session."
  };
}

function classifyClipboardText(text) {
  const clean = String(text || "").replace(/\0/g, "").trim();
  if (!clean) {
    return {
      agent: "Clipboard",
      state: "idle",
      task: "Clipboard empty",
      detail: "No text clipboard content was found."
    };
  }

  let type = "Text";
  if (/^https?:\/\//i.test(clean)) type = "Link";
  else if (/^file:\/\//i.test(clean) || clean.startsWith("/")) type = "Path";

  const lengthLabel = `${clean.length} char${clean.length === 1 ? "" : "s"}`;
  return {
    agent: "Clipboard",
    state: "running",
    task: `${type} copied · ${lengthLabel}`,
    detail: truncate(clean, 120)
  };
}

function collectClipboardStatus(options = {}) {
  const text = options.clipboardText ?? runCommand("pbpaste", []);
  return classifyClipboardText(text);
}

function spotifyScript() {
  return [
    'if application "Spotify" is running then',
    'tell application "Spotify"',
    'if player state is playing or player state is paused then',
    'set t to current track',
    'return "spotify||" & name of t & "||" & artist of t & "||" & album of t & "||" & artwork url of t & "||" & (duration of t as string) & "||" & (player position as string) & "||" & (player state as string)',
    'end if',
    'end tell',
    'end if'
  ].join("\n");
}

function musicScript() {
  const artworkPath = "/tmp/dynamac-music-artwork.jpg";
  return [
    'if application "Music" is running then',
    'tell application "Music"',
    'if player state is playing or player state is paused then',
    'set t to current track',
    `set artworkPath to "${artworkPath}"`,
    'set artworkOut to ""',
    'if (count of artworks of t) > 0 then',
    'try',
    'set artworkFile to open for access (POSIX file artworkPath) with write permission',
    'set eof of artworkFile to 0',
    'write (data of artwork 1 of t) to artworkFile',
    'close access artworkFile',
    'set artworkOut to artworkPath',
    'on error',
    'try',
    'close access (POSIX file artworkPath)',
    'end try',
    'end try',
    'end if',
    'return "music||" & name of t & "||" & artist of t & "||" & album of t & "||" & artworkOut & "||" & ((duration of t) as string) & "||" & (player position as string) & "||" & (player state as string)',
    'end if',
    'end tell',
    'end if'
  ].join("\n");
}

function appleScriptString(value) {
  return `"${String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, " ")}"`;
}

function youtubePageProbeJavaScript() {
  return `(() => {
    const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
    const meta = (selector) => document.querySelector(selector)?.content || '';
    const text = (selector) => document.querySelector(selector)?.textContent?.replace(/\\s+/g, ' ').trim() || '';
    const player = document.getElementById('movie_player');
    const videos = Array.from(document.querySelectorAll('video'));
    const video = document.querySelector('#movie_player video.video-stream') || document.querySelector('video.html5-main-video') || videos.find((item) => finite(item.duration) > 0) || videos[0] || null;
    const title = text('h1 yt-formatted-string') || meta('meta[property="og:title"]') || document.title.replace(/ - YouTube$/, '').trim();
    const artist = text('#owner #channel-name a') || text('#text.ytd-channel-name') || text('ytd-channel-name a') || 'YouTube';
    const artworkUrl = meta('meta[property="og:image"]');
    const durationSeconds = finite(player?.getDuration?.()) || finite(video?.duration);
    const positionSeconds = finite(player?.getCurrentTime?.()) || finite(video?.currentTime);
    const playerState = Number(player?.getPlayerState?.());
    const playbackState = playerState === 1 ? 'playing' : (playerState === 2 || playerState === 0 ? 'paused' : (video ? (video.paused ? 'paused' : 'playing') : 'unknown'));
    return JSON.stringify({ title, artist, album: 'YouTube', artworkUrl, durationSeconds, positionSeconds, playbackState });
  })()`;
}

const CHROMIUM_YOUTUBE_BROWSERS = [
  "Google Chrome",
  "Google Chrome Canary",
  "Chromium",
  "Arc",
  "Brave Browser",
  "Microsoft Edge",
  "Vivaldi",
  "Opera",
  "Opera GX",
  "Orion",
  "Dia"
];

const FIREFOX_YOUTUBE_BROWSERS = [
  "Firefox",
  "Firefox Developer Edition",
  "Firefox Nightly",
  "Waterfox",
  "LibreWolf"
];

const SAFARI_YOUTUBE_BROWSERS = ["Safari", "Safari Technology Preview"];

function youtubeUrlAppleScriptCondition(variableName = "tabUrl") {
  return `${variableName} contains "youtube.com/watch" or ${variableName} contains "music.youtube.com/watch" or ${variableName} contains "youtu.be/" or ${variableName} contains "youtube.com/shorts/"`;
}

function chromiumFallbackYouTubeTitleScript(browserName) {
  return [
    'try',
    'tell application "System Events"',
    `tell process "${browserName}"`,
    'repeat with w in windows',
    'set windowTitle to name of w',
    'if windowTitle contains "YouTube" and windowTitle does not contain "YouTube Studio" then',
    'return "youtube-title||" & windowTitle & "||" & "browser-window"',
    'end if',
    'end repeat',
    'end tell',
    'end tell',
    'end try'
  ].join("\n");
}

function browserYouTubeScript(browserName) {
  const js = appleScriptString(youtubePageProbeJavaScript());
  const chromiumBrowsers = new Set(CHROMIUM_YOUTUBE_BROWSERS);
  const safariBrowsers = new Set(SAFARI_YOUTUBE_BROWSERS);
  const firefoxBrowsers = new Set(FIREFOX_YOUTUBE_BROWSERS);
  if (safariBrowsers.has(browserName)) {
    return [
      `if application "${browserName}" is running then`,
      `tell application "${browserName}"`,
      'repeat with w in windows',
      'repeat with t in tabs of w',
      'set tabUrl to URL of t',
      `if ${youtubeUrlAppleScriptCondition("tabUrl")} then`,
      'try',
      `set payload to do JavaScript ${js} in t`,
      'return "youtube-json||" & payload & "||" & tabUrl',
      'on error',
      'return "youtube-title||" & (name of t) & "||" & tabUrl',
      'end try',
      'end if',
      'end repeat',
      'end repeat',
      'end tell',
      'end if'
    ].join("\n");
  }
  if (firefoxBrowsers.has(browserName)) {
    return [
      `if application "${browserName}" is running then`,
      'tell application "System Events"',
      `tell process "${browserName}"`,
      'repeat with w in windows',
      'set windowTitle to name of w',
      'if windowTitle contains "YouTube" and windowTitle does not contain "YouTube Studio" then',
      'return "youtube-title||" & windowTitle & "||" & "firefox-window"',
      'end if',
      'end repeat',
      'end tell',
      'end tell',
      'end if'
    ].join("\n");
  }
  if (!chromiumBrowsers.has(browserName)) return "";
  return [
    'try',
    `if application "${browserName}" is running then`,
    `tell application "${browserName}"`,
    'repeat with w in windows',
    'repeat with t in tabs of w',
    'set tabUrl to URL of t',
    `if ${youtubeUrlAppleScriptCondition("tabUrl")} then`,
    'try',
    `set payload to execute t javascript ${js}`,
    'return "youtube-json||" & payload & "||" & tabUrl',
    'on error',
    'return "youtube-title||" & (title of t) & "||" & tabUrl',
    'end try',
    'end if',
    'end repeat',
    'end repeat',
    'end tell',
    'end if',
    'end try',
    ...chromiumFallbackYouTubeTitleScript(browserName).split("\n")
  ].join("\n");
}

function parseDelimitedMedia(raw) {
  const text = String(raw || "");
  if (text.startsWith("youtube-json||")) {
    const [, jsonText, pageUrl = ""] = text.split("||");
    try {
      const payload = JSON.parse(jsonText || "{}");
      return normalizeMediaInfo({
        source: "youtube",
        title: payload.title || "YouTube",
        artist: payload.artist || "YouTube",
        album: payload.album || "YouTube",
        artworkUrl: payload.artworkUrl || youtubeThumbnailUrl(pageUrl),
        durationSeconds: Number(payload.durationSeconds),
        positionSeconds: Number(payload.positionSeconds),
        playbackState: payload.playbackState || "unknown",
        pageUrl
      });
    } catch (_error) {
      return null;
    }
  }

  if (text.startsWith("youtube-title||")) {
    const [, windowTitle = "YouTube", pageUrl = ""] = text.split("||");
    const title = parseYouTubeWindowTitle(windowTitle);
    return normalizeMediaInfo({
      source: "youtube",
      title,
      artist: "YouTube",
      album: "YouTube",
      artworkUrl: "",
      durationSeconds: 0,
      positionSeconds: 0,
      playbackState: "unknown",
      pageUrl
    });
  }

  const parts = text.split("||");
  if (parts.length < 8) return null;
  const [source, title, artist, album, artworkUrl, durationRaw, positionRaw, playbackState, pageUrl] = parts;
  const durationSeconds = source === "spotify" ? Number(durationRaw) / 1000 : Number(durationRaw);
  const positionSeconds = Number(positionRaw);
  return normalizeMediaInfo({
    source: source || "unknown",
    title: title || "Unknown title",
    artist: artist || "",
    album: album || "",
    artworkUrl: artworkUrl || youtubeThumbnailUrl(pageUrl || artworkUrl || "") || "",
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
    positionSeconds: Number.isFinite(positionSeconds) ? positionSeconds : 0,
    playbackState: playbackState || "unknown",
    pageUrl: pageUrl || ""
  });
}

function normalizeMediaInfo(info) {
  if (!info) return null;
  return {
    source: info.source || "unknown",
    title: info.title || "Unknown title",
    artist: info.artist || "",
    album: info.album || "",
    artworkUrl: info.artworkUrl || youtubeThumbnailUrl(info.pageUrl || "") || "",
    durationSeconds: Number.isFinite(Number(info.durationSeconds)) ? Number(info.durationSeconds) : 0,
    positionSeconds: Number.isFinite(Number(info.positionSeconds)) ? Number(info.positionSeconds) : 0,
    playbackState: info.playbackState || "unknown",
    pageUrl: info.pageUrl || ""
  };
}

function parseYouTubeWindowTitle(windowTitle) {
  const cleaned = String(windowTitle || "")
    .replace(/\s+[-–—]\s+Mozilla Firefox\s*$/i, "")
    .replace(/\s+[-–—]\s+Firefox(?: Developer Edition| Nightly)?\s*$/i, "")
    .replace(/\s+[-–—]\s+YouTube\s*$/i, "")
    .trim();
  return cleaned || "YouTube";
}

function youtubeVideoId(url) {
  const text = String(url || "");
  const watchMatch = text.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  if (watchMatch) return watchMatch[1];
  const shortMatch = text.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  if (shortMatch) return shortMatch[1];
  const shortsMatch = text.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/);
  return shortsMatch ? shortsMatch[1] : "";
}

function youtubeThumbnailUrl(url) {
  const id = youtubeVideoId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : "";
}

function mediaStatusFromInfo(info) {
  if (!info) {
    return {
      agent: "Now Playing",
      state: "idle",
      task: "Nothing playing",
      detail: "No active Spotify, Music, or YouTube playback surface was detected.",
      media: {
        source: "none",
        title: "Nothing playing",
        artist: "",
        album: "",
        artworkUrl: "",
        durationSeconds: 0,
        positionSeconds: 0,
        playbackState: "idle",
        pageUrl: ""
      }
    };
  }

  return {
    agent: "Now Playing",
    state: info.playbackState === "paused" ? "idle" : "running",
    task: truncate(info.title, 48),
    detail: info.artist ? truncate(info.artist, 80) : (info.source === "youtube" ? "YouTube" : truncate(info.album, 80)),
    media: {
      source: info.source,
      title: info.title,
      artist: info.artist || (info.source === "youtube" ? "YouTube" : ""),
      album: info.album || "",
      artworkUrl: info.artworkUrl || "",
      durationSeconds: info.durationSeconds || 0,
      positionSeconds: info.positionSeconds || 0,
      playbackState: info.playbackState || "unknown",
      elapsedLabel: formatDuration(info.positionSeconds),
      durationLabel: formatDuration(info.durationSeconds),
      pageUrl: info.pageUrl || ""
    }
  };
}

function frontmostApplicationName(options = {}) {
  if (options.frontmostApp !== undefined) return options.frontmostApp;
  return runCommand("osascript", ["-e", 'tell application "System Events" to name of first application process whose frontmost is true']);
}

function collectBrowserYouTubeMediaInfos(options = {}) {
  if (options.browserMediaTexts !== undefined) {
    return options.browserMediaTexts.map((entry) => {
      const text = typeof entry === "string" ? entry : entry.text;
      const info = parseDelimitedMedia(text);
      return info ? { ...info, browserName: typeof entry === "string" ? undefined : entry.browserName } : null;
    }).filter(Boolean);
  }
  const browserNames = [
    ...CHROMIUM_YOUTUBE_BROWSERS,
    ...SAFARI_YOUTUBE_BROWSERS,
    ...FIREFOX_YOUTUBE_BROWSERS
  ];
  return browserNames
    .map((browserName) => {
      if (browserName === "Arc") {
        const fallbackInfo = parseDelimitedMedia(runCommand("osascript", ["-e", chromiumFallbackYouTubeTitleScript(browserName)]));
        if (fallbackInfo) return { ...fallbackInfo, browserName };
        return null;
      }
      const raw = runCommand("osascript", ["-e", browserYouTubeScript(browserName)]);
      let info = parseDelimitedMedia(raw);
      if (!info && CHROMIUM_YOUTUBE_BROWSERS.includes(browserName)) {
        info = parseDelimitedMedia(runCommand("osascript", ["-e", chromiumFallbackYouTubeTitleScript(browserName)]));
      }
      return info ? { ...info, browserName } : null;
    })
    .filter(Boolean);
}

function parseMediaRemoteNowPlaying(raw) {
  if (!raw) return null;
  let payload;
  try {
    payload = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (_error) {
    return null;
  }
  const title = payload.kMRMediaRemoteNowPlayingInfoTitle || payload.title || "";
  if (!title) return null;
  const bundleIdentifier = payload.kMRMediaRemoteNowPlayingInfoClientBundleIdentifier || payload.bundleIdentifier || "";
  const browserBundles = new Set([
    "com.google.Chrome",
    "com.google.Chrome.canary",
    "org.chromium.Chromium",
    "company.thebrowser.Browser",
    "com.brave.Browser",
    "com.microsoft.edgemac",
    "com.vivaldi.Vivaldi",
    "com.operasoftware.Opera",
    "com.operasoftware.OperaGX",
    "com.apple.Safari"
  ]);
  const source = browserBundles.has(bundleIdentifier) ? "youtube" : (
    bundleIdentifier.includes("spotify") ? "spotify" : (bundleIdentifier.includes("Music") ? "music" : "now-playing")
  );
  const playbackRate = Number(payload.kMRMediaRemoteNowPlayingInfoPlaybackRate ?? payload.playbackRate ?? 0);
  return normalizeMediaInfo({
    source,
    title,
    artist: payload.kMRMediaRemoteNowPlayingInfoArtist || payload.artist || (source === "youtube" ? "YouTube" : ""),
    album: payload.kMRMediaRemoteNowPlayingInfoAlbum || payload.album || (source === "youtube" ? "YouTube" : ""),
    artworkUrl: "",
    durationSeconds: Number(payload.kMRMediaRemoteNowPlayingInfoDuration ?? payload.duration ?? 0),
    positionSeconds: Number(payload.kMRMediaRemoteNowPlayingInfoElapsedTime ?? payload.elapsedTime ?? 0),
    playbackState: playbackRate > 0 ? "playing" : "paused",
    pageUrl: "",
    bundleIdentifier
  });
}

function enrichMediaRemoteInfo(info, browserInfos = []) {
  if (!info) return null;
  const matchingBrowser = browserInfos.find((browserInfo) => {
    if (!browserInfo) return false;
    if (info.title && browserInfo.title && (info.title === browserInfo.title || browserInfo.title.includes(info.title) || info.title.includes(browserInfo.title))) return true;
    if (info.source === "youtube" && browserInfo.source === "youtube" && browserInfo.playbackState === "playing") return true;
    return false;
  });
  return normalizeMediaInfo({
    ...info,
    artworkUrl: info.artworkUrl || matchingBrowser?.artworkUrl || "",
    pageUrl: info.pageUrl || matchingBrowser?.pageUrl || "",
    artist: info.artist || matchingBrowser?.artist || "",
    album: info.album || matchingBrowser?.album || ""
  });
}

function collectMediaRemoteInfo(options = {}) {
  if (options.mediaRemoteInfo !== undefined) return normalizeMediaInfo(options.mediaRemoteInfo);
  if (options.mediaRemoteRaw !== undefined) return parseMediaRemoteNowPlaying(options.mediaRemoteRaw);
  return parseMediaRemoteNowPlaying(runCommand("nowplaying-cli", ["get-raw"], { timeout: 900 }));
}

function materializeArtwork(info, options = {}) {
  if (!info?.artworkUrl || options.cacheRemoteArtwork !== true) return info;
  if (!/^https?:\/\//i.test(info.artworkUrl)) return info;

  const cacheDir = options.artworkCacheDir || path.join(process.cwd(), ".build", "artwork-cache");
  const hash = crypto.createHash("sha1").update(info.artworkUrl).digest("hex");
  const outputPath = path.join(cacheDir, `${hash}.img`);
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    const tmpPath = `${outputPath}.tmp`;
    runCommand("curl", ["-L", "--max-time", "1.2", "--silent", "--show-error", "--output", tmpPath, info.artworkUrl], { timeout: 1600 });
    if (fs.existsSync(tmpPath) && fs.statSync(tmpPath).size > 0) {
      fs.renameSync(tmpPath, outputPath);
    } else if (fs.existsSync(tmpPath)) {
      fs.rmSync(tmpPath, { force: true });
    }
  }
  return fs.existsSync(outputPath) ? { ...info, artworkUrl: outputPath } : info;
}

function collectNativeAppMediaInfo(source, options = {}) {
  if (source === "spotify") {
    return parseDelimitedMedia(options.spotifyText ?? runCommand("osascript", ["-e", spotifyScript()], { timeout: 700 }));
  }
  if (source === "music") {
    return parseDelimitedMedia(options.musicText ?? runCommand("osascript", ["-e", musicScript()], { timeout: 700 }));
  }
  return null;
}

function enrichNativeAppMediaRemoteInfo(info, options = {}) {
  if (!info || !["spotify", "music"].includes(info.source)) return info;
  const nativeInfo = materializeArtwork(collectNativeAppMediaInfo(info.source, options), options);
  if (!nativeInfo) return info;
  return normalizeMediaInfo({
    ...info,
    title: nativeInfo.title || info.title,
    artist: nativeInfo.artist || info.artist,
    album: nativeInfo.album || info.album,
    artworkUrl: nativeInfo.artworkUrl || info.artworkUrl || "",
    durationSeconds: nativeInfo.durationSeconds || info.durationSeconds,
    positionSeconds: info.positionSeconds || nativeInfo.positionSeconds,
    playbackState: info.playbackState || nativeInfo.playbackState,
    pageUrl: info.pageUrl || nativeInfo.pageUrl || "",
    bundleIdentifier: info.bundleIdentifier
  });
}

function collectMediaStatus(options = {}) {
  if (options.mediaInfo !== undefined) return mediaStatusFromInfo(normalizeMediaInfo(options.mediaInfo));
  if (options.mediaText !== undefined) return mediaStatusFromInfo(parseDelimitedMedia(options.mediaText));

  const rawMediaRemoteInfo = collectMediaRemoteInfo(options);
  if (rawMediaRemoteInfo?.playbackState === "playing" && options.forceBrowserEnrichment !== true) {
    return mediaStatusFromInfo(enrichNativeAppMediaRemoteInfo(rawMediaRemoteInfo, options));
  }

  const browserInfos = collectBrowserYouTubeMediaInfos(options);
  const mediaRemoteInfo = enrichMediaRemoteInfo(rawMediaRemoteInfo, browserInfos);
  if (mediaRemoteInfo?.playbackState === "playing") return mediaStatusFromInfo(mediaRemoteInfo);

  const playingBrowserInfo = browserInfos.find((info) => info.playbackState === "playing");
  if (playingBrowserInfo) return mediaStatusFromInfo(playingBrowserInfo);

  const spotifyInfo = materializeArtwork(parseDelimitedMedia(options.spotifyText ?? runCommand("osascript", ["-e", spotifyScript()])), options);
  const musicInfo = materializeArtwork(parseDelimitedMedia(options.musicText ?? runCommand("osascript", ["-e", musicScript()])), options);
  if (spotifyInfo || musicInfo) return mediaStatusFromInfo(spotifyInfo || musicInfo);

  const frontmostApp = frontmostApplicationName(options);
  const frontmostBrowserInfo = browserInfos.find((info) => info.browserName && info.browserName === frontmostApp);
  return mediaStatusFromInfo(frontmostBrowserInfo || browserInfos[0] || null);
}

function buildMacActivityStatusPayload(options = {}) {
  const now = options.now || new Date();
  const statuses = [
    collectMediaStatus(options),
    collectClipboardStatus(options),
    collectBatteryStatus(options)
  ].map((status) => ({
    ...status,
    updatedAt: now.toISOString()
  }));

  return { statuses };
}

function writeMacActivityStatusSnapshot(options = {}) {
  const outputPath = options.outputPath;
  if (!outputPath) throw new Error("outputPath is required");
  const payload = buildMacActivityStatusPayload({ ...options, cacheRemoteArtwork: options.cacheRemoteArtwork ?? true });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  return { ok: true, outputPath, payload };
}

module.exports = {
  buildMacActivityStatusPayload,
  browserYouTubeScript,
  CHROMIUM_YOUTUBE_BROWSERS,
  chromiumFallbackYouTubeTitleScript,
  FIREFOX_YOUTUBE_BROWSERS,
  SAFARI_YOUTUBE_BROWSERS,
  classifyClipboardText,
  collectBatteryStatus,
  collectClipboardStatus,
  collectMediaStatus,
  formatDuration,
  parseDelimitedMedia,
  parseMediaRemoteNowPlaying,
  parsePmsetBattery,
  writeMacActivityStatusSnapshot,
  youtubeThumbnailUrl
};
