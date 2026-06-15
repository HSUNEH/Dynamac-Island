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
  formatClipboardPreviewText,
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
assert.equal(first.status.detail, "example.com/a");
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
  copied: true,
  copiedState: "copied",
  displayLabel: "Link copied · 21 chars",
  displayPreview: "example.com/a",
  displayGlyph: "link",
  hudKind: "copied",
  recentPlainTextChange: true,
  observedAt: now,
  copyEvent: firstCopyEvent
});
assert.deepEqual(
  {
    copied: first.status.metadata.copied,
    copiedState: first.status.metadata.copiedState,
    displayLabel: first.status.metadata.displayLabel,
    displayPreview: first.status.metadata.displayPreview,
    displayGlyph: first.status.metadata.displayGlyph,
    hudKind: first.status.metadata.hudKind
  },
  {
    copied: true,
    copiedState: "copied",
    displayLabel: "Link copied · 21 chars",
    displayPreview: "example.com/a",
    displayGlyph: "link",
    hudKind: "copied"
  },
  "active clipboard status should report copied state with display-ready metadata"
);
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
  preview: "example.com/a",
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
assert.equal(unchanged.status.state, "running");
assert.equal(unchanged.status.activityType, "clipboard", "unchanged clipboard reads should keep the original short-lived copied activity active before expiry");
assert.equal(unchanged.status.metadata.recentPlainTextChange, true);
assert.equal(unchanged.status.metadata.copiedState, "copied");
assert.equal(unchanged.state.active.activityId, first.state.active.activityId, "duplicate reads before expiry should replay the same activity instance");
assert.equal(unchanged.state.active.expiresAt, now + DEFAULT_RECENCY_MS, "duplicate reads before expiry must not extend clipboard visibility");

const second = applyClipboardRead(first.state, {
  plainText: "second copied text",
  observedAt: now + 200,
  source: "fixture-clipboard"
}, { now: now + 200, recencyMs: DEFAULT_RECENCY_MS });
const secondSignature = textSignature("second copied text");
const serializedSecondState = JSON.stringify(second.state);
assert.equal(second.status.activityType, "clipboard", "successive changed reads should emit a fresh clipboard activity");
assert.equal(second.state.lastSignature, secondSignature, "latest changed read should become the only clipboard baseline");
assert.equal(second.state.active.activityId, `clipboard-copy-${now + 200}-${secondSignature.slice(0, 12)}`);
assert.notEqual(second.state.active.activityId, first.state.active.activityId, "latest changed read should replace the previous transient activity instance");
assert.equal(second.state.active.status.preview, "second copied text", "latest transient clipboard activity should expose the latest preview");
assert.equal(second.state.active.metadata.copyEvent.contentSignature, secondSignature, "latest copy event should replace the previous copy fingerprint");
assert.equal(serializedSecondState.includes(firstSignature), false, "older clipboard fingerprints must not accumulate as history in state");
assert.equal(serializedSecondState.includes("example.com/a"), false, "older clipboard previews must be replaced rather than retained as history");
assert.equal(Array.isArray(second.state.history), false, "clipboard activity state should not expose a history collection");
assert.equal(Array.isArray(second.state.activities), false, "clipboard activity state should retain only the latest active activity, not an activity list");

const third = applyClipboardRead(second.state, {
  plainText: "const latest = true;",
  observedAt: now + 300,
  source: "fixture-clipboard"
}, { now: now + 300, recencyMs: DEFAULT_RECENCY_MS });
const serializedThirdStatus = JSON.stringify(third.status);
assert.equal(third.state.active.status.preview, "const latest = true;", "third changed read should replace the second transient activity");
assert.equal(serializedThirdStatus.includes("second copied text"), false, "native status payload should not retain the previous clipboard preview after replacement");
assert.equal(serializedThirdStatus.includes(secondSignature), false, "native status payload should not retain the previous clipboard fingerprint after replacement");

