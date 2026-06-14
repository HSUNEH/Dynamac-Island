#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");

const readme = fs.readFileSync("README.md", "utf8");

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

function assertIncludes(section, label, snippet) {
  assert.ok(section.includes(snippet), `Timer MVP docs must cover ${label}: ${snippet}`);
}

const section = getSection("## Timer MVP Behavior");

assert.notEqual(section, "", "README must include a Timer MVP Behavior section");

assertIncludes(section, "start command", "npm run timer:start -- 5m --status status/status.json");
assertIncludes(section, "single active timer", "single-active-timer live activity");
assertIncludes(section, "running state", "state: \"running\"");
assertIncludes(section, "running overlay copy", "Timer · 4m 30s remaining");
assertIncludes(section, "completion state", "state becomes `done`");
assertIncludes(section, "zero remaining completion", "remainingSeconds` becomes `0`");
assertIncludes(section, "local watched status file", "local watched status file");
assertIncludes(section, "native status model", "existing status model");
assertIncludes(section, "local-first persistence", "represented only by local files/status payloads");
assertIncludes(section, "deferred non-goals", "no notification/sound requirement");

const replacementSection = getSection("### Timer Replacement Semantics");

assert.notEqual(replacementSection, "", "README must include a Timer Replacement Semantics section");
assertIncludes(replacementSection, "single active timer", "single-active-timer only");
assertIncludes(replacementSection, "active timer replacement", "Starting a new timer while another timer is active replaces the previous active timer deterministically");
assertIncludes(replacementSection, "only one Timer status", "the new timer becomes the only `Timer` status item");
assertIncludes(replacementSection, "active replacement metadata", "replacedPrevious: true");
assertIncludes(replacementSection, "completed timer replacement", "Starting a new timer after a completed `done` timer also replaces that completed status");
assertIncludes(replacementSection, "completed timer no duplicate", "the completed timer is no longer shown as a second timer");

console.log("Timer MVP documentation assertion passed.");
