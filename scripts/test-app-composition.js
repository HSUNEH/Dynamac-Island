#!/usr/bin/env node

const assert = require("node:assert");
const path = require("node:path");
const { createAppComposition, createDynamacIslandWindow } = require("../src/app-composition");
const { renderPillView } = require("../src/pill-view");

const preloadPath = path.resolve("src/preload.js");
const indexPath = path.resolve("src/index.html");
const composition = createAppComposition({ preloadPath, indexPath });

assert.equal(composition.assets.preloadPath, preloadPath, "composition should expose the preload asset");
assert.equal(composition.assets.indexPath, indexPath, "composition should expose the HTML asset");
assert.equal(composition.windowOptions.frame, false, "composition should create a borderless floating window");
assert.equal(composition.windowOptions.transparent, true, "composition should create a transparent floating window");
assert.equal(composition.windowOptions.alwaysOnTop, true, "composition should create an always-on-top window");
assert.equal(composition.windowOptions.skipTaskbar, true, "composition should keep the island out of the taskbar");
assert.equal(composition.windowOptions.webPreferences.preload, preloadPath);
assert.equal(composition.contentRoot.view, "dynamac-pill", "content root should identify the pill view");
assert.equal(composition.contentRoot.shellClass, "island", "content root should use the island shell");
assert.equal(composition.contentRoot.html, renderPillView(), "content root should render the pill view");
assert.match(
  composition.contentRoot.html,
  /<main class="island" aria-live="polite" data-view="dynamac-pill" data-mode="collapsed">/,
  "content root should be the pill main element"
);

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

const appWindow = createDynamacIslandWindow(FakeBrowserWindow, { preloadPath, indexPath });

assert.equal(appWindow.window.options.frame, false, "app window should be borderless");
assert.equal(appWindow.window.options.transparent, true, "app window should be transparent");
assert.equal(appWindow.composition.contentRoot.view, "dynamac-pill");
assert.deepEqual(calls, [
  ["constructor", composition.windowOptions],
  ["setVisibleOnAllWorkspaces", true, { visibleOnFullScreen: true }],
  ["loadFile", indexPath]
]);

console.log("App composition test passed.");
