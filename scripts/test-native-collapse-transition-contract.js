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

console.log("Native collapse transition contract test passed.");
