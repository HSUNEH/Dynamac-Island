const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { buildActivityRouterSnapshot } = require("./activity-router");
const {
  applyBatteryObservation,
  batteryHudToNativeStatus,
  batteryObservationToNativeStatus,
  createBatteryHudState,
  parseBatteryObservationFromPmset
} = require("./battery-hud-status");
const {
  applyClipboardRead,
  classifyClipboardText: classifyClipboardActivityText,
  createClipboardActivityState
} = require("./clipboard-activity");
const {
  applyVolumeHudInputChange,
  createVolumeHudState,
  volumeHudToNativeStatus
} = require("./volume-hud-status");
const {
  applyBrightnessHudInputChange,
  brightnessHudToNativeStatus,
  createBrightnessHudState
} = require("./brightness-hud-status");
const {
  reconstructHudActivityState,
  recordBrightnessHudEvent,
  recordVolumeHudEvent
} = require("./hud-event-store");
const { collectTimerActivityStatus } = require("./timer-activity-source");

let defaultClipboardActivityState = createClipboardActivityState();
let defaultVolumeHudState = createVolumeHudState();
let defaultBrightnessHudState = createBrightnessHudState();
let defaultVolumeSystemObservation = null;
let defaultBrightnessSystemObservation = null;
let defaultBatteryHudState = createBatteryHudState();

