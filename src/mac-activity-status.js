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
  return 'if application "Spotify" is running then tell application "Spotify" to if player state is playing then return name of current track & " — " & artist of current track';
}

function musicScript() {
  return 'if application "Music" is running then tell application "Music" to if player state is playing then return name of current track & " — " & artist of current track';
}

function collectMediaStatus(options = {}) {
  const mediaText = options.mediaText !== undefined
    ? options.mediaText
    : (runCommand("osascript", ["-e", spotifyScript()]) || runCommand("osascript", ["-e", musicScript()]));

  if (!mediaText) {
    return {
      agent: "Now Playing",
      state: "idle",
      task: "Nothing playing",
      detail: "No active Spotify or Music playback was detected."
    };
  }

  const [title, artist] = mediaText.split(" — ");
  return {
    agent: "Now Playing",
    state: "running",
    task: truncate(title || mediaText, 48),
    detail: artist ? truncate(artist, 80) : truncate(mediaText, 80)
  };
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
  parsePmsetBattery,
  writeMacActivityStatusSnapshot
};
