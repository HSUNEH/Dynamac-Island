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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getMarkdownSection(heading) {
  const headingMatch = heading.match(/^(#+)\s+/);
  if (!headingMatch) {
    return getSection(heading);
  }

  const headingLevel = headingMatch[1].length;
  const headingPattern = new RegExp(`^${escapeRegExp(heading)}\\s*$`, "m");
  const match = readme.match(headingPattern);
  if (!match || match.index === undefined) {
    return "";
  }

  const followingContent = readme.slice(match.index);
  const nextHeadingPattern = new RegExp(`\\n#{1,${headingLevel}}\\s+`);
  const nextHeadingIndex = followingContent.slice(heading.length).search(nextHeadingPattern);
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
  ["native display adaptation", "Display topology changes, wake/unlock, and display-wake events trigger delayed notch re-measurement plus frame re-anchoring"],
  ["Expose center motion", "Mission Control and App Exposé start events animate the island into a tiny screen-center capsule before restoring it to the notch/top-center position"],
  ["Mac activity status source", "native `npm run native:start` writes and refreshes a local Mac activity snapshot in `.build/status.json` while running, using a low-latency default refresh loop plus a native-to-writer refresh signal"],
  ["Spotify artwork freshness", "Spotify/Music MediaRemote snapshots are enriched with native app artwork and remote covers are materialized into a local `.build/artwork-cache` file before the native overlay reads them"],
  ["Mac activity runtime model", "normal Arc active-Space YouTube/YouTube Music tab title+URL probes"],
  ["Normal Arc extensionless media", "Normal Arc does not require `--load-extension`: Dynamac reads YouTube tab title/URL from Arc's active Space and merges it with MediaRemote"],
  ["First-playing media arbitration", "Dynamac keeps the candidate that was already playing first (`firstSeenAt`) until it stops"],
  ["Generic media source normalization", "`spotify`, `music`, `tidal`, `melon`, `genie`, `youtube-music`, `browser-media`, or `now-playing`"],
  ["YouTube extension launch", "launch with `npm run start:arc-media` or `npm run start:chrome-media`, allow YouTube/Media loopback access to `127.0.0.1` when Arc asks"],
  ["Arc shared Space mode", "with the bridge extension in a dedicated Snuffles Space"],
  ["Now Playing notch mode", "notch mode shows only album art/YouTube thumbnail/music-note fallback on the left wing plus a white waveform playing indicator on the right wing"],
  ["Now Playing non-notch compact mode", "non-notch/external-display compact mode uses one centered pill with a compact trailing white waveform that stays after the artwork without consuming the pill"],
  ["Now Playing expanded mode", "expanded mode keeps Dynamac's existing dark/media colors but borrows only the Apple DESIGN.md form language: product-first larger artwork, quiet chrome, 8pt rhythm, SF-style 17/21pt typography, notch-safe metadata placement on MacBook displays so the physical camera housing does not cover source/title text, split elapsed/duration labels, thin scrubber with a visible thumb and an intentionally narrow bar-only seek target, centered pill transport controls, draggable/clickable seek, and previous/play-pause/next vector controls"],
  ["Now Playing source opener", "In expanded mode, clicking the album art or source/title/artist text opens the media source app/page, including activating Spotify for Spotify playback"],
  ["Now Playing auto collapse", "Expanded mode automatically collapses back to compact mode after 5 seconds of no expanded-mode interaction by default"],
  ["Now Playing transition performance", "Notch-to-expanded transitions animate only the lightweight island shell, then fade media content in after resize"],
  ["fixtures only", "Fixture JSON files under `fixtures/` remain only for deterministic tests"],
  ["watched status source", "status/status.json"],
  ["required fields", "`agent`, `state`, `task`, `updatedAt`, and `detail`"],
  ["allowed states", "`idle`, `running`, `success`, `warning`, `error`"],
  ["invalid input behavior", "Invalid JSON or invalid status fields are visible in the app as an error state"],
  ["small scope boundary", "No credentials, deployment, or external network side effects"],
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
  ["roadmap section", "## Roadmap"],
  ["DynaDrop/Shelf section", "### DynaDrop/Shelf Core Model"],
  ["DynaDrop model boundary", "DynaDrop/Shelf MVP as deterministic local shelf state, not native drag capture"],
  ["DynaDrop reveal-safe metadata", "stores only reveal-safe metadata in state"],
  ["DynaDrop no file contents", "File contents are never read into shelf state"],
  ["DynaDrop activity status fields", "stable activity fields (`activityId`, `activityType: \"shelf\""],
  ["DynaDrop shelf model tests", "`npm run test:shelf-state`"],
  ["DynaDrop invalid model tests", "`npm run test:shelf-state-invalid-input`"],
  ["DynaDrop invalid fixture command", "npm run dynadrop:invalid-input-fixture"],
  ["DynaDrop invalid fixture non-zero", "intentionally feeds a blank dropped file path through the shelf recovery API"],
  ["DynaDrop invalid fixture test", "npm run test:dynadrop-invalid-input-fixture"],
  ["DynaDrop deferred native drag capture", "Deferred: native drag-to-island capture"],
  ["DynaDrop no implied drag UI", "UI that implies dragging already works"],
  ["DynaDrop deferred Finder open", "Finder reveal/open execution are deferred"],
  ["DynaDrop reveal no action contract", "Ready reveal status is intentionally not an action contract"],
  ["DynaDrop no safe app-mode Finder pattern", "no safe app-mode Finder file reveal/open pattern"],
  ["Activity Router section", "## Activity Router MVP"],
  ["Activity Router implementation boundary", "pure/testable JavaScript in `src/activity-router.js` rather than native event capture"],
  ["Activity Router DynaKeys priority", "DynaKeys-style transient volume/brightness HUD statuses"],
  ["Activity Router DynaClip priority", "DynaClip-style clipboard activity from the current local clipboard classification"],
  ["Activity Router DynaDrop priority", "DynaDrop/Shelf-style local shelf/drop status with optional `revealReadyPath` metadata"],
  ["Activity Router timer priority", "Local Timer status"],
  ["Activity Router media priority", "Now Playing media status"],
  ["Activity Router passive priority", "Battery and future passive activities"],
  ["Activity Router deterministic ties", "higher priority wins, then newer `updatedAt`, older `createdAt`, and stable `activityId`"],
  ["Activity Router transient expiry", "Transient activities with an expired `expiresAt` are removed from compact eligibility"],
  ["Activity Router payload shape", "generated Mac activity payload includes an `activityRouter` object with `rankedActivities` and the selected `compactSurface`"],
  ["Activity Router README validation", "Run `npm run check-readme` to validate that this README keeps documenting the Activity Router section"],
  ["Activity Router drag boundary", "DynaDrop/Shelf does not claim native drag capture or Finder reveal/open execution"],
  ["Activity Router no implied Finder actions", "must not imply drag-and-drop, Finder reveal, or file open works"],
  ["DynaKeys HUD section", "### DynaKeys Volume/Brightness HUD Core Model"],
  ["DynaKeys HUD implementation", "first DynaKeys volume/brightness HUD slice as deterministic pure logic"],
  ["DynaKeys volume compact behavior", "volume changes render a `speaker.wave.2` or muted-speaker compact surface with a percentage label/progress"],
  ["DynaKeys brightness compact behavior", "brightness changes render a `sun.max` compact surface with a percentage label/progress"],
  ["DynaKeys HUD tests", "`npm run test:volume-hud-status`, `npm run test:brightness-hud-status`, `npm run test:hud-event-store`, and the Mac activity integration/restart replay checks in `npm run test:mac-activity-status`"],
  ["DynaKeys app-mode replay store", "`npm run native:start` defaults the local HUD replay store to `.build/hud-events.json`"],
  ["DynaKeys README validation", "Run `npm run check-readme` to validate that this README keeps documenting the DynaKeys HUD section"],
  ["DynaKeys deferred native capture", "Deferred: native global volume-key capture, brightness-key capture, global shortcut/action launchers, and direct compact-overlay rendering of these HUDs are not enabled by this slice"],
  ["DynaClip section", "### DynaClip Clipboard Activity Core Model"],
  ["DynaClip implementation", "first DynaClip clipboard activity slice as deterministic local plain-text classification and status serialization"],
  ["DynaClip classification", "classifies recent copied content as text, link, path, code, or empty"],
  ["DynaClip compact copied HUD", "recent copied plain text shows a compact `Copied` HUD with the classification glyph and a sanitized preview"],
  ["DynaClip expanded preview", "expanded state shows a bounded preview with character count/classification details"],
  ["DynaClip non-persistence", "clipboard text is not written to persistent history across restarts"],
  ["DynaClip runnable tests", "`npm run test:clipboard-activity`, `npm run test:clipboard-activity-store`, `npm run test:clipboard-preview-ui`, `npm run test:clipboard-duplicate-filter`, and `npm run test:mac-activity-status`"],
  ["DynaClip README validation", "Run `npm run check-readme` to validate that this README keeps documenting the DynaClip section"],
  ["DynaClip deferred boundaries", "Deferred: clipboard history, cross-restart clipboard persistence, Finder companion workflows, file shelf handoff, paste automation, and quick handoff actions are not implemented by this slice"],
  ["DynamicLake priority checklist section", "## DynamicLake Priority Checklist"],
  ["DynamicLake checklist separation statement", "The implemented checklist and deferred native macOS checklist are intentionally separate"],
  ["DynamicLake implemented checklist heading", "#### Implemented behavior"],
  ["DynamicLake deferred checklist heading", "#### Deferred native macOS pieces"],
  ["DynamicLake checklist runnable test", "Run `npm run check-readme` and `npm run test:check-readme-script` to verify this checklist keeps implemented behavior and deferred native macOS pieces in distinct sections"]
];

const implementedChecklistSnippets = [
  ["implemented Activity Router checklist", "Activity Router compact selection and rankedActivities"],
  ["implemented DynaKeys checklist", "DynaKeys local volume/brightness HUD status models and HUD event replay store"],
  ["implemented DynaClip checklist", "DynaClip transient clipboard classification/copied HUD/expanded preview"],
  ["implemented DynaDrop checklist", "DynaDrop/Shelf local reveal-ready metadata model and invalid-input recovery"]
];

const deferredChecklistSnippets = [
  ["deferred native DynaKeys checklist", "Native volume/brightness key capture and global observers"],
  ["deferred native DynaDrop checklist", "Native drag-to-island capture and Finder reveal/open execution"],
  ["deferred native DynaClip checklist", "Clipboard history/paste automation/file handoff"]
];

function containsCurlPipeToShellInstall(content) {
  return /curl\b[^\n|]*\|\s*(?:sh|bash)\b/.test(content);
}

const missing = requiredSnippets.filter(([, snippet]) => !readme.includes(snippet));

const implementedChecklistSection = getMarkdownSection("#### Implemented behavior");
const deferredChecklistSection = getMarkdownSection("#### Deferred native macOS pieces");

for (const [label, snippet] of implementedChecklistSnippets) {
  if (!implementedChecklistSection.includes(snippet)) {
    missing.push([label, `${snippet} in the Implemented behavior checklist section`]);
  }
}

for (const [label, snippet] of deferredChecklistSnippets) {
  if (!deferredChecklistSection.includes(snippet)) {
    missing.push([label, `${snippet} in the Deferred native macOS pieces checklist section`]);
  }
}

const implementedSectionForbiddenSnippets = [
  "Native volume/brightness key capture and global observers",
  "Native drag-to-island capture and Finder reveal/open execution",
  "Clipboard history/paste automation/file handoff",
  "Deferred:"
];

for (const snippet of implementedSectionForbiddenSnippets) {
  if (implementedChecklistSection.includes(snippet)) {
    missing.push([
      "DynamicLake checklist separation",
      `implemented checklist section must not contain deferred native macOS text: ${snippet}`
    ]);
  }
}

const deferredSectionForbiddenSnippets = [
  "Activity Router compact selection and rankedActivities are implemented",
  "DynaKeys local volume/brightness HUD status models and HUD event replay store are implemented",
  "DynaClip transient clipboard classification/copied HUD/expanded preview is implemented",
  "DynaDrop/Shelf local reveal-ready metadata model and invalid-input recovery are implemented"
];

for (const snippet of deferredSectionForbiddenSnippets) {
  if (deferredChecklistSection.includes(snippet)) {
    missing.push([
      "DynamicLake checklist separation",
      `deferred native macOS checklist section must not contain implemented behavior text: ${snippet}`
    ]);
  }
}

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
