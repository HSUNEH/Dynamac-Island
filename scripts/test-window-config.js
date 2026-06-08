#!/usr/bin/env node

const assert = require("node:assert");
const path = require("node:path");
const { buildWindowOptions, createIslandWindow } = require("../src/window-config");

const preloadPath = path.resolve("src/preload.js");
const indexPath = path.resolve("src/index.html");
const windowOptions = buildWindowOptions(preloadPath);

assert.equal(windowOptions.width, 520, "window width should match the MVP pill layout");
assert.equal(windowOptions.height, 210, "window height should match the MVP pill layout");
assert.equal(windowOptions.frame, false, "window should be borderless");
assert.equal(windowOptions.transparent, true, "window should allow the pill shape to float visually");
assert.equal(windowOptions.resizable, false, "window should keep a stable island shape");
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

console.log("Window configuration test passed.");