function runCommand(command, args, options = {}) {
  try {
    return childProcess.execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2200,
      // SIGTERM cannot dislodge an osascript blocked inside a System Events
      // Apple Event, so a stalled browser probe would otherwise linger past the
      // timeout, pile up as orphans, and eventually wedge the synchronous
      // refresh loop. SIGKILL guarantees the stuck child is reaped on timeout.
      killSignal: "SIGKILL",
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
  const observation = parseBatteryObservationFromPmset(output);
  return observation ? batteryObservationToNativeStatus(observation) : null;
}

function collectBatteryStatus(options = {}) {
  const output = options.pmsetOutput ?? runCommand("pmset", ["-g", "batt"]);
  const observation = options.batteryObservation ?? parseBatteryObservationFromPmset(output);
  if (!observation) {
    return {
      agent: "Battery",
      activityType: "battery",
      state: "idle",
      task: "Battery unavailable",
      detail: "Battery state is unavailable on this Mac or display session.",
      metadata: { rawBatteryTextVisible: false, batteryDisplayMode: "unavailable" },
      persisted: false
    };
  }
  const state = options.batteryHudState || defaultBatteryHudState;
  const result = applyBatteryObservation(state, observation, {
    now: options.now,
    transientMs: options.batteryTransientMs,
    displayMode: options.batteryDisplayMode,
    source: options.batterySource || "pmset-battery"
  });
  if (options.batteryHudState) {
    Object.assign(options.batteryHudState, result.state);
  } else {
    defaultBatteryHudState = result.state;
  }
  return result.active ? batteryHudToNativeStatus(result.active, observation) : batteryObservationToNativeStatus(observation);
}

function parseSystemVolumeSettings(output) {
  const text = String(output || "").trim();
  if (!text) return null;
  const [levelText, mutedText = "false"] = text.split("||").map((part) => part.trim());
  const level = Number(levelText);
  if (!Number.isFinite(level) || level < 0 || level > 100) return null;
  return {
    level: Math.round(level),
    muted: mutedText.toLowerCase() === "true",
    deviceName: "System Output",
    source: "macos-volume-settings"
  };
}

function collectSystemVolumeSettings(options = {}) {
  if (options.systemVolumeSettings !== undefined) return options.systemVolumeSettings;
  if (options.systemVolumeText !== undefined) return parseSystemVolumeSettings(options.systemVolumeText);
  const output = runCommand("osascript", [
    "-e",
    "set s to get volume settings",
    "-e",
    "return (output volume of s as text) & \"||\" & (output muted of s as text)"
  ], { timeout: 700 });
  return parseSystemVolumeSettings(output);
}

function collectChangedSystemVolumeInput(options = {}) {
  if (options.volumeInput !== undefined) return options.volumeInput;
  if (options.observeVolumeHud === false || process.env.DYNAMAC_DISABLE_VOLUME_HUD_OBSERVER === "1") return null;
  const observed = collectSystemVolumeSettings(options);
  if (!observed) return null;
  const now = options.now || new Date();
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const previous = options.previousVolumeObservation !== undefined ? options.previousVolumeObservation : defaultVolumeSystemObservation;
  if (!previous) {
    if (options.previousVolumeObservation === undefined) defaultVolumeSystemObservation = observed;
    return options.emitInitialHudObservations || process.env.DYNAMAC_HUD_EMIT_INITIAL === "1" ? { ...observed, observedAt: nowMs } : null;
  }
  const changed = Number(previous.level) !== Number(observed.level) || Boolean(previous.muted) !== Boolean(observed.muted);
  if (options.previousVolumeObservation === undefined) defaultVolumeSystemObservation = observed;
  return changed ? { ...observed, observedAt: nowMs } : null;
}

function parseBrightnessLevelFromText(output) {
  const text = String(output || "");
  if (!text.trim()) return null;
  const direct = text.trim().match(/^(?:brightness\s*[:=]\s*)?(\d+(?:\.\d+)?)%?$/i);
  if (direct) {
    const number = Number(direct[1]);
    if (Number.isFinite(number)) return number <= 1 ? Math.round(number * 100) : Math.round(number);
  }
  const brightnessCli = text.match(/brightness\s+([01](?:\.\d+)?|\d+(?:\.\d+)?)\b/i);
  if (brightnessCli) {
    const number = Number(brightnessCli[1]);
    if (Number.isFinite(number)) return number <= 1 ? Math.round(number * 100) : Math.round(number);
  }
  const ioreg = text.match(/["']?brightness["']?\s*=\s*(\d+(?:\.\d+)?)/i);
  if (ioreg) {
    const number = Number(ioreg[1]);
    if (Number.isFinite(number)) return number <= 1 ? Math.round(number * 100) : Math.round(Math.min(100, number));
  }
  return null;
}

function normalizeBrightnessObservation(level, options = {}) {
  if (level === null || level === undefined || level === "") return null;
  const numericLevel = Number(level);
  if (!Number.isFinite(numericLevel)) return null;
  const rounded = Math.round(numericLevel);
  if (rounded < 0 || rounded > 100) return null;
  return {
    level: rounded,
    displayName: options.brightnessDisplayName || "Main Display",
    source: options.brightnessSource || "macos-brightness-observer"
  };
}

function collectSystemBrightnessSettings(options = {}) {
  if (options.systemBrightnessSettings !== undefined) return options.systemBrightnessSettings;
  if (options.systemBrightnessLevel !== undefined) return normalizeBrightnessObservation(options.systemBrightnessLevel, options);
  if (options.systemBrightnessText !== undefined) return normalizeBrightnessObservation(parseBrightnessLevelFromText(options.systemBrightnessText), options);
  const envLevel = process.env.DYNAMAC_BRIGHTNESS_LEVEL;
  if (envLevel !== undefined) return normalizeBrightnessObservation(envLevel, { ...options, brightnessSource: "env-brightness-level" });
  const observerCommand = process.env.DYNAMAC_BRIGHTNESS_OBSERVER_COMMAND;
  if (observerCommand) {
    const output = runCommand("/bin/sh", ["-lc", observerCommand], { timeout: 900 });
    return normalizeBrightnessObservation(parseBrightnessLevelFromText(output), { ...options, brightnessSource: "brightness-observer-command" });
  }
  const brightnessBinary = runCommand("/bin/sh", ["-lc", "command -v brightness || true"], { timeout: 400 });
  if (brightnessBinary) {
    const output = runCommand(brightnessBinary, ["-l"], { timeout: 900 });
    return normalizeBrightnessObservation(parseBrightnessLevelFromText(output), { ...options, brightnessSource: "brightness-cli" });
  }
  const ioregOutput = process.env.DYNAMAC_ENABLE_IOREG_BRIGHTNESS === "1"
    ? runCommand("ioreg", ["-r", "-c", "AppleBacklightDisplay", "-d", "4"], { timeout: 900 })
    : "";
  return normalizeBrightnessObservation(parseBrightnessLevelFromText(ioregOutput), { ...options, brightnessSource: "ioreg-apple-backlight" });
}

function collectChangedSystemBrightnessInput(options = {}) {
  if (options.brightnessInput !== undefined) return options.brightnessInput;
  if (options.observeBrightnessHud === false || process.env.DYNAMAC_DISABLE_BRIGHTNESS_HUD_OBSERVER === "1") return null;
  const observed = collectSystemBrightnessSettings(options);
  if (!observed) return null;
  const now = options.now || new Date();
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const previous = options.previousBrightnessObservation !== undefined ? options.previousBrightnessObservation : defaultBrightnessSystemObservation;
  if (!previous) {
    if (options.previousBrightnessObservation === undefined) defaultBrightnessSystemObservation = observed;
    return options.emitInitialHudObservations || process.env.DYNAMAC_HUD_EMIT_INITIAL === "1" ? { ...observed, observedAt: nowMs } : null;
  }
  const changed = Number(previous.level) !== Number(observed.level);
  if (options.previousBrightnessObservation === undefined) defaultBrightnessSystemObservation = observed;
  return changed ? { ...observed, observedAt: nowMs } : null;
}

function classifyClipboardText(text) {
  const classified = classifyClipboardActivityText(text);
  return {
    agent: "Clipboard",
    state: classified.classification === "empty" ? "idle" : "running",
    task: classified.label,
    detail: classified.detail,
    metadata: {
      classification: classified.classification,
      characterCount: classified.characterCount
    },
    persisted: false
  };
}

function collectClipboardStatus(options = {}) {
  const now = options.now || new Date();
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const text = options.clipboardText ?? runCommand("pbpaste", []);
  const state = options.clipboardActivityState || defaultClipboardActivityState;
  const observedAt = options.clipboardObservedAt ?? options.observedAt ?? nowMs;
  const result = applyClipboardRead(state, {
    plainText: text,
    observedAt,
    source: options.clipboardSource || "local-clipboard",
    type: options.clipboardType || "text/plain",
    hasPlainText: options.clipboardHasPlainText
  }, {
    now: nowMs,
    recencyMs: options.clipboardRecencyMs
  });
  if (!options.clipboardActivityState) defaultClipboardActivityState = result.state;
  return result.status;
}

function collectVolumeHudStatus(options = {}) {
  const now = options.now || new Date();
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const replayedState = options.hudReplayState?.volume || null;
  const volumeInput = collectChangedSystemVolumeInput(options);
  if (!volumeInput) {
    const replayedActivity = replayedState?.active || null;
    return replayedActivity && Number(replayedActivity.expiresAt) >= nowMs ? volumeHudToNativeStatus(replayedActivity) : null;
  }
  const state = options.volumeActivityState || replayedState || defaultVolumeHudState;
  const result = applyVolumeHudInputChange(state, {
    ...volumeInput,
    observedAt: volumeInput.observedAt ?? options.volumeObservedAt ?? options.observedAt ?? nowMs
  }, {
    now: nowMs,
    transientMs: options.volumeTransientMs
  });
  if (options.hudEventStorePath) {
    recordVolumeHudEvent({
      outputPath: options.hudEventStorePath,
      input: {
        ...volumeInput,
        observedAt: result.active.updatedAt
      },
      now: nowMs,
      transientMs: options.volumeTransientMs,
      maxEvents: options.hudEventStoreMaxEvents
    });
  }
  if (!options.volumeActivityState) defaultVolumeHudState = result;
  return volumeHudToNativeStatus(result.active);
}

function collectBrightnessHudStatus(options = {}) {
  const now = options.now || new Date();
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const replayedState = options.hudReplayState?.brightness || null;
  const brightnessInput = collectChangedSystemBrightnessInput(options);
  if (!brightnessInput) {
    const replayedActivity = replayedState?.active || null;
    return replayedActivity && Number(replayedActivity.expiresAt) >= nowMs ? brightnessHudToNativeStatus(replayedActivity) : null;
  }
  const state = options.brightnessActivityState || replayedState || defaultBrightnessHudState;
  const result = applyBrightnessHudInputChange(state, {
    ...brightnessInput,
    observedAt: brightnessInput.observedAt ?? options.brightnessObservedAt ?? options.observedAt ?? nowMs
  }, {
    now: nowMs,
    transientMs: options.brightnessTransientMs
  });
  if (options.hudEventStorePath) {
    recordBrightnessHudEvent({
      outputPath: options.hudEventStorePath,
      input: {
        ...brightnessInput,
        observedAt: result.active.updatedAt
      },
      now: nowMs,
      transientMs: options.brightnessTransientMs,
      maxEvents: options.hudEventStoreMaxEvents
    });
  }
  if (!options.brightnessActivityState) defaultBrightnessHudState = result;
  return brightnessHudToNativeStatus(result.active);
}

function collectTimerStatus(options = {}) {
  return collectTimerActivityStatus({
    timer: options.timer,
    timerState: options.timerState,
    now: options.now,
    source: options.timerSource,
    completeTimerIfElapsed: options.completeTimerIfElapsed
  });
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
    const videoIdFromUrl = (url) => {
      const value = String(url || '');
      const watch = value.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
      if (watch) return watch[1];
      const short = value.match(/youtu\\.be\\/([A-Za-z0-9_-]{6,})/);
      if (short) return short[1];
      const shorts = value.match(/youtube\\.com\\/shorts\\/([A-Za-z0-9_-]{6,})/);
      return shorts ? shorts[1] : '';
    };
    const thumbnailForUrl = (url) => {
      const id = videoIdFromUrl(url);
      return id ? 'https://img.youtube.com/vi/' + id + '/hqdefault.jpg' : '';
    };
    const player = document.getElementById('movie_player');
    const videos = Array.from(document.querySelectorAll('video'));
    const video = document.querySelector('#movie_player video.video-stream') || document.querySelector('video.html5-main-video') || videos.find((item) => finite(item.duration) > 0) || videos[0] || null;
    const title = text('h1 yt-formatted-string') || meta('meta[property="og:title"]') || document.title.replace(/ - YouTube$/, '').trim();
    const artist = text('#owner #channel-name a') || text('#text.ytd-channel-name') || text('ytd-channel-name a') || 'YouTube';
    const pageUrl = location.href;
    const urlThumbnail = thumbnailForUrl(pageUrl);
    const artworkUrl = urlThumbnail || meta('meta[property="og:image"]');
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
  // Guard on `is running` so a non-running browser returns instantly instead of
  // making System Events UI-script a dead process, and wrap the window
  // enumeration in `with timeout` so a running-but-unresponsive browser aborts
  // the Apple Event itself rather than hanging until the external kill.
  return [
    'try',
    `if application "${browserName}" is running then`,
    'with timeout of 2 seconds',
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
    'end timeout',
    'end if',
    'end try'
  ].join("\n");
}

function arcSpaceYouTubeTabsScript(browserName = "Arc") {
  return [
    'try',
    `if application "${browserName}" is running then`,
    `tell application "${browserName}"`,
    'set outputLines to {}',
    'repeat with t in tabs of active space of front window',
    'try',
    'set tabUrl to URL of t',
    `if ${youtubeUrlAppleScriptCondition("tabUrl")} then`,
    'set end of outputLines to "youtube-title||" & (title of t) & "||" & tabUrl',
    'end if',
    'end try',
    'end repeat',
    'set AppleScript\'s text item delimiters to linefeed',
    'return outputLines as text',
    'end tell',
    'end if',
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
      'with timeout of 2 seconds',
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
      'end timeout',
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
        artworkUrl: youtubeArtworkUrl(pageUrl, payload.artworkUrl),
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
    artworkUrl: info.source === "youtube" ? youtubeArtworkUrl(info.pageUrl || "", info.artworkUrl || "") : (info.artworkUrl || youtubeThumbnailUrl(info.pageUrl || "") || ""),
    durationSeconds: Number.isFinite(Number(info.durationSeconds)) ? Number(info.durationSeconds) : 0,
    positionSeconds: Number.isFinite(Number(info.positionSeconds)) ? Number(info.positionSeconds) : 0,
    playbackState: info.playbackState || "unknown",
    pageUrl: info.pageUrl || "",
    browserName: info.browserName || "",
    appName: info.appName || "",
    bundleIdentifier: info.bundleIdentifier || "",
    firstSeenAt: info.firstSeenAt || "",
    isFrontmost: Boolean(info.isFrontmost)
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

function youtubeArtworkUrl(pageUrl, candidateArtworkUrl = "") {
  return youtubeThumbnailUrl(pageUrl) || candidateArtworkUrl || "";
}

function mediaStatusFromInfo(info, candidates = []) {
  const normalizedCandidates = candidates.map((candidate) => normalizeMediaInfo(candidate)).filter(Boolean);
  if (!info) {
    return {
      agent: "Now Playing",
      state: "idle",
      task: "Nothing playing",
      detail: "No active media playback surface was detected.",
      candidates: normalizedCandidates,
      media: {
        source: "none",
        title: "Nothing playing",
        artist: "",
        album: "",
        artworkUrl: "",
        durationSeconds: 0,
        positionSeconds: 0,
        playbackState: "idle",
        pageUrl: "",
        firstSeenAt: ""
      }
    };
  }

  return {
    agent: "Now Playing",
    state: info.playbackState === "paused" ? "idle" : "running",
    task: truncate(info.title, 48),
    detail: info.artist ? truncate(info.artist, 80) : (info.source === "youtube" || info.source === "browser-media" ? "Browser media" : truncate(info.album, 80)),
    candidates: normalizedCandidates,
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
      pageUrl: info.pageUrl || "",
      browserName: info.browserName || "",
      appName: info.appName || "",
      bundleIdentifier: info.bundleIdentifier || "",
      firstSeenAt: info.firstSeenAt || ""
    }
  };
}

function frontmostApplicationName(options = {}) {
  if (options.frontmostApp !== undefined) return options.frontmostApp;
  return runCommand("osascript", ["-e", 'tell application "System Events" to name of first application process whose frontmost is true']);
}

function collectFrontmostBrowserYouTubeInfo(options = {}) {
  const frontmostApp = frontmostApplicationName(options);
  if (options.frontmostBrowserMediaText !== undefined) {
    const info = parseDelimitedMedia(options.frontmostBrowserMediaText);
    if (info) return { ...info, browserName: frontmostApp || options.frontmostApp, isFrontmost: true };
    return null;
  }
  if (options.browserMediaTexts !== undefined) return null;
  const browserNames = new Set([
    ...CHROMIUM_YOUTUBE_BROWSERS,
    ...SAFARI_YOUTUBE_BROWSERS,
    ...FIREFOX_YOUTUBE_BROWSERS
  ]);
  if (!browserNames.has(frontmostApp)) return null;

  // Arc's AppleScript tab APIs can hang at the app-window level on macOS 26; Arc
  // timing/currentTime must come from CDP instead of this frontmost fast path.
  const script = frontmostApp === "Arc"
    ? chromiumFallbackYouTubeTitleScript(frontmostApp)
    : browserYouTubeScript(frontmostApp);
  const info = parseDelimitedMedia(runCommand("osascript", ["-e", script], { timeout: frontmostApp === "Arc" ? 450 : 2200 }));
  if (info) return { ...info, browserName: frontmostApp, isFrontmost: true };
  return null;
}

function collectChromeDevToolsYouTubeInfo(options = {}) {
  if (options.cdpMediaText !== undefined) {
    const info = parseDelimitedMedia(options.cdpMediaText);
    return info ? { ...info, browserName: "Chrome DevTools Protocol" } : null;
  }
  const ports = options.cdpPorts || process.env.DYNAMAC_CDP_PORTS || process.env.DYNAMAC_CHROME_DEBUG_PORTS || "";
  const probePath = path.join(__dirname, "..", "scripts", "probe-youtube-cdp.js");
  const raw = runCommand(process.execPath, ports ? [probePath, String(ports)] : [probePath], { timeout: 1800 });
  const info = parseDelimitedMedia(raw);
  return info ? { ...info, browserName: "Chrome DevTools Protocol" } : null;
}

function collectYouTubeBridgeInfo(options = {}) {
  if (options.youtubeBridgeInfo !== undefined) return normalizeMediaInfo(options.youtubeBridgeInfo);
  if (options.youtubeBridgeRaw !== undefined) {
    try {
      return normalizeMediaInfo(JSON.parse(String(options.youtubeBridgeRaw || "{}")));
    } catch (_error) {
      return null;
    }
  }
  const mediaPath = options.youtubeBridgePath || process.env.DYNAMAC_YOUTUBE_MEDIA_FILE || path.join(process.cwd(), ".build", "youtube-media.json");
  try {
    const stat = fs.statSync(mediaPath);
    const maxAgeMs = Number(options.youtubeBridgeMaxAgeMs ?? process.env.DYNAMAC_YOUTUBE_MEDIA_MAX_AGE_MS ?? 3500);
    if (Number.isFinite(maxAgeMs) && maxAgeMs > 0 && Date.now() - stat.mtimeMs > maxAgeMs) return null;
    return normalizeMediaInfo(JSON.parse(fs.readFileSync(mediaPath, "utf8")));
  } catch (_error) {
    return null;
  }
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
        const spaceInfos = collectArcSpaceYouTubeMediaInfos(options);
        if (spaceInfos[0]) return spaceInfos[0];
        const fallbackInfo = parseDelimitedMedia(runCommand("osascript", ["-e", chromiumFallbackYouTubeTitleScript(browserName)], { timeout: 650 }));
        if (fallbackInfo) return { ...fallbackInfo, browserName };
        return null;
      }
      const raw = runCommand("osascript", ["-e", browserYouTubeScript(browserName)], { timeout: 650 });
      let info = parseDelimitedMedia(raw);
      if (!info && CHROMIUM_YOUTUBE_BROWSERS.includes(browserName)) {
        info = parseDelimitedMedia(runCommand("osascript", ["-e", chromiumFallbackYouTubeTitleScript(browserName)], { timeout: 500 }));
      }
      return info ? { ...info, browserName } : null;
    })
    .filter(Boolean);
}

function materializeMediaRemoteArtworkData(payload, options = {}) {
  const artworkData = payload?.kMRMediaRemoteNowPlayingInfoArtworkData || payload?.artworkData || "";
  if (!artworkData || options.cacheRemoteArtwork !== true) return "";
  const buffer = Buffer.from(String(artworkData), "base64");
  if (!buffer.length) return "";
  const cacheDir = options.artworkCacheDir || path.join(process.cwd(), ".build", "artwork-cache");
  const hash = crypto.createHash("sha1").update(buffer).digest("hex");
  const outputPath = path.join(cacheDir, `${hash}.jpg`);
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(outputPath, buffer);
  }
  return outputPath;
}

