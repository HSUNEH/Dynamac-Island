#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const sourcePath = path.resolve("native/DynamacIslandNative.swift");
const source = fs.readFileSync(sourcePath, "utf8");

assert.match(source, /NSPanel\(/, "native overlay should use NSPanel instead of an Electron BrowserWindow");
assert.match(source, /styleMask:\s*\[\.borderless, \.nonactivatingPanel\]/, "native panel should be borderless and non-activating");
assert.match(source, /panel\.level\s*=\s*\.screenSaver/, "native panel should use a high overlay level");
assert.match(source, /collectionBehavior\s*=\s*\[[^\]]*\.fullScreenAuxiliary[^\]]*\.ignoresCycle/s, "native panel should support fullscreen auxiliary contexts without pinning across every Space");
assert.doesNotMatch(source, /collectionBehavior\s*=\s*\[[^\]]*\.canJoinAllSpaces/s, "native panel should not use canJoinAllSpaces because it appears pinned during Space transitions");
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

assert.match(source, /drawUprightImage/, "album artwork should be drawn through an upright image path so flipped NSView coordinates do not invert covers");
assert.match(source, /respectFlipped: false/, "album artwork drawing should explicitly avoid AppKit flipped-coordinate inversion");
assert.match(source, /drawTransportIcon/, "transport buttons should use drawn vector icons instead of SF glyphs that can render as question marks");
assert.doesNotMatch(source, /􀊊|􀊆|􀊄|􀊌/, "transport buttons must not depend on private SF symbol glyph characters");
assert.match(source, /displayPositionSeconds/, "expanded mode should locally advance play time between status refreshes");
assert.match(source, /startDisplayRefresh/, "native overlay should redraw frequently enough for smooth play time and compact animations");
assert.match(source, /DYNAMAC_DISPLAY_REFRESH_MS/, "native overlay should allow tuning the display refresh interval");
assert.match(source, /drawPlayingBars/, "compact mode should show a right-side playing animation");
assert.match(source, /drawPlayingWaveform/, "compact playing animation should render as a waveform, not a basic bar meter");
assert.match(source, /rightWingRect\(in: bounds\)/, "compact playing animation should live in the right notch wing");
assert.match(source, /compactPlayingBarsRect/, "compact playing animation should use a dedicated safe rect inside the visible right wing");
assert.match(source, /visibleRightWingX = compactLayout\.wingWidth \+ compactLayout\.notchCutoutWidth/, "compact playing bars should avoid the notch-overlap area that clips their left edge");
assert.match(source, /DYNAMAC_PLAYING_BARS_SENSITIVITY/, "compact playing bars should expose a sensitivity knob for tuning animation intensity");
assert.match(source, /compactSinglePillPlayingBarsRect/, "non-notch single-pill compact mode should also show the playing animation");
assert.match(source, /External\/non-notch displays use one centered pill/, "single-pill playing animation should document external display behavior");
assert.match(source, /external display is main/, "single-pill waveform should explicitly protect the external-main-display case");
assert.match(source, /bounds\.maxX - horizontalInset - width/, "single-pill playing animation should live at the trailing end of the pill");
assert.match(source, /let width = min\(54, max\(34, bounds\.width - 62\)\)/, "single-pill waveform should be wide enough to remain visible on external displays");
assert.match(source, /sampleCount = max\(5, min\(9, Int\(rect\.width \/ 5\)\)\)/, "waveform should use multiple samples instead of four fixed bars");
assert.match(source, /NSColor\.white\.withAlphaComponent/, "compact waveform should be white-only without green or mint color accents");
assert.doesNotMatch(source, /NSColor\.systemGreen|NSColor\.systemMint/, "compact waveform should not use colored green\/mint bars");
assert.match(source, /Date\(\)\.timeIntervalSince1970 \* 8\.5/, "compact waveform should animate at a calmer waveform cadence");

assert.match(source, /Apple-inspired media sheet/, "expanded Now Playing should follow an Apple-inspired quiet media sheet layout");
assert.match(source, /expandedCoverRect/, "expanded layout should use a named cover rect instead of scattered magic values");
assert.match(source, /expandedTextAttributes/, "expanded layout should centralize SF-style typography attributes");
assert.match(source, /rightAlignedAttributes/, "expanded layout should separate elapsed and duration labels around the scrubber");
assert.match(source, /knobSize: CGFloat = 9/, "scrubber should render a small thumb so users can see it is draggable");
assert.match(source, /progressBarRect\(\)\.insetBy\(dx: -6, dy: -18\)/, "scrubber should keep a large invisible hit target around the thin visual track");
assert.match(source, /normalizedInteractionPoint/, "scrubber should normalize event coordinates so click and drag work reliably in flipped views");

assert.match(source, /onMediaSeek/, "expanded progress bar should expose media seek callbacks");
assert.match(source, /mouseDragged/, "expanded progress bar should support dragging to seek");
assert.match(source, /mediaSeekSecond/, "expanded progress bar clicks should map x-position to playback seconds");
assert.match(source, /performMediaSeek/, "native overlay should wire progress seeking to Spotify, Music, and YouTube");
assert.match(source, /performYouTubeJavaScript/, "native overlay should control YouTube playback through browser JavaScript best-effort");
assert.match(source, /chromiumYouTubeScript/, "native overlay should scan Chromium browser tabs for YouTube control targets");

assert.match(source, /contentOpacity/, "native overlay should separate content opacity from shell animation");
assert.match(source, /drawContentWithOpacity/, "native overlay should gate expensive media content drawing during transitions");
assert.match(source, /guard contentOpacity > 0\.01 else \{ return \}/, "native overlay should skip drawing media content while the resize animation is running");
assert.match(source, /fadeContent\(in:/, "native overlay should fade media content back in after the shell reaches its target frame");
assert.match(source, /Media surfaces can be expensive to draw/, "native overlay should document why media content is hidden during transitions");

assert.match(source, /applyOptimisticMediaControl/, "media controls should update playback state optimistically so animations react immediately");
assert.match(source, /applyOptimisticSeek/, "media seek should update local progress optimistically before provider status catches up");
assert.match(source, /scheduleFastStatusReloadBurst/, "media controls should schedule a short reload burst after provider commands");
assert.match(source, /DYNAMAC_STATUS_RELOAD_MS\"\] \?\? \"250\"/, "native status reload should default to a low-latency 250ms cadence");

assert.match(source, /scheduleAutoCollapse/, "expanded mode should auto-collapse back to compact mode after a timeout");
assert.match(source, /DYNAMAC_EXPANDED_AUTO_COLLAPSE_SECONDS\"\] \?\? \"7\"/, "expanded auto-collapse should default to 7 seconds and be tunable");
assert.match(source, /autoCollapseTimer\?\.invalidate\(\)/, "manual toggles should cancel any pending auto-collapse timer");

console.log("Native overlay contract test passed.");