const expiredDuplicate = applyClipboardRead(first.state, {
  plainText: "https://example.com/a",
  observedAt: now + DEFAULT_RECENCY_MS + 1,
  source: "fixture-clipboard"
}, { now: now + DEFAULT_RECENCY_MS + 1, recencyMs: DEFAULT_RECENCY_MS });
assert.equal(expiredDuplicate.status.state, "idle");
assert.equal(expiredDuplicate.status.activityType, "futurePassive", "unchanged clipboard reads after expiry should not remain compact-active");
assert.equal(expiredDuplicate.status.task, "Clipboard expired", "expired copied activity should transition to an explicit expired status");
assert.equal(expiredDuplicate.status.metadata.copied, false);
assert.equal(expiredDuplicate.status.metadata.copiedState, "expired");
assert.equal(expiredDuplicate.status.metadata.recentPlainTextChange, false);
assert.equal(expiredDuplicate.status.metadata.expiredActivityId, first.state.active.activityId);
assert.equal(expiredDuplicate.status.metadata.expiredAt, now + DEFAULT_RECENCY_MS);
assert.equal(expiredDuplicate.status.clipboardActivity, null, "expired native status must not keep the old compact clipboard activity active");
assert.equal(expiredDuplicate.state.active, null);
assert.equal(validateStatusPayload({ statuses: [expiredDuplicate.status] }).ok, true, "expired clipboard status should satisfy the shared native status schema");

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
assert.equal(nonPlain.status.state, "warning");
assert.equal(nonPlain.status.activityType, "futurePassive");
assert.match(nonPlain.status.detail, /plain text/);
assert.equal(nonPlain.status.metadata.clipboardState, "unavailable");
assert.equal(nonPlain.status.metadata.recentPlainTextChange, false);
assert.match(nonPlain.status.detail, /could not be read as plain text/);
assert.equal(validateStatusPayload({ statuses: [nonPlain.status] }).ok, true, "unavailable clipboard status should satisfy shared native status schema");

const unreadable = applyClipboardRead(first.state, {
  hasPlainText: false,
  readError: "pbpaste exited before clipboard contents could be read.",
  observedAt: now + 250,
  source: "fixture-clipboard"
}, { now: now + 250 });
assert.equal(unreadable.status.state, "warning");
assert.equal(unreadable.status.task, "Clipboard unavailable");
assert.equal(unreadable.status.metadata.classification, "unavailable");
assert.equal(unreadable.status.metadata.clipboardState, "unavailable");
assert.equal(unreadable.status.detail, "pbpaste exited before clipboard contents could be read.");
assert.equal(unreadable.state.active, null);

const failedEvaluation = applyClipboardRead({
  lastSignature: firstSignature,
  active: {
    activityId: "clipboard-copy-malformed-active-fixture",
    activityType: "clipboard",
    expiresAt: now + DEFAULT_RECENCY_MS
  }
}, {
  plainText: "https://example.com/a",
  observedAt: now + 260,
  source: "fixture-clipboard"
}, { now: now + 260, recencyMs: DEFAULT_RECENCY_MS });
assert.equal(failedEvaluation.status.state, "error", "clipboard status evaluation failures should be reported as error status instead of throwing");
assert.equal(failedEvaluation.status.task, "Clipboard error");
assert.equal(failedEvaluation.status.activityType, "futurePassive");
assert.equal(failedEvaluation.status.detail, "Clipboard status evaluation failed.");
assert.equal(failedEvaluation.status.metadata.classification, "error");
assert.equal(failedEvaluation.status.metadata.clipboardState, "error");
assert.match(failedEvaluation.status.metadata.errorMessage, /label|status/, "error status should expose a concise failure reason");
assert.equal(failedEvaluation.status.metadata.recentPlainTextChange, false);
assert.equal(failedEvaluation.status.clipboardActivity, null, "error status must not keep malformed clipboard activity compact-active");
assert.equal(failedEvaluation.state.active, null, "failed evaluation should clear malformed compact activity from in-memory state");
assert.equal(failedEvaluation.state.lastSignature, firstSignature, "failed evaluation should preserve the latest fingerprint baseline without storing raw text");
assert.equal(validateStatusPayload({ statuses: [failedEvaluation.status] }).ok, true, "error clipboard status should satisfy the shared native status schema");
assert.equal(JSON.stringify(failedEvaluation).includes("https://example.com/a"), false, "error status must not leak raw clipboard text");

