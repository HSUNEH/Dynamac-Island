#!/usr/bin/env node

// Regression test for the browser-probe hang that froze the Now Playing
// refresh loop: an unresponsive browser made a synchronous osascript probe
// block indefinitely, the SIGTERM timeout could not reap it, orphaned
// osascript children piled up, and status.json stopped updating so the overlay
// stuck on a stale snapshot (e.g. an already-closed Spotify shown as playing).
//
// These checks assert the three properties of the fix without needing a real
// hung browser:
//   1. runCommand bounds a stuck child to ~timeout and reaps it (no orphans).
//   2. The window-title probe scripts skip non-running browsers and bound the
//      System Events Apple Event with `with timeout`.
//   3. A failing/empty browser probe never suppresses other media sources.

const assert = require("node:assert");
const childProcess = require("node:child_process");
const os = require("node:os");
const path = require("node:path");
const {
  runCommand,
  chromiumFallbackYouTubeTitleScript,
  browserYouTubeScript,
  collectMediaCandidates,
  writeMacActivityStatusSnapshot
} = require("../src/mac-activity-status");

// 1. A command that never returns must be killed at the timeout, return "",
//    and leave no surviving child process.
const marker = `dynamac-probe-isolation-${process.pid}`;
const start = Date.now();
const stuckResult = runCommand("/bin/sh", ["-c", `# ${marker}\nsleep 30`], { timeout: 400 });
const elapsed = Date.now() - start;
assert.equal(stuckResult, "", "a timed-out probe must return an empty string");
assert.ok(elapsed < 2000, `a stuck probe must be bounded by its timeout, took ${elapsed}ms`);

const survivors = childProcess
  .execSync(`pgrep -f ${marker} || true`)
  .toString()
  .trim();
assert.equal(survivors, "", `stuck probe child must be reaped, found survivors: ${survivors}`);

// 2. The window-title fallback (the script that previously hung on
//    unresponsive Chromium browsers like Dia/Opera GX) must guard on
//    `is running` and bound the System Events Apple Event with `with timeout`.
const fallback = chromiumFallbackYouTubeTitleScript("Dia");
assert.ok(
  fallback.includes('if application "Dia" is running then'),
  "fallback probe must skip non-running browsers via an `is running` guard"
);
assert.ok(
  /with timeout of \d+ seconds/.test(fallback),
  "fallback probe must bound the System Events Apple Event with `with timeout`"
);
assert.ok(fallback.includes("end timeout"), "fallback probe must close the `with timeout` block");

// The Chromium probe appends the same guarded+bounded fallback, so it inherits
// both protections.
const chromiumScript = browserYouTubeScript("Dia");
assert.ok(
  chromiumScript.includes('if application "Dia" is running then'),
  "chromium probe must guard the appended fallback on `is running`"
);
assert.ok(
  /with timeout of \d+ seconds/.test(chromiumScript),
  "chromium probe must bound the appended fallback with `with timeout`"
);

// 3. An empty/failing browser probe must not suppress other live sources: with
//    every browser path injected as empty, a playing Spotify candidate must
//    still be collected in the same cycle.
const spotifyText =
  "spotify||Song Title||Artist Name||Album Name||https://i.scdn.co/image/abc||240000||42.4||playing";
const candidates = collectMediaCandidates({
  frontmostApp: "Finder",
  spotifyText,
  musicText: "",
  browserMediaTexts: [],
  frontmostBrowserMediaText: "",
  cdpMediaText: "",
  youtubeBridgeRaw: "{}",
  mediaRemoteRaw: ""
});
const spotifyCandidate = candidates.find((candidate) => candidate.source === "spotify");
assert.ok(
  spotifyCandidate && spotifyCandidate.playbackState === "playing",
  "a failing/empty browser probe must not suppress the playing Spotify source"
);

// 4. native-start seeds the first refresh with `previousPayload: null`. The
//    snapshot writer must tolerate that and write a payload instead of
//    throwing, otherwise status.json never updates and the overlay freezes on
//    a stale snapshot.
const snapshotPath = path.join(os.tmpdir(), `dynamac-probe-isolation-snapshot-${process.pid}.json`);
const firstSnapshot = writeMacActivityStatusSnapshot({ outputPath: snapshotPath, previousPayload: null });
assert.ok(
  firstSnapshot && firstSnapshot.payload && Array.isArray(firstSnapshot.payload.statuses),
  "first refresh with previousPayload:null must write a payload, not throw"
);

console.log("browser probe isolation checks passed.");
