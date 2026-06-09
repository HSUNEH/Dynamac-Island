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
  { x: 613, y: 0 },
  "Electron preview should request the physical top edge without inventing out-of-bounds coordinates; native NSPanel owns true notch overlay placement"
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
  calls.some((call) => call[0] === "setPosition" && call[1] === 613 && call[2] === 0),
  "created Electron preview window should request top-center placement without moving outside display bounds"
);

assert.deepEqual(
  calculateNotchAnchoredPosition(
    { bounds: { x: 0, y: 0, width: 1512, height: 982 }, workArea: { x: 0, y: 0, width: 1512, height: 982 } },
    windowOptions
  ),
  { x: 613, y: 0 },
  "displays without a menu-bar work-area offset should not receive a negative y compensation"
);

console.log("Notch positioning test passed.");
