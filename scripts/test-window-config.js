#!/usr/bin/env node

const assert = require("node:assert");
const path = require("node:path");
const { buildWindowOptions, createIslandWindow, setWindowMode } = require("../src/window-config");

const preloadPath = path.resolve("src/preload.js");
const indexPath = path.resolve("src/index.html");
const windowOptions = buildWindowOptions(preloadPath);

assert.equal(windowOptions.width, 286, "window width should default to the notch-attached collapsed capsule");
assert.equal(windowOptions.height, 58, "window height should stay close to the menu bar notch height");
assert.equal(windowOptions.frame, false, "window should be borderless");
assert.equal(windowOptions.transparent, true, "window should allow the pill shape to float visually");
assert.equal(windowOptions.resizable, false, "window should keep a stable island shape");
assert.equal(windowOptions.movable, false, "window should stay attached to the notch instead of behaving like a normal movable app");
assert.equal(windowOptions.fullscreenable, false, "window should behave like a compact overlay, not a normal fullscreenable app");
assert.equal(windowOptions.alwaysOnTop, true, "window should float above normal app windows");
assert.equal(windowOptions.skipTaskbar, true, "window should not appear as a normal app taskbar item");
assert.equal(windowOptions.hasShadow, false, "window shadow is rendered by the app UI");
assert.equal(windowOptions.title, "Dynamac Island");
assert.deepEqual(windowOptions.webPreferences, {
  preload: preloadPath,
  contextIsolation: true,
  nodeIntegration: false
});

const calls = [];

class FakeBrowserWindow {
  constructor(options) {
    this.options = options;
    this.webContents = {
      once() {}
    };
    calls.push(["constructor", options]);
  }

  setVisibleOnAllWorkspaces(visible, settings) {
    calls.push(["setVisibleOnAllWorkspaces", visible, settings]);
  }

  loadFile(filePath) {
    calls.push(["loadFile", filePath]);
  }
}

const createdWindow = createIslandWindow(FakeBrowserWindow, { preloadPath, indexPath });

assert.equal(createdWindow.options.frame, false, "created window should use borderless options");
assert.equal(createdWindow.options.alwaysOnTop, true, "created window should be always on top");
assert.deepEqual(calls, [
  ["constructor", windowOptions],
  ["setVisibleOnAllWorkspaces", true, { visibleOnFullScreen: true }],
  ["loadFile", indexPath]
]);

const resizeCalls = [];
const modeWindow = {
  setSize(width, height) {
    resizeCalls.push(["setSize", width, height]);
  },
  setPosition(x, y) {
    resizeCalls.push(["setPosition", x, y]);
  }
};
const fakeScreen = {
  getPrimaryDisplay() {
    return { bounds: { x: 0, y: 0, width: 1512, height: 982 } };
  }
};

setWindowMode(modeWindow, fakeScreen, "expanded");
assert.deepEqual(
  resizeCalls,
  [
    ["setSize", 520, 210],
    ["setPosition", 496, 0]
  ],
  "expanded mode should resize the Electron surface and re-anchor it to the notch center"
);

console.log("Window configuration test passed.");
