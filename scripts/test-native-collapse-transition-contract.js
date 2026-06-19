#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.resolve("native/DynamacIslandNative.swift"), "utf8");

assert.match(source, /private func topCenteredRect\(screen: NSScreen, size: NSSize\) -> NSRect/, "native overlay must keep a single top-centered frame primitive");
assert.match(source, /let size = shouldExpand \? NSSize\(width: 520, height: 210\) : compactLayout\.totalSize[\s\S]*let targetFrame = topCenteredRect\(screen: screen, size: size\)/, "expand and collapse should share topCenteredRect target calculation");
assert.match(source, /panel\.animator\(\)\.setFrame\(targetFrame, display: true\)/, "transition should animate directly to the computed top-centered target frame");
assert.match(source, /panel\.setFrame\(targetFrame, display: true\)/, "transition completion should snap exactly to the top-centered target frame");
assert.doesNotMatch(source, /lowerLeft|bottomLeft|detachedAnchor|wrongAnchor/i, "collapse contract must not introduce lower-left or detached anchor primitives");
assert.match(source, /if shouldExpand && islandView\.expandedTargetActivityForSmoke\(\) == "none" \{ return \}/, "compact-only Battery targets should not expand into a persistent Battery surface");

assert.match(source, /let transitionDuration: TimeInterval = shouldExpand \? 0\.32 : 0\.26/, "expand should be slightly slower than collapse so the island grows without snapping");
assert.match(source, /let fadeDuration: TimeInterval = shouldExpand \? 0\.16 : 0\.10/, "content fade should be decoupled from frame resize and tuned per direction");
assert.match(source, /CAMediaTimingFunction\(controlPoints: 0\.18, 0\.82, 0\.22, 1\.0\)/, "expand should use an ease-out timing curve that settles naturally");
assert.match(source, /CAMediaTimingFunction\(controlPoints: 0\.30, 0\.0, 0\.20, 1\.0\)/, "collapse should use a bounded curve instead of the old abrupt shared curve");
assert.match(source, /self\.fadeContent\(in: islandView, duration: fadeDuration\)/, "content fade should use the transition-specific fade duration");
assert.match(source, /private func fadeContent\(in view: IslandView\?, duration: TimeInterval = 0\.12\)/, "fade helper should expose duration tuning for smoother expand/collapse handoff");

console.log("Native collapse transition contract test passed.");
