#!/usr/bin/env node

const assert = require("node:assert");
const { validateStatusPayload } = require("../src/status-schema");
const {
  DEFAULT_RECENCY_MS,
  applyClipboardRead,
  buildClipboardCopiedHudActivity,
  buildClipboardStatusFromText,
  classifyClipboardText,
  createClipboardActivityState,
  textSignature
} = require("../src/clipboard-activity");

const now = 1718323200000;
const initial = createClipboardActivityState();
assert.deepEqual(initial, { lastSignature: "", active: null }, "clipboard activity state should start without persisted text/history");

const first = applyClipboardRead(initial, {
  plainText: "https://example.com/a",
  observedAt: now,
  source: "fixture-clipboard"
}, { now, recencyMs: DEFAULT_RECENCY_MS });
const firstSignature = textSignature("https://example.com/a");
const firstEventId = `clipboard-copy-${now}-${firstSignature.slice(0, 12)}`;

assert.equal(first.status.agent, "Clipboard");
assert.equal(first.status.activityType, "clipboard");
assert.equal(first.status.task, "Link copied · 21 chars");
assert.equal(first.status.detail, "https://example.com/a");
assert.equal(first.status.persisted, false);
assert.equal(first.state.lastSignature, firstSignature);
assert.equal(first.state.active.activityId, firstEventId);
assert.equal(first.state.active.activityType, "clipboard");
assert.equal(first.state.active.expiresAt, now + DEFAULT_RECENCY_MS);
assert.equal(first.state.active.isTransient, true);
const firstCopyEvent = {
  eventId: firstEventId,
  eventType: "copy",
  observedAt: now,
  detectedAt: now,
  source: "fixture-clipboard",
  contentType: "text/plain",
  hasPlainText: true,
  classification: "link",
  characterCount: 21,
  contentSignature: firstSignature
};
assert.deepEqual(first.state.active.metadata, {
  classification: "link",
  characterCount: 21,
  recentPlainTextChange: true,
  observedAt: now,
  copyEvent: firstCopyEvent
});
assert.deepEqual(first.status.metadata.copyEvent, firstCopyEvent, "copy event metadata should be exposed without raw clipboard text");
assert.equal(Object.values(first.status.metadata.copyEvent).includes("https://example.com/a"), false, "copy event metadata must not persist raw clipboard text");
assert.equal(first.state.active.persisted, false);
assert.equal(first.state.active.status.copied, true);
assert.equal(first.state.active.compactSurface.glyph, "link");
assert.equal(first.state.active.compactSurface.label, "Link copied · 21 chars");
assert.equal(first.state.active.compactSurface.hudKind, "copied");
const copiedHudActivity = buildClipboardCopiedHudActivity(firstCopyEvent, {
  classification: "link",
  characterCount: 21,
  label: "Link copied · 21 chars",
  preview: "https://example.com/a",
  recencyMs: DEFAULT_RECENCY_MS
});
assert.deepEqual(copiedHudActivity, first.state.active, "detected copy events should convert into the same compact copied HUD activity used by router/display tests");
assert.equal(copiedHudActivity.compactSurface.activityId, undefined, "source compact HUD stays renderer-neutral until normalized by the router");
assert.equal(JSON.stringify(copiedHudActivity).includes("contentSignature"), true, "copy event fingerprint is kept for determinism");
assert.equal(JSON.stringify(copiedHudActivity).includes("plainText"), false, "copied HUD activity must not persist raw clipboard text fields");

const validation = validateStatusPayload({ statuses: [first.status] });
assert.equal(validation.ok, true, "active clipboard status should satisfy the shared native status schema");
assert.deepEqual(validation.errors, []);

const unchanged = applyClipboardRead(first.state, {
  plainText: "https://example.com/a",
  observedAt: now + 100,
  source: "fixture-clipboard"
}, { now: now + 100, recencyMs: DEFAULT_RECENCY_MS });
assert.equal(unchanged.status.state, "idle");
assert.equal(unchanged.status.activityType, "futurePassive", "unchanged clipboard reads must not keep winning the compact router");
assert.equal(unchanged.status.metadata.recentPlainTextChange, false);
assert.equal(unchanged.state.active, null);

