#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { PILL_VIEW_SPEC, renderPillView, mountPillView } = require("../src/pill-view");

const html = renderPillView();

assert.match(html, /<main class="island"/, "pill shell should render the island class");
assert.match(html, /aria-live="polite"/, "pill shell should announce status changes politely");
assert.match(html, /data-view="dynamac-pill"/, "pill shell should expose a stable view marker");
assert.match(html, /data-mode="collapsed"/, "pill shell should start as a notch-attached collapsed capsule");
assert.match(html, /<header class="island-header">/, "pill shell should render the island header");
assert.match(html, /id="mode-toggle"/, "pill shell should include the collapsed\/expanded toggle");
assert.match(html, /id="compact-primary"/, "pill shell should include the compact primary label");
assert.match(html, /id="compact-meta"/, "pill shell should include compact metadata");
assert.match(html, /id="summary"/, "pill shell should include the summary target");
assert.match(html, /id="content" class="status-grid"/, "pill shell should include the status grid target");
assert.match(html, /id="source" class="source"/, "pill shell should include the status source target");
assert.match(html, /id="reload"/, "pill shell should include the reload control");
assert.match(html, /type="button"/, "reload control should not submit forms");
assert.match(html, /Dynamac Island/, "pill shell should render the app label");

assert.equal(PILL_VIEW_SPEC.widthPx, 496, "pill width should match the expected compact island size");
assert.equal(PILL_VIEW_SPEC.minHeightPx, 152, "pill minimum height should match the expected island size");
assert.equal(PILL_VIEW_SPEC.collapsedWidthPx, 286, "collapsed pill width should match the MacBook notch capsule target");
assert.equal(PILL_VIEW_SPEC.collapsedHeightPx, 52, "collapsed pill height should stay close to the menu bar notch height");
assert.equal(PILL_VIEW_SPEC.expandedWidthPx, 496, "expanded pill width should preserve the detail layout");
assert.equal(PILL_VIEW_SPEC.borderRadiusPx, 42, "pill radius should create the rounded island shape");

const elements = new Map();
const fakeDocument = {
  body: {
    innerHTML: ""
  },
  querySelector(selector) {
    const id = selector.startsWith("#") ? selector.slice(1) : selector;
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        dataset: {},
        attributes: {},
        textContent: "",
        title: "",
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
        addEventListener() {}
      });
    }
    return elements.get(id);
  }
};

const mounted = mountPillView(fakeDocument);

assert.equal(fakeDocument.body.innerHTML, html, "mountPillView should render the pill into the body");
assert.equal(mounted.summary.id, PILL_VIEW_SPEC.summaryId);
assert.equal(mounted.compactPrimary.id, PILL_VIEW_SPEC.compactPrimaryId);
assert.equal(mounted.compactMeta.id, PILL_VIEW_SPEC.compactMetaId);
assert.equal(mounted.content.id, PILL_VIEW_SPEC.contentId);
assert.equal(mounted.source.id, PILL_VIEW_SPEC.sourceId);
assert.equal(mounted.reload.id, PILL_VIEW_SPEC.reloadId);
assert.equal(mounted.modeToggle.id, PILL_VIEW_SPEC.modeToggleId);
assert.equal(typeof mounted.modeController.getMode, "function");

const stylesPath = path.resolve("src/styles.css");
const styles = fs.readFileSync(stylesPath, "utf8");

assert.match(styles, /--island-collapsed-width:\s*286px;/, "CSS should define the notch capsule width");
assert.match(styles, /--island-collapsed-height:\s*52px;/, "CSS should define the notch capsule height");
assert.match(styles, /--island-expanded-width:\s*496px;/, "CSS should define the expanded detail width");
assert.match(styles, /--island-expanded-min-height:\s*152px;/, "CSS should define the expanded detail height");
assert.match(styles, /--island-radius:\s*42px;/, "CSS should define the expected pill radius");
assert.match(styles, /\.island\[data-mode="collapsed"\][\s\S]*width:\s*var\(--island-collapsed-width\)/, "collapsed pill should use the notch capsule width");
assert.match(styles, /border-radius:\s*var\(--island-radius\);/, "pill should use the rounded island radius");
assert.match(
  styles,
  /\.island\[data-mode="expanded"\][\s\S]*border-radius:\s*0 0 var\(--island-radius\) var\(--island-radius\);/,
  "expanded island should grow down from the notch/menu bar instead of rendering as a detached rounded card"
);
assert.match(styles, /background:\s*[\s\S]*#0a0a0b;/, "pill should use a dark floating-panel background");
assert.match(styles, /box-shadow:\s*[\s\S]*inset 0 1px 0 rgba\(255, 255, 255, 0\.1\);/, "pill should render floating depth");

console.log("Pill view test passed.");
