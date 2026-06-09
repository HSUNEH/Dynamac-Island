#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const sourcePath = path.resolve("native/DynamacIslandNative.swift");
const source = fs.readFileSync(sourcePath, "utf8");

assert.match(source, /NSPanel\(/, "native overlay should use NSPanel instead of an Electron BrowserWindow");
assert.match(source, /styleMask:\s*\[\.borderless, \.nonactivatingPanel\]/, "native panel should be borderless and non-activating");
assert.match(source, /panel\.level\s*=\s*\.screenSaver/, "native panel should use a high overlay level");
assert.match(source, /collectionBehavior\s*=\s*\[[^\]]*\.canJoinAllSpaces[^\]]*\.fullScreenAuxiliary/s, "native panel should join spaces and fullscreen auxiliary contexts");
assert.match(source, /screen\.frame\.maxY - size\.height/, "native overlay should position against NSScreen.frame, not visibleFrame/workArea");
assert.doesNotMatch(source, /visibleFrame\.maxY - size\.height/, "native overlay must not anchor to visibleFrame because that starts below the menu bar");
assert.match(source, /DYNAMAC_NATIVE_SMOKE_TEST/, "native overlay should expose a smoke-test readiness path");
assert.match(source, /notchCutoutWidth/, "compact native overlay should reserve a transparent center cutout for the hardware notch");
assert.match(source, /auxiliaryTopLeftArea/, "native overlay should read macOS notch-adjacent auxiliary areas when available");
assert.match(source, /auxiliaryTopRightArea/, "native overlay should read macOS notch-adjacent auxiliary areas when available");
assert.match(source, /DYNAMAC_NATIVE_DIAG/, "native overlay should expose diagnostic output for real MacBook notch sizing");
assert.match(source, /leftWingRect/, "compact native overlay should draw a left wing beside the notch");
assert.match(source, /rightWingRect/, "compact native overlay should draw a right wing beside the notch");
assert.match(source, /drawCompactNotchWings/, "compact native overlay should draw notch-adjacent wings instead of one centered pill");
assert.match(source, /The center is intentionally transparent/, "compact native overlay should document why the notch center is not painted");
assert.doesNotMatch(source, /let size = NSSize\(width: 286, height: 58\)/, "compact native overlay must not use a single centered pill that covers the notch");
assert.match(source, /override func mouseDown/, "native overlay should provide a direct compact\/expanded toggle interaction");
assert.match(source, /toggleExpanded\(\)/, "native overlay should expose a toggle path for expansion");
assert.match(source, /panel\.setFrame\(topCenteredRect\(screen: screen, size: size\), display: true, animate: true\)/, "native overlay should resize and re-anchor the panel when the mode changes");

console.log("Native overlay contract test passed.");