function mediaRemoteSourceFromBundle(bundleIdentifier = "") {
  const bundle = String(bundleIdentifier || "").toLowerCase();
  const browserBundles = new Set([
    "com.google.chrome",
    "com.google.chrome.canary",
    "org.chromium.chromium",
    "company.thebrowser.browser",
    "com.brave.browser",
    "com.microsoft.edgemac",
    "com.vivaldi.vivaldi",
    "com.operasoftware.opera",
    "com.operasoftware.operagx",
    "com.apple.safari"
  ]);
  if (browserBundles.has(bundle)) return "browser-media";
  if (bundle.includes("spotify")) return "spotify";
  if (bundle.includes("tidal")) return "tidal";
  if (bundle.includes("melon")) return "melon";
  if (bundle.includes("genie")) return "genie";
  if (bundle.includes("youtube") && bundle.includes("music")) return "youtube-music";
  if (bundle.includes("music") || bundle === "com.apple.music" || bundle === "com.apple.itunes") return "music";
  return "now-playing";
}

function parseMediaRemoteNowPlaying(raw, options = {}) {
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
  const source = mediaRemoteSourceFromBundle(bundleIdentifier);
  const playbackRate = Number(payload.kMRMediaRemoteNowPlayingInfoPlaybackRate ?? payload.playbackRate ?? 0);
  const mediaRemoteArtworkUrl = materializeMediaRemoteArtworkData(payload, options);
  return normalizeMediaInfo({
    source,
    title,
    artist: payload.kMRMediaRemoteNowPlayingInfoArtist || payload.artist || (source === "youtube" ? "YouTube" : ""),
    album: payload.kMRMediaRemoteNowPlayingInfoAlbum || payload.album || (source === "youtube" ? "YouTube" : ""),
    artworkUrl: mediaRemoteArtworkUrl,
    durationSeconds: Number(payload.kMRMediaRemoteNowPlayingInfoDuration ?? payload.duration ?? 0),
    positionSeconds: Number(payload.kMRMediaRemoteNowPlayingInfoElapsedTime ?? payload.elapsedTime ?? 0),
    playbackState: playbackRate > 0 ? "playing" : "paused",
    pageUrl: "",
    bundleIdentifier
  });
}

