#!/usr/bin/env node

const assert = require("node:assert");
const {
  CLIPBOARD_AGENT,
  createClipboardPreviewViewModel,
  isClipboardStatus,
  renderClipboardExpandedPreview
} = require("../src/clipboard-preview-ui");
const { buildClipboardStatusFromText, createClipboardActivityState } = require("../src/clipboard-activity");

const now = 1718323200000;
const copied = buildClipboardStatusFromText("https://example.com/a?b=1#frag", {
  now,
  observedAt: now,
  state: createClipboardActivityState({ lastSignature: "previous" }),
  source: "fixture-clipboard"
}).status;

assert.equal(isClipboardStatus(copied), true, "active copied text status should be detected as Clipboard UI input");
assert.equal(isClipboardStatus({ agent: "Other", state: "idle" }), false, "non-Clipboard statuses should not be rendered by the Clipboard module");

const copiedViewModel = createClipboardPreviewViewModel(copied);
const copiedHtml = renderClipboardExpandedPreview(copiedViewModel);

assert.equal(copiedViewModel.agent, CLIPBOARD_AGENT);
assert.equal(copiedViewModel.hasPlainTextPreview, true);
assert.equal(copiedViewModel.classification, "link");
assert.equal(copiedViewModel.preview, "example.com/a?b=1");
assert.equal(copiedViewModel.fallbackKind, "unavailable", "fallback kind stays inert when a plain-text preview exists");
assert.match(copiedHtml, /data-agent="clipboard"/, "Clipboard preview should render a stable component marker");
assert.match(copiedHtml, /data-clipboard-preview="text"/, "plain text payloads should render the preview body");
assert.match(copiedHtml, /example\.com\/a\?b=1/, "URL preview should use the deterministic sanitized link preview");
assert.doesNotMatch(copiedHtml, /https:\/\/example\.com\/a\?b=1#frag/, "expanded preview must not render raw URL hash noise");

const unsupportedStatus = {
  agent: "Clipboard",
  activityType: "futurePassive",
  state: "idle",
  task: "Clipboard idle",
  updatedAt: "2026-06-14T00:00:00.000Z",
  detail: "Clipboard read did not contain plain text.",
  metadata: {
    classification: "none",
    recentPlainTextChange: false
  },
  persisted: false
};
const unsupportedViewModel = createClipboardPreviewViewModel(unsupportedStatus);
const unsupportedHtml = renderClipboardExpandedPreview(unsupportedViewModel);

assert.equal(unsupportedViewModel.hasPlainTextPreview, false);
assert.equal(unsupportedViewModel.fallbackKind, "unsupported");
assert.equal(unsupportedViewModel.title, "Clipboard preview unavailable");
assert.equal(unsupportedViewModel.subtitle, "Unsupported clipboard payload");
assert.match(unsupportedHtml, /data-clipboard-fallback="unsupported"/, "unsupported pasteboard types should render an explicit fallback state");
assert.match(unsupportedHtml, /Clipboard read did not contain plain text\./, "unsupported fallback should explain why no preview rendered");
assert.doesNotMatch(unsupportedHtml, /data-clipboard-preview="text"/, "unsupported payloads should not pretend a text preview exists");

const unavailableStatus = {
  agent: "Clipboard",
  activityType: "futurePassive",
  state: "idle",
  task: "Clipboard idle",
  updatedAt: "2026-06-14T00:00:01.000Z",
  detail: "No text clipboard content was found.",
  metadata: {
    classification: "empty",
    recentPlainTextChange: false
  },
  persisted: false
};
const unavailableViewModel = createClipboardPreviewViewModel(unavailableStatus);
const unavailableHtml = renderClipboardExpandedPreview(unavailableViewModel);

assert.equal(unavailableViewModel.hasPlainTextPreview, false);
assert.equal(unavailableViewModel.fallbackKind, "unavailable");
assert.equal(unavailableViewModel.subtitle, "No recent text preview");
assert.match(unavailableHtml, /data-clipboard-fallback="unavailable"/, "empty or unavailable clipboard reads should render a separate fallback state");
assert.match(unavailableHtml, /No text clipboard content was found\./, "unavailable fallback should preserve the status detail");
assert.doesNotMatch(unavailableHtml, /<script|onerror=/i, "fallback component should render escaped inert markup only");

const escapedStatus = {
  ...unavailableStatus,
  detail: "<img src=x onerror=alert(1)>"
};
const escapedHtml = renderClipboardExpandedPreview(createClipboardPreviewViewModel(escapedStatus));
assert.match(escapedHtml, /&lt;img src=x onerror=alert\(1\)&gt;/, "fallback details should be HTML escaped");
assert.doesNotMatch(escapedHtml, /<img src=x/i, "raw unsupported fallback markup must not be injected");

console.log("Clipboard preview UI component test passed.");
