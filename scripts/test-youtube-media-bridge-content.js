#!/usr/bin/env node
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const content = fs.readFileSync(path.join(__dirname, "..", "extensions", "youtube-media-bridge", "content.js"), "utf8");

assert.match(content, /heartbeatMs/, "content script should define a heartbeat interval");
assert.match(content, /lastPublishAt/, "content script should track the last publish time");
assert.match(
  content,
  /signature === lastSignature && !shouldHeartbeat/,
  "unchanged live streams must still POST periodically so bridge mtime does not go stale"
);
assert.match(
  content,
  /setInterval\(publish, 750\)/,
  "content script should keep polling YouTube player state"
);

console.log("YouTube media bridge content heartbeat test passed.");