function collectArcSpaceYouTubeMediaInfos(options = {}) {
  const isFixtureRun = options.arcSpaceMediaTexts === undefined && (
    options.browserMediaTexts !== undefined ||
    options.frontmostBrowserMediaText !== undefined ||
    options.mediaRemoteRaw !== undefined ||
    options.mediaRemoteInfo !== undefined ||
    options.spotifyText !== undefined ||
    options.musicText !== undefined ||
    options.cdpMediaText !== undefined ||
    options.youtubeBridgeInfo !== undefined
  );
  if (isFixtureRun) return [];
  const rawTexts = options.arcSpaceMediaTexts !== undefined
    ? options.arcSpaceMediaTexts
    : String(runCommand("osascript", ["-e", arcSpaceYouTubeTabsScript("Arc")], { timeout: 900 }) || "").split(/\r?\n/).filter(Boolean);
  return rawTexts.map((entry) => parseDelimitedMedia(typeof entry === "string" ? entry : entry.text)).filter(Boolean).map((info) => ({ ...info, browserName: "Arc", probe: "arc-space-tabs" }));
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
    source: info.source === "browser-media" && matchingBrowser?.source === "youtube" ? (String(matchingBrowser.pageUrl || "").includes("music.youtube.com") ? "youtube-music" : "youtube") : info.source,
    artworkUrl: info.artworkUrl || matchingBrowser?.artworkUrl || "",
    pageUrl: info.pageUrl || matchingBrowser?.pageUrl || "",
    artist: info.artist || matchingBrowser?.artist || "",
    album: info.album || matchingBrowser?.album || ""
  });
}

