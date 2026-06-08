#!/usr/bin/env node

const assert = require("node:assert");
const {
  calculateNotchAnchoredPosition,
  buildWindowOptions,
  createIslandWindow
} = require("../src/window-config");

const display = {
  bounds: { x: 0, y: 0, width: 1512, height: 982 },
  workArea: { x: 0, y: 38, width: 1512, height: 944 }
};

const windowOptions = buildWindowOptions("/tmp/preload.js");
const position = calculateNotchAnchoredPosition(display, windowOptions);

assert.deepEqual(
  position,
  { x: 496, y: 0 },
  "island should be horizontally centered and pinned to the physical top edge near the notch, not placed like a normal app window"
);

const calls = [];
class FakeBrowserWindow {
  constructor(options) {
    this.options = options;
  }

  setVisibleOnAllWorkspaces(visible, settings) {
    calls.push(["setVisibleOnAllWorkspaces", visible, settings]);
  }

  setAlwaysOnTop(flag, level) {
    calls.push(["setAlwaysOnTop", flag, level]);
  }

  setPosition(x, y) {
    calls.push(["setPosition", x, y]);
  }

  loadFile(filePath) {
    calls.push(["loadFile", filePath]);
  }
}

const fakeScreen = {
  getPrimaryDisplay() {
    return display;
  }
};

createIslandWindow(FakeBrowserWindow, {
  preloadPath: "/tmp/preload.js",
  indexPath: "/tmp/index.html",
  screen: fakeScreen
});

assert.ok(
  calls.some((call) => call[0] === "setAlwaysOnTop" && call[1] === true && call[2] === "screen-saver"),
  "island should use a high always-on-top level suitable for a notch overlay"
);
assert.ok(
  calls.some((call) => call[0] === "setPosition" && call[1] === 496 && call[2] === 0),
  "created island window should be moved to the notch-anchored position"
);

console.log("Notch positioning test passed.");
