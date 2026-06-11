const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function runCommand(command, args, options = {}) {
  try {
    return childProcess.execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 1500,
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

function browserYouTubeScript(browserName) {
  return [
    `if application "${browserName}" is running then`,
    `tell application "${browserName}"`,
    'set tabTitle to ""',
    'set tabUrl to ""',
    browserName === "Safari" ? 'if (count of windows) > 0 then set tabTitle to name of current tab of front window' : 'if (count of windows) > 0 then set tabTitle to title of active tab of front window',
    browserName === "Safari" ? 'if (count of windows) > 0 then set tabUrl to URL of current tab of front window' : 'if (count of windows) > 0 then set tabUrl to URL of active tab of front window',
    'if tabUrl contains "youtube.com/watch" or tabUrl contains "youtu.be/" then return "youtube||" & tabTitle & "||||YouTube||||0||0||unknown||" & tabUrl',
    'end tell',
    'end if'
  ].join("\n");
}

function parseDelimitedMedia(raw) {
  const parts = String(raw || "").split("||");
  if (parts.length < 8) return null;
  const [source, title, artist, album, artworkUrl, durationRaw, positionRaw, playbackState, pageUrl] = parts;
  const durationSeconds = source === "spotify" ? Number(durationRaw) / 1000 : Number(durationRaw);
  const positionSeconds = Number(positionRaw);
  return {
    source: source || "unknown",
    title: title || "Unknown title",
    artist: artist || "",
    album: album || "",
    artworkUrl: artworkUrl || youtubeThumbnailUrl(pageUrl || artworkUrl || "") || "",
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
    positionSeconds: Number.isFinite(positionSeconds) ? positionSeconds : 0,
    playbackState: playbackState || "unknown",
    pageUrl: pageUrl || ""
  };
}

function youtubeVideoId(url) {
  const text = String(url || "");
  const watchMatch = text.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  if (watchMatch) return watchMatch[1];
  const shortMatch = text.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  return shortMatch ? shortMatch[1] : "";
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
        playbackState: "idle"
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
      durationLabel: formatDuration(info.durationSeconds)
    }
  };
}

function collectMediaStatus(options = {}) {
  if (options.mediaInfo !== undefined) return mediaStatusFromInfo(options.mediaInfo);
  if (options.mediaText !== undefined) return mediaStatusFromInfo(parseDelimitedMedia(options.mediaText));

  const raw = runCommand("osascript", ["-e", spotifyScript()])
    || runCommand("osascript", ["-e", musicScript()])
    || runCommand("osascript", ["-e", browserYouTubeScript("Google Chrome")])
    || runCommand("osascript", ["-e", browserYouTubeScript("Safari")]);
  return mediaStatusFromInfo(parseDelimitedMedia(raw));
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
  const payload = buildMacActivityStatusPayload(options);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  return { ok: true, outputPath, payload };
}

module.exports = {
  buildMacActivityStatusPayload,
  classifyClipboardText,
  collectBatteryStatus,
  collectClipboardStatus,
  collectMediaStatus,
  formatDuration,
  parseDelimitedMedia,
  parsePmsetBattery,
  youtubeThumbnailUrl,
  youtubeVideoId,
  writeMacActivityStatusSnapshot
};