function collectMediaRemoteInfo(options = {}) {
  if (options.mediaRemoteInfo !== undefined) return normalizeMediaInfo(options.mediaRemoteInfo);
  if (options.mediaRemoteRaw !== undefined) return parseMediaRemoteNowPlaying(options.mediaRemoteRaw, options);
  return parseMediaRemoteNowPlaying(runCommand("nowplaying-cli", ["get-raw"], { timeout: 900 }), options);
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
    // Prefer MediaRemote artwork data when present because it is already the exact current
    // cover bytes; use native app artwork URL/cache only as fallback.
    artworkUrl: info.artworkUrl || nativeInfo.artworkUrl || "",
    durationSeconds: nativeInfo.durationSeconds || info.durationSeconds,
    // Spotify's MediaRemote elapsed field can stay pinned at 0 while Apple's own menu
    // keeps ticking from a private live clock. Spotify/Music AppleScript exposes the
    // live player position, so use that for our displayed playtime.
    positionSeconds: Number.isFinite(nativeInfo.positionSeconds) ? nativeInfo.positionSeconds : info.positionSeconds,
    playbackState: nativeInfo.playbackState || info.playbackState,
    pageUrl: info.pageUrl || nativeInfo.pageUrl || "",
    bundleIdentifier: info.bundleIdentifier
  });
}

