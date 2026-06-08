#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { PILL_VIEW_SPEC, renderPillView, createModeController } = require("../src/pill-view");

const html = renderPillView();

assert.match(html, /data-mode="collapsed"/, "island should render collapsed by default");
assert.match(html, /id="mode-toggle"/, "island should include a compact\/expanded toggle control");
assert.match(html, /aria-expanded="false"/, "toggle should advertise collapsed state by default");
assert.match(html, /id="compact-primary"/, "collapsed mode should include a primary compact label");
assert.match(html, /id="compact-meta"/, "collapsed mode should include compact metadata");
assert.equal(PILL_VIEW_SPEC.collapsedWidthPx, 286, "collapsed island should be much smaller than the expanded card");
assert.equal(PILL_VIEW_SPEC.collapsedHeightPx, 52, "collapsed island should stay close to the notch height");
assert.equal(PILL_VIEW_SPEC.expandedWidthPx, 496, "expanded island should preserve the existing detail width");

const shell = {
  dataset: { mode: "collapsed" },
  setAttribute(name, value) {
    this[name] = value;
  }
};
let textContentMutationCount = 0;
const toggle = {
  get textContent() {
    return "keep compact children";
  },
  set textContent(_value) {
    textContentMutationCount += 1;
  },
  title: "",
  listeners: {},
  setAttribute(name, value) {
    this[name] = value;
  },
  addEventListener(eventName, callback) {
    this.listeners[eventName] = callback;
  }
};

const modeChanges = [];
const controller = createModeController({ shell, toggle, onModeChange: (mode) => modeChanges.push(mode) });
assert.equal(controller.getMode(), "collapsed");
assert.equal(toggle["aria-expanded"], "false");
assert.equal(toggle.title, "Expand island");
assert.equal(toggle.textContent, "keep compact children", "mode controller should not replace compact child markup text");
assert.equal(textContentMutationCount, 0, "mode controller should not assign textContent during mount");

toggle.listeners.click();
assert.equal(controller.getMode(), "expanded", "click should expand the island");
assert.equal(shell.dataset.mode, "expanded");
assert.equal(toggle["aria-expanded"], "true");
assert.equal(toggle.title, "Collapse island");
assert.equal(modeChanges.at(-1), "expanded", "mode controller should notify the Electron shell when expanding");
assert.equal(toggle.textContent, "keep compact children", "expanding should preserve compact child elements");
assert.equal(textContentMutationCount, 0, "expanding should not assign textContent");

toggle.listeners.click();
assert.equal(controller.getMode(), "collapsed", "second click should collapse the island");
assert.equal(shell.dataset.mode, "collapsed");
assert.equal(toggle["aria-expanded"], "false");
assert.equal(modeChanges.at(-1), "collapsed", "mode controller should notify the Electron shell when collapsing");
assert.equal(toggle.textContent, "keep compact children", "collapsing should preserve compact child elements");
assert.equal(textContentMutationCount, 0, "collapsing should not assign textContent");

const styles = fs.readFileSync(path.resolve("src/styles.css"), "utf8");
assert.match(styles, /\.island\[data-mode="collapsed"\]/, "CSS should define a collapsed island mode");
assert.match(styles, /\.island\[data-mode="collapsed"\][\s\S]*width:\s*var\(--island-collapsed-width\)/, "collapsed island should use the compact width token");
assert.match(styles, /\.island\[data-mode="collapsed"\] \.status-grid[\s\S]*display:\s*none/, "collapsed island should hide the detail grid");
assert.match(styles, /\.island\[data-mode="expanded"\]/, "CSS should define an expanded island mode");
assert.match(
  styles,
  /\.island\[data-mode="expanded"\] \.status-grid\s*\{[^}]*display:\s*grid/,
  "expanded island should preserve the detailed status grid layout"
);

console.log("Island mode test passed.");
