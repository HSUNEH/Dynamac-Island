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
  ["MVP identity", "local Electron MVP"],
  ["macOS-testable scope", "macOS-testable floating status pill"],
  ["MacBook project path", "cd ~/projects/dynamac-island"],
  ["mock agents", "mock Snuffles, Codex, and Ouroboros job states"],
  ["watched status source", "Status source: `status/status.json`"],
  ["required fields", "`agent`, `state`, `task`, `updatedAt`, and `detail`"],
  ["allowed states", "`idle`, `running`, `success`, `warning`, `error`"],
  ["invalid input behavior", "Invalid JSON or invalid status fields are visible in the app as an error state"],
  ["small scope boundary", "No credentials, network services, HTTP endpoint, deployment, or external side effects"],
  ["install command", "npm install"],
  ["launch command", "npm start"],
  ["MacBook smoke test heading", "## MacBook Smoke Test"],
  ["MacBook smoke test intro", "Run these checks on the target MacBook after `npm install`:"],
  ["MacBook smoke test launch path", "Run `npm start` from `~/projects/dynamac-island`"],
  ["floating pill verification", "Confirm a small floating black pill appears near the top of the screen"],
  ["agent state verification", "Confirm the pill lists Snuffles, Codex, and Ouroboros mock job states"],
  ["watched file verification", "Edit `status/status.json` and confirm the app updates without relaunching"],
  ["invalid JSON launch verification", "Put invalid JSON in `status/status.json` and confirm the pill shows an error state"],
  ["valid JSON restore step", "Restore valid JSON by copying the fixture back into the watched file"],
  ["README validation test description", "Run the README content validation test"],
  ["README validation coverage", "This test is runnable and fails if the README stops documenting"],
  ["manual update verification heading", "## Manual Update Verification"],
  [
    "manual update verification purpose",
    "Use this exact path when headless UI automation cannot prove that the live island updates on screen"
  ],
  ["manual update terminal 1 step", "Terminal 1: launch the app from the project directory"],
  [
    "manual update initial observation",
    "Confirm the floating pill is visible and initially lists Snuffles, Codex, and Ouroboros."
  ],
  [
    "manual update terminal 2 step",
    "Terminal 2: replace the watched status file with a deterministic warning update"
  ],
  [
    "manual update visible changed task",
    "Observe the running app without relaunching and confirm the pill now shows `Manual watcher check`"
  ],
  [
    "manual update visible changed detail",
    "`Codex warning proves the renderer received the edited JSON.`"
  ],
  ["manual invalid JSON step", "Terminal 2: write malformed JSON to the watched file"],
  [
    "manual invalid JSON observation",
    "Observe the running app without relaunching and confirm the pill shows an error state for the invalid status input."
  ],
  ["manual restore fixture step", "Terminal 2: restore the valid fixture"],
  [
    "manual restore observation",
    "Observe the running app without relaunching and confirm Snuffles, Codex, and Ouroboros return to their valid mock states."
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

if (!hasShellCommandAfterHeading("## MacBook Smoke Test", "cp fixtures/valid-status.json status/status.json")) {
  missing.push([
    "smoke test restore command block",
    "cp fixtures/valid-status.json status/status.json in a MacBook Smoke Test shell code block"
  ]);
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

const manualUpdateSection = getSection("## Manual Update Verification");
const manualShellBlocks = manualUpdateSection.match(/```(?:sh|bash)?\n[\s\S]*?\n```/g) || [];

if (!manualShellBlocks.some((block) => block.includes("Manual watcher check"))) {
  missing.push([
    "manual deterministic update command",
    "a Manual Update Verification shell command that writes Manual watcher check to status/status.json"
  ]);
}

if (!hasShellCommandAfterHeading("## Manual Update Verification", "printf '{ \"statuses\": [\\n' > status/status.json")) {
  missing.push([
    "manual malformed JSON command block",
    "printf '{ \"statuses\": [\\n' > status/status.json in a Manual Update Verification shell code block"
  ]);
}

if (!hasShellCommandAfterHeading("## Manual Update Verification", "cp fixtures/valid-status.json status/status.json")) {
  missing.push([
    "manual restore command block",
    "cp fixtures/valid-status.json status/status.json in a Manual Update Verification shell code block"
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