function mediaIdentityKey(info) {
  if (!info) return "";
  return [info.source || "unknown", info.bundleIdentifier || info.browserName || info.appName || "", info.title || "", info.artist || ""].join("||");
}

function previousMediaRecords(previousPayload) {
  // native-start seeds the first refresh with `previousPayload: null`, and a
  // default parameter only fills `undefined` — so guard null explicitly or the
  // very first snapshot throws and status.json never gets written.
  const nowPlaying = (previousPayload || {}).statuses?.find((status) => status.agent === "Now Playing") || {};
  return [nowPlaying.media, ...(nowPlaying.candidates || [])].filter(Boolean);
}

function attachFirstSeenAt(candidates, options = {}) {
  const now = (options.now || new Date()).toISOString();
  const previousByKey = new Map(previousMediaRecords(options.previousPayload).map((item) => [mediaIdentityKey(item), item]));
  return candidates.map((candidate) => {
    const normalized = normalizeMediaInfo(candidate);
    const previous = previousByKey.get(mediaIdentityKey(normalized));
    return {
      ...normalized,
      firstSeenAt: previous?.firstSeenAt || (previous?.playbackState === "playing" ? previous?.updatedAt : "") || now
    };
  });
}

function dedupeMediaCandidates(candidates) {
  const byKey = new Map();
  for (const candidate of candidates.map((item) => normalizeMediaInfo(item)).filter(Boolean)) {
    const key = mediaIdentityKey(candidate);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, candidate);
      continue;
    }
    const merged = normalizeMediaInfo({
      ...existing,
      ...candidate,
      artworkUrl: existing.artworkUrl || candidate.artworkUrl,
      pageUrl: existing.pageUrl || candidate.pageUrl,
      firstSeenAt: existing.firstSeenAt || candidate.firstSeenAt,
      positionSeconds: Math.max(Number(existing.positionSeconds || 0), Number(candidate.positionSeconds || 0)),
      playbackState: existing.playbackState === "playing" || candidate.playbackState === "playing" ? "playing" : (candidate.playbackState || existing.playbackState),
      isFrontmost: existing.isFrontmost || candidate.isFrontmost
    });
    byKey.set(key, merged);
  }
  return Array.from(byKey.values());
}