const stale = applyClipboardRead(first.state, {
  plainText: "fresh-looking but old",
  observedAt: now - DEFAULT_RECENCY_MS - 1,
  source: "fixture-clipboard"
}, { now, recencyMs: DEFAULT_RECENCY_MS });
assert.equal(stale.status.state, "idle");
assert.equal(stale.status.activityType, "futurePassive");
assert.match(stale.status.detail, /older than the recent-change window/);
assert.equal(stale.state.active, null);
assert.equal(stale.state.lastSignature, textSignature("fresh-looking but old"), "stale text should become the baseline without surfacing as an activity");

const nonPlain = applyClipboardRead(first.state, {
  plainText: "{\"looks\":\"text\"}",
  type: "application/json",
  observedAt: now + 200,
  source: "fixture-clipboard"
}, { now: now + 200 });
assert.equal(nonPlain.status.state, "idle");
assert.equal(nonPlain.status.activityType, "futurePassive");
assert.match(nonPlain.status.detail, /plain text/);

const empty = applyClipboardRead(first.state, {
  plainText: "   \0  ",
  observedAt: now + 300,
  source: "fixture-clipboard"
}, { now: now + 300 });
assert.equal(empty.status.state, "idle");
assert.equal(empty.status.activityType, "futurePassive");
assert.match(empty.status.detail, /No text clipboard content/);

const pathClass = classifyClipboardText("/Users/st/file.txt");
assert.equal(pathClass.classification, "path");
assert.equal(pathClass.label, "Path copied · 18 chars");
const validUrlClass = classifyClipboardText("https://example.com/a?b=1#frag");
assert.equal(validUrlClass.classification, "link", "valid URL strings should classify as URL/link content");
assert.equal(validUrlClass.label, "Link copied · 30 chars");
for (const invalidUrl of ["https://", "http://", "https:// example.com"]) {
  const invalidUrlClass = classifyClipboardText(invalidUrl);
  assert.equal(invalidUrlClass.classification, "text", `invalid URL string should remain plain text: ${invalidUrl}`);
}
const textClass = classifyClipboardText("hello");
assert.equal(textClass.classification, "text");
assert.equal(textClass.label, "Text copied · 5 chars");

const jsSnippet = `function greet(name) {
  return \`hello, ${"${name}"}\`;
}`;
const jsSnippetClass = classifyClipboardText(jsSnippet);
assert.equal(jsSnippetClass.classification, "code", "JavaScript-style snippets should classify as code-like clipboard text");
assert.equal(jsSnippetClass.label, "Code copied · 51 chars");

const pythonSnippet = `def greet(name):
    return f"hello, {name}"`;
const pythonSnippetClass = classifyClipboardText(pythonSnippet);
assert.equal(pythonSnippetClass.classification, "code", "Python-style snippets should classify as code-like clipboard text");
assert.equal(pythonSnippetClass.label, "Code copied · 44 chars");

const fencedSnippet = "```swift\nlet enabled = true\n```";
const fencedSnippetClass = classifyClipboardText(fencedSnippet);
assert.equal(fencedSnippetClass.classification, "code", "fenced snippets should classify as code-like clipboard text");

const proseClass = classifyClipboardText("Meeting notes: please return the file before lunch and confirm when you are done.");
assert.equal(proseClass.classification, "text", "ordinary prose with punctuation should remain plain text");
assert.equal(proseClass.label, "Text copied · 81 chars");

const seeded = buildClipboardStatusFromText("new text", {
  now: now + 400,
  observedAt: now + 400,
  previousSignature: textSignature("old text"),
  source: "fixture-clipboard"
});
assert.equal(seeded.status.task, "Text copied · 8 chars");
assert.equal(seeded.state.active.source, "fixture-clipboard");

console.log("Clipboard activity recency test passed.");
