#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  buildMacActivityStatusPayload,
  classifyClipboardText,
  formatDuration,
  parseDelimitedMedia,
  parsePmsetBattery,
  youtubeThumbnailUrl,
  writeMacActivityStatusSnapshot
} = require("../src/mac-activity-status");

assert.deepEqual(parsePmsetBattery("Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1234567)\t19%; discharging; 1:20 remaining present: true"), {
  agent: "Battery",
  state: "warning",
  task: "Battery 19%",
  detail: "Now drawing from 'Battery Power' -InternalBattery-0 (id=1234567) 19%; discharging; 1:20 remaining present: true"
});

assert.equal(parsePmsetBattery("Now drawing from 'AC Power'\n -InternalBattery-0\t82%; charging; 0:35 remaining present: true").task, "Charging 82%");
assert.equal(classifyClipboardText("https://example.com/a").task, "Link copied · 21 chars");
assert.equal(classifyClipboardText("/Users/st/file.txt").task, "Path copied · 18 chars");
assert.equal(classifyClipboardText("hello").task, "Text copied · 5 chars");
assert.equal(formatDuration(65.9), "1:05");
assert.equal(youtubeThumbnailUrl("https://www.youtube.com/watch?v=abcDEF_1234"), "https://img.youtube.com/vi/abcDEF_1234/hqdefault.jpg");

const spotifyInfo = parseDelimitedMedia("spotify||Song Title||Artist Name||Album Name||https://i.scdn.co/image/abc||240000||42.4||playing");
assert.equal(spotifyInfo.source, "spotify");
assert.equal(spotifyInfo.durationSeconds, 240);
assert.equal(spotifyInfo.positionSeconds, 42.4);
assert.equal(spotifyInfo.artworkUrl, "https://i.scdn.co/image/abc");

const musicInfo = parseDelimitedMedia("music||Song Title||Artist Name||Album Name||/tmp/dynamac-music-artwork.jpg||240||42.4||paused");
assert.equal(musicInfo.source, "music");
assert.equal(musicInfo.artworkUrl, "/tmp/dynamac-music-artwork.jpg");
assert.equal(musicInfo.playbackState, "paused");

const youtubeInfo = parseDelimitedMedia("youtube||Video Title||||YouTube||||0||0||unknown||https://www.youtube.com/watch?v=abcDEF_1234");
assert.equal(youtubeInfo.source, "youtube");
assert.equal(youtubeInfo.artworkUrl, "https://img.youtube.com/vi/abcDEF_1234/hqdefault.jpg");

const youtubeJsonInfo = parseDelimitedMedia('youtube-json||{"title":"Video Title","artist":"Channel","album":"YouTube","artworkUrl":"https://i.ytimg.com/vi/abcDEF_1234/hqdefault.jpg","durationSeconds":1521,"positionSeconds":8,"playbackState":"playing"}||https://www.youtube.com/watch?v=abcDEF_1234');
assert.equal(youtubeJsonInfo.source, "youtube");
assert.equal(youtubeJsonInfo.title, "Video Title");
assert.equal(youtubeJsonInfo.artist, "Channel");
assert.equal(youtubeJsonInfo.durationSeconds, 1521);
assert.equal(youtubeJsonInfo.positionSeconds, 8);
assert.equal(youtubeJsonInfo.playbackState, "playing");
assert.equal(youtubeJsonInfo.artworkUrl, "https://i.ytimg.com/vi/abcDEF_1234/hqdefault.jpg");

const payload = buildMacActivityStatusPayload({
  now: new Date("2026-06-11T09:00:00.000Z"),
  mediaInfo: spotifyInfo,
  clipboardText: "https://example.com/a",
  pmsetOutput: "Now drawing from 'AC Power'\n -InternalBattery-0\t82%; charging; 0:35 remaining present: true"
});

assert.deepEqual(payload.statuses.map((status) => status.agent), ["Now Playing", "Clipboard", "Battery"]);
assert.equal(payload.statuses[0].state, "running");
assert.equal(payload.statuses[0].task, "Song Title");
assert.equal(payload.statuses[0].detail, "Artist Name");
assert.equal(payload.statuses[0].media.title, "Song Title");
assert.equal(payload.statuses[0].media.artist, "Artist Name");
assert.equal(payload.statuses[0].media.elapsedLabel, "0:42");
assert.equal(payload.statuses[0].media.durationLabel, "4:00");
assert.equal(payload.statuses[1].task, "Link copied · 21 chars");
assert.equal(payload.statuses[2].task, "Charging 82%");
assert.equal(payload.statuses.every((status) => status.updatedAt === "2026-06-11T09:00:00.000Z"), true);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dynamac-mac-activity-"));
const outputPath = path.join(tempDir, "status.json");
const result = writeMacActivityStatusSnapshot({
  outputPath,
  now: new Date("2026-06-11T09:00:00.000Z"),
  mediaInfo: null,
  clipboardText: "hello",
  pmsetOutput: "Now drawing from 'Battery Power'\n -InternalBattery-0\t77%; discharging; 5:00 remaining present: true"
});
assert.equal(result.ok, true);
assert.equal(fs.existsSync(outputPath), true);
const written = JSON.parse(fs.readFileSync(outputPath, "utf8"));
assert.equal(written.statuses.length, 3);
assert.equal(written.statuses[0].media.playbackState, "idle");

console.log("Mac activity status snapshot test passed.");