function collectMediaCandidates(options = {}) {
  const rawMediaRemoteInfo = collectMediaRemoteInfo(options);
  const broadBrowserInfos = collectBrowserYouTubeMediaInfos(options);
  const arcSpaceInfos = collectArcSpaceYouTubeMediaInfos(options);
  const candidates = [];
  const frontmostBrowserInfo = collectFrontmostBrowserYouTubeInfo(options);
  if (frontmostBrowserInfo) candidates.push(frontmostBrowserInfo);
  const cdpBrowserInfo = collectChromeDevToolsYouTubeInfo(options);
  if (cdpBrowserInfo) candidates.push(cdpBrowserInfo);
  const bridgeBrowserInfo = collectYouTubeBridgeInfo(options);
  if (bridgeBrowserInfo) candidates.push(bridgeBrowserInfo);
  candidates.push(...broadBrowserInfos, ...arcSpaceInfos);
  const mediaRemoteInfo = enrichNativeAppMediaRemoteInfo(enrichMediaRemoteInfo(rawMediaRemoteInfo, [...broadBrowserInfos, ...arcSpaceInfos]), options);
  if (mediaRemoteInfo) candidates.push(mediaRemoteInfo);
  const spotifyInfo = materializeArtwork(parseDelimitedMedia(options.spotifyText ?? runCommand("osascript", ["-e", spotifyScript()])), options);
  const musicInfo = materializeArtwork(parseDelimitedMedia(options.musicText ?? runCommand("osascript", ["-e", musicScript()])), options);
  if (spotifyInfo) candidates.push(spotifyInfo);
  if (musicInfo) candidates.push(musicInfo);
  return attachFirstSeenAt(dedupeMediaCandidates(candidates), options);
}

function hasPlaybackEvidence(candidate) {
  // A background title-only browser-tab probe reports playbackState "unknown"
  // with no duration/position — that is just an open tab, not active playback.
  // The frontmost browser tab (the one the user is actively viewing) stays
  // eligible even without progress data.
  return candidate.isFrontmost
    || candidate.playbackState === "playing"
    || candidate.playbackState === "paused"
    || Number(candidate.durationSeconds) > 0
    || Number(candidate.positionSeconds) > 0;
}

function selectFirstPlayingMediaCandidate(candidates) {
  const playing = candidates.filter((candidate) => candidate.playbackState === "playing");
  const paused = candidates.filter((candidate) => candidate.playbackState === "paused");
  // Without the evidence filter on the final fallback, an idle YouTube tab
  // (unknown state, 0:00/0:00) would show as Now Playing forever whenever
  // nothing is actually playing.
  const pool = playing.length ? playing : (paused.length ? paused : candidates.filter(hasPlaybackEvidence));
  if (!pool.length) return null;
  return [...pool].sort((left, right) => {
    const leftTime = Date.parse(left.firstSeenAt || "") || Number.MAX_SAFE_INTEGER;
    const rightTime = Date.parse(right.firstSeenAt || "") || Number.MAX_SAFE_INTEGER;
    if (leftTime !== rightTime) return leftTime - rightTime;
    return candidates.indexOf(left) - candidates.indexOf(right);
  })[0];
}

