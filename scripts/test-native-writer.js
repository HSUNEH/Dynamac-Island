#!/usr/bin/env node

// Contract for scripts/native-writer.js — the standalone status-writer service the
// packaged .app spawns. Regression focus: a Finder-launched .app runs from cwd "/",
// so the artwork cache and YouTube bridge file must NOT default to a cwd-relative
// `.build/` dir (that write fails or lands in the read-only bundle). They must be
// anchored next to the writable status snapshot instead.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.resolve(__dirname, "native-writer.js"), "utf8");

assert.match(source, /writeMacActivityStatusSnapshot/, "native-writer must drive the shared status snapshot writer");
assert.match(source, /const baseDir = path\.dirname\(statusFile\)/, "writable paths must be derived from the status file's directory, not the process cwd");
assert.match(source, /artworkCacheDir = env\.DYNAMAC_ARTWORK_CACHE_DIR \|\| path\.join\(baseDir/, "artwork cache must be anchored to the writable base dir (overridable)");
assert.match(source, /youtubeMediaFile = env\.DYNAMAC_YOUTUBE_MEDIA_FILE \|\| path\.join\(baseDir/, "YouTube bridge file must be anchored to the writable base dir (overridable)");
assert.match(source, /env\.DYNAMAC_YOUTUBE_MEDIA_FILE = youtubeMediaFile/, "the resolved bridge file must be shared with the spawned bridge server and the reader");
assert.match(source, /artworkCacheDir,\s*\n\s*youtubeBridgePath: youtubeMediaFile/, "the snapshot writer must receive the anchored artwork + bridge paths");
assert.doesNotMatch(source, /process\.cwd\(\)/, "native-writer must not anchor any path to process.cwd() (the .app runs from /)");

// Lock + cleanup so a crashed/relaunched app does not leave a stale single-instance lock.
assert.match(source, /acquireSingleInstanceLock/, "native-writer must take a single-instance lock");
assert.match(source, /fs\.rmSync\(lockPath, \{ force: true \}\)/, "native-writer must remove its lock on cleanup");
assert.match(source, /for \(const signal of \["SIGINT", "SIGTERM"\]\)/, "native-writer must clean up on termination signals");

console.log("native-writer contract test passed.");
