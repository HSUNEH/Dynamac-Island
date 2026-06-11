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
assert.match(source, /drawCompactNotchWings/, "notched MacBook display should draw notch-adjacent wings instead of one centered pill");
assert.match(source, /drawCompactSinglePill/, "non-notch displays should draw one normal compact pill instead of split wings");
assert.match(source, /usesHardwareNotchCutout/, "native overlay should switch layout based on detected hardware notch availability");
assert.match(source, /safeAreaInsets\.top > 0/, "native overlay should use NSScreen safe-area data to detect notched displays");
assert.match(source, /layout\.displayMode/, "native diagnostics should report notch-wings vs single-pill mode");
assert.match(source, /The center is intentionally transparent/, "compact native overlay should document why the notch center is not painted");
assert.match(source, /Non-notch displays have no hardware cutout/, "compact native overlay should document why regular displays use a single pill");
assert.doesNotMatch(source, /let size = NSSize\(width: 286, height: 58\)/, "compact native overlay must not use a single centered pill that covers the notch");
assert.match(source, /DYNAMAC_QA_NOTCH_SILHOUETTE/, "native overlay should offer a QA-only fake notch silhouette so screenshots can verify physical-notch spacing");
assert.match(source, /drawQaNotchSilhouette/, "native overlay should draw the QA notch guide only when requested");
assert.match(source, /notchCutoutRect\(in: bounds\)/, "QA notch guide should use the same measured cutout rect as the real transparent hardware gap");
assert.match(source, /without filling it/, "QA notch guide must not hide the real physical notch during camera-based calibration");
assert.match(source, /override func mouseDown/, "native overlay should provide a direct compact\/expanded toggle interaction");
assert.match(source, /toggleExpanded\(\)/, "native overlay should expose a toggle path for expansion");
assert.match(source, /let targetFrame = topCenteredRect\(screen: screen, size: size\)/, "native overlay should compute a centered target frame when the mode changes");
assert.match(source, /panel\.animator\(\)\.setFrame\(targetFrame, display: true\)/, "native overlay should resize and re-anchor the panel with the centered target frame when the mode changes");

assert.match(source, /startStatusRefresh/, "native overlay should reload status while running so Now Playing changes are reflected without relaunch");
assert.match(source, /DYNAMAC_START_EXPANDED/, "native overlay should expose an expanded-mode smoke path for UI QA");
assert.match(source, /DYNAMAC_STATUS_RELOAD_MS/, "native overlay should allow tuning the status reload interval");
assert.match(source, /drawCompactNowPlaying/, "compact notch mode should render a dedicated Now Playing surface");
assert.match(source, /artwork alone is the live activity/, "compact notch mode should show album art only, not title and artist text");
assert.match(source, /drawExpandedNowPlaying/, "expanded mode should render cover, metadata, play time, and controls");
assert.match(source, /drawMediaControls/, "expanded Now Playing mode should draw previous, play\/pause, and next controls");
assert.match(source, /performMediaControl/, "native overlay should wire media control buttons to playback actions");
assert.match(source, /artworkImage/, "native overlay should render album art or fall back to a music note");

console.log("Native overlay contract test passed.");