function collectMediaStatus(options = {}) {
  if (options.mediaInfo !== undefined) return mediaStatusFromInfo(normalizeMediaInfo(options.mediaInfo));
  if (options.mediaText !== undefined) return mediaStatusFromInfo(parseDelimitedMedia(options.mediaText));

  const candidates = collectMediaCandidates(options);
  const selected = selectFirstPlayingMediaCandidate(candidates);
  return mediaStatusFromInfo(selected, candidates);
}

function buildMacActivityStatusPayload(options = {}) {
  const now = options.now || new Date();
  const hudEventStorePath = options.hudEventStorePath || process.env.DYNAMAC_HUD_EVENT_STORE || "";
  const hudReplayState = options.hudReplayState || (hudEventStorePath ? reconstructHudActivityState({
    outputPath: hudEventStorePath,
    now: now instanceof Date ? now.getTime() : Number(now),
    transientMs: options.volumeTransientMs ?? options.brightnessTransientMs
  }) : null);
  const statuses = [
    collectVolumeHudStatus({ ...options, hudEventStorePath, hudReplayState }),
    collectBrightnessHudStatus({ ...options, hudEventStorePath, hudReplayState }),
    collectTimerStatus(options),
    collectMediaStatus(options),
    collectClipboardStatus(options),
    collectBatteryStatus(options)
  ].filter(Boolean).map((status) => ({
    ...status,
    updatedAt: now.toISOString()
  }));

  return {
    statuses,
    activityRouter: buildActivityRouterSnapshot(statuses, { now })
  };
}

function sameMediaIdentity(left, right) {
  return Boolean(left && right)
    && left.source === right.source
    && left.title === right.title
    && left.artist === right.artist;
}

function stabilizeMediaProgress(payload, previousPayload, now = new Date()) {
  if (!previousPayload) return payload;
  const currentStatus = payload.statuses?.find((status) => status.agent === "Now Playing");
  const previousStatus = previousPayload.statuses?.find((status) => status.agent === "Now Playing");
  const current = currentStatus?.media;
  const previous = previousStatus?.media;
  if (!current || !previous || !sameMediaIdentity(current, previous)) return payload;
  if (current.playbackState !== "playing" || previous.playbackState !== "playing") return payload;

  const currentPosition = Number(current.positionSeconds || 0);
  const previousPosition = Number(previous.positionSeconds || 0);
  const previousUpdatedAt = Date.parse(previousStatus.updatedAt || previousPayload.updatedAt || "");
  const elapsed = Number.isFinite(previousUpdatedAt) ? Math.max(0, (now.getTime() - previousUpdatedAt) / 1000) : 0;
  const expectedPosition = previousPosition + elapsed;
  const backwardJump = previousPosition - currentPosition;
  const staleZeroFallback = currentPosition === 0 && previousPosition > 3;
  const staleBackwardFallback = backwardJump > 0.25 && backwardJump <= 12;
  if (staleZeroFallback || staleBackwardFallback) {
    current.positionSeconds = Math.min(expectedPosition, Number(current.durationSeconds || 0) || expectedPosition);
    current.elapsedLabel = formatDuration(current.positionSeconds);
  }
  return payload;
}

function writeMacActivityStatusSnapshot(options = {}) {
  const outputPath = options.outputPath;
  if (!outputPath) throw new Error("outputPath is required");
  const payload = stabilizeMediaProgress(
    buildMacActivityStatusPayload({ ...options, cacheRemoteArtwork: options.cacheRemoteArtwork ?? true }),
    options.previousPayload,
    options.now || new Date()
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`);
  fs.renameSync(tempPath, outputPath);
  return { ok: true, outputPath, payload };
}

module.exports = {
  runCommand,
  selectFirstPlayingMediaCandidate,
  buildMacActivityStatusPayload,
  arcSpaceYouTubeTabsScript,
  browserYouTubeScript,
  CHROMIUM_YOUTUBE_BROWSERS,
  chromiumFallbackYouTubeTitleScript,
  FIREFOX_YOUTUBE_BROWSERS,
  SAFARI_YOUTUBE_BROWSERS,
  classifyClipboardText,
  collectBatteryStatus,
  createBatteryHudState,
  collectBrightnessHudStatus,
  collectChangedSystemBrightnessInput,
  collectChangedSystemVolumeInput,
  collectClipboardStatus,
  collectTimerStatus,
  collectVolumeHudStatus,
  collectMediaCandidates,
  collectMediaStatus,
  formatDuration,
  parseBatteryObservationFromPmset,
  parseDelimitedMedia,
  parseMediaRemoteNowPlaying,
  parsePmsetBattery,
  stabilizeMediaProgress,
  writeMacActivityStatusSnapshot,
  youtubeArtworkUrl,
  youtubeThumbnailUrl
};