const empty = applyClipboardRead(first.state, {
  plainText: "   \0  ",
  observedAt: now + 300,
  source: "fixture-clipboard"
}, { now: now + 300 });
assert.equal(empty.status.state, "warning");
assert.equal(empty.status.activityType, "futurePassive");
assert.equal(empty.status.task, "Clipboard unavailable");
assert.equal(empty.status.metadata.classification, "unavailable");
assert.equal(empty.status.metadata.clipboardState, "unavailable");
assert.equal(empty.status.metadata.recentPlainTextChange, false);
assert.match(empty.status.detail, /No text clipboard content/);

const pathClass = classifyClipboardText("/Users/st/file.txt");
assert.equal(pathClass.classification, "path");
assert.equal(pathClass.label, "Path copied · 18 chars");
const validUrlClass = classifyClipboardText("https://example.com/a?b=1#frag");
assert.equal(validUrlClass.classification, "link", "valid URL strings should classify as URL/link content");
assert.equal(validUrlClass.label, "Link copied · 30 chars");
assert.equal(validUrlClass.preview, "example.com/a?b=1", "URL previews should be compact and omit protocol/hash noise");
for (const invalidUrl of ["https://", "http://", "https:// example.com"]) {
  const invalidUrlClass = classifyClipboardText(invalidUrl);
  assert.equal(invalidUrlClass.classification, "text", `invalid URL string should remain plain text: ${invalidUrl}`);
}
const textClass = classifyClipboardText("hello");
assert.equal(textClass.classification, "text");
assert.equal(textClass.label, "Text copied · 5 chars");
assert.equal(textClass.preview, "hello");

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
assert.equal(fencedSnippetClass.preview, "swift · let enabled = true", "code previews should show language and first code line instead of raw fences");

assert.equal(
  formatClipboardPreviewText("file:///Users/st/Documents/demo%20note.txt", "path"),
  "demo note.txt — /Users/st/Documents",
  "file URL path previews should decode names and show parent context"
);
assert.equal(
  formatClipboardPreviewText("/Users/st/Documents/demo note.txt", "path"),
  "demo note.txt — /Users/st/Documents",
  "absolute path previews should show basename and parent context"
);
assert.equal(
  formatClipboardPreviewText("const enabled = true;", "code"),
  "const enabled = true;",
  "inline code previews should preserve the first code line"
);

const oversizedCopiedText = `Alpha ${"middle ".repeat(20)}Omega`;
const oversizedPreview = formatClipboardPreviewText(oversizedCopiedText, "text", 24);
assert.equal(oversizedPreview, "Alpha middle…iddle Omega", "oversized text previews should keep deterministic head/tail context");
assert.equal(Array.from(oversizedPreview).length, 24, "oversized text previews should respect the exact preview length cap");

const oversizedUnicodePreview = formatClipboardPreviewText("🐶".repeat(40), "text", 7);
assert.equal(oversizedUnicodePreview, "🐶🐶🐶…🐶🐶🐶", "oversized previews should truncate by Unicode characters instead of UTF-16 units");
assert.equal(Array.from(oversizedUnicodePreview).length, 7);

const oversizedStatus = buildClipboardStatusFromText(oversizedCopiedText, {
  now: now + 450,
  observedAt: now + 450,
  previousSignature: textSignature("previous copied text"),
  source: "fixture-clipboard"
});
assert.equal(oversizedStatus.status.detail, formatClipboardPreviewText(oversizedCopiedText, "text"), "clipboard status should use the same deterministic oversized preview formatter");
assert.equal(Array.from(oversizedStatus.status.detail).length, 120, "clipboard status previews should use the default deterministic cap");
assert.equal(JSON.stringify(oversizedStatus.status).includes(oversizedCopiedText), false, "oversized raw clipboard text must not leak into status payloads");

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
