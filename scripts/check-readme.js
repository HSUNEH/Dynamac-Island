#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const readmePath = path.resolve(process.argv[2] || process.env.README_PATH || "README.md");
const readme = fs.readFileSync(readmePath, "utf8");

function getSection(heading) {
  const headingIndex = readme.indexOf(heading);
  if (headingIndex === -1) {
    return "";
  }

  const followingContent = readme.slice(headingIndex);
  const nextHeadingIndex = followingContent.slice(heading.length).search(/\n##\s+/);
  return nextHeadingIndex === -1
    ? followingContent
    : followingContent.slice(0, heading.length + nextHeadingIndex);
}

function hasShellCommandAfterHeading(heading, command) {
  const section = getSection(heading);
  const shellBlocks = section.match(/```(?:sh|bash)?\n[\s\S]*?\n```/g) || [];

  return shellBlocks.some((block) =>
    block
      .replace(/```(?:sh|bash)?\n/, "")
      .replace(/\n```$/, "")
      .split("\n")
      .map((line) => line.trim())
      .includes(command)
  );
}

const requiredSnippets = [
  ["product identity", "macOS notch-attached utility island for everyday Mac activity"],
  ["not normal app", "not a normal desktop app window"],
  ["Dynamic Island concept", "compact live-activity surface around the camera/sensor area"],
  ["notch anchored current state", "Notch-attached floating overlay, not a normal movable app window"],
  ["physical display anchoring", "pins `y` to the physical top edge"],
  ["Mac activity status source", "native `npm run native:start` writes and refreshes a local Mac activity snapshot in `.build/status.json` while running, using a low-latency default refresh loop"],
  ["Mac activity runtime model", "`Now Playing` from Spotify/Music best-effort AppleScript plus YouTube tab scanning across Safari, Chrome/Chromium-family browsers, and a Firefox-family title fallback with page metadata/video timing/thumbnail detection where the browser exposes tab JavaScript; `Clipboard` from local text clipboard, and `Battery` from `pmset -g batt`"],
  ["Now Playing notch mode", "notch mode shows only album art/YouTube thumbnail/music-note fallback on the left wing plus a white waveform playing indicator on the right wing"],
  ["Now Playing non-notch compact mode", "non-notch/external-display compact mode uses one centered pill with a compact trailing white waveform that stays after the artwork without consuming the pill"],
  ["Now Playing expanded mode", "expanded mode uses an Apple-inspired quiet media sheet: larger artwork, SF-style 17/21pt typography, split elapsed/duration labels, thin scrubber with a visible thumb and an intentionally narrow bar-only seek target, centered pill transport controls, draggable/clickable seek, and previous/play-pause/next vector controls"],
  ["Now Playing auto collapse", "Expanded mode automatically collapses back to compact mode after 7 seconds by default"],
  ["Now Playing transition performance", "Notch-to-expanded transitions animate only the lightweight island shell, then fade media content in after resize"],
  ["fixtures only", "Fixture JSON files under `fixtures/` remain only for deterministic tests"],
  ["watched status source", "status/status.json"],
  ["required fields", "`agent`, `state`, `task`, `updatedAt`, and `detail`"],
  ["allowed states", "`idle`, `running`, `success`, `warning`, `error`"],
  ["invalid input behavior", "Invalid JSON or invalid status fields are visible in the app as an error state"],
  ["small scope boundary", "No credentials, network services, HTTP endpoint, deployment, or external side effects"],
  ["install command", "npm install"],
  ["launch command", "npm start"],
  ["MacBook smoke test heading", "## MacBook Smoke Test"],
  ["MacBook smoke test intro", "Run these checks on the target MacBook after `npm install`:"],
  ["MacBook native smoke test launch path", "Run `npm run native:smoke` from `~/projects/dynamac-island`"],
  ["MacBook native overlay launch path", "Run `npm run native:start` from `~/projects/dynamac-island`"],
  ["notch wing verification", "on non-notch/external displays, Dynamac uses one normal compact pill"],
  ["live calibration command", "npm run native:calibrate"],
  ["machine-local calibration file", ".dynamac-calibration.json"],
  ["screenshot QA silhouette", "DYNAMAC_QA_NOTCH_SILHOUETTE=1"],
  ["screenshot capture command", "screencapture -x /tmp/dynamac-notch-qa.png"],
  ["notch test command", "npm run test:notch-position"],
  ["Mac activity status test command", "npm run test:mac-activity-status"],
  ["Hermes status test command", "npm run test:hermes-status"],
  ["README validation test description", "Run the README content validation test"],
  ["README validation coverage", "This test is runnable and fails if the README stops documenting"],
  ["manual update verification heading", "## Manual Update Verification"],
  [
    "manual update verification purpose",
    "Use this exact path when headless UI automation cannot prove that the live island updates on screen"
  ],
  ["manual update terminal 1 step", "Terminal 1: launch the app from the project directory"],
  ["manual update initial observation", "Confirm the floating pill is visible and attached to the notch/top-center area."],
  ["manual status inspection", "inspect the generated runtime status file"],
  ["manual real status observation", "Now Playing, Clipboard, and Battery instead of deterministic sample jobs"],
  ["manual invalid JSON step", "write malformed JSON to the watched file"],
  [
    "manual invalid JSON observation",
    "Observe the running app without relaunching and confirm the pill shows an error state for the invalid status input."
  ],
  ["status validation command", "npm run check-status"],
  ["valid fixture command", "npm run check-status:valid"],
  ["invalid fixture command", "npm run check-status:invalid"],
  ["roadmap section", "## Roadmap"]
];

function containsCurlPipeToShellInstall(content) {
  return /curl\b[^\n|]*\|\s*(?:sh|bash)\b/.test(content);
}

const missing = requiredSnippets.filter(([, snippet]) => !readme.includes(snippet));

if (containsCurlPipeToShellInstall(readme)) {
  missing.push([
    "safe install instructions",
    "do not document curl-pipe-to-shell installation; clone first, inspect, then run scripts/install-macbook.sh"
  ]);
}

if (!hasShellCommandAfterHeading("## Runbook", "npm install")) {
  missing.push(["runbook install command block", "npm install in a Runbook shell code block"]);
}

if (!hasShellCommandAfterHeading("## Runbook", "cd ~/projects/dynamac-island")) {
  missing.push(["runbook project directory command block", "cd ~/projects/dynamac-island in a Runbook shell code block"]);
}

if (!hasShellCommandAfterHeading("## Runbook", "npm start")) {
  missing.push(["runbook launch command block", "npm start in a Runbook shell code block"]);
}

if (!hasShellCommandAfterHeading("## Runbook", "npm run native:start")) {
  missing.push(["runbook native launch command block", "npm run native:start in a Runbook shell code block"]);
}

if (!hasShellCommandAfterHeading("## Runbook", "npm run native:smoke")) {
  missing.push(["runbook native smoke command block", "npm run native:smoke in a Runbook shell code block"]);
}

if (!hasShellCommandAfterHeading("## Runbook", "npm run test:notch-position")) {
  missing.push(["runbook notch test command block", "npm run test:notch-position in a Runbook shell code block"]);
}

if (!hasShellCommandAfterHeading("## Runbook", "npm run test:hermes-status")) {
  missing.push(["runbook Hermes status test command block", "npm run test:hermes-status in a Runbook shell code block"]);
}

if (!hasShellCommandAfterHeading("## MacBook Smoke Test", "npm run check-readme")) {
  missing.push([
    "smoke test README validation command block",
    "npm run check-readme in a MacBook Smoke Test shell code block"
  ]);
}

if (!hasShellCommandAfterHeading("## Manual Update Verification", "cd ~/projects/dynamac-island")) {
  missing.push([
    "manual update project directory command block",
    "cd ~/projects/dynamac-island in a Manual Update Verification shell code block"
  ]);
}

if (!hasShellCommandAfterHeading("## Manual Update Verification", "npm start")) {
  missing.push(["manual update launch command block", "npm start in a Manual Update Verification shell code block"]);
}

if (!hasShellCommandAfterHeading("## Manual Update Verification", "npm run check-status")) {
  missing.push(["manual status check command block", "npm run check-status in a Manual Update Verification shell code block"]);
}

if (!hasShellCommandAfterHeading("## Manual Update Verification", "printf '{ \"statuses\": [\\n' > status/status.json")) {
  missing.push([
    "manual malformed JSON command block",
    "printf '{ \"statuses\": [\\n' > status/status.json in a Manual Update Verification shell code block"
  ]);
}

const roadmapSection = getSection("## Roadmap");
const roadmapItems = roadmapSection
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.startsWith("- "));

if (roadmapItems.length < 3) {
  missing.push(["roadmap items", "at least three bullet items in the Roadmap section"]);
}

if (missing.length > 0) {
  console.error("README content check failed.");
  for (const [label, snippet] of missing) {
    console.error(`- Missing ${label}: ${snippet}`);
  }
  process.exit(1);
}

console.log("README content check passed.");
