#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {
  parseDelimitedMedia,
  youtubeArtworkUrl,
  youtubeThumbnailUrl
} = require("../src/mac-activity-status");

const oldId = "OLDVIDEO123";
const freshId = "NEWVIDEO456";
const pageUrl = `https://www.youtube.com/watch?v=${freshId}&list=RD`;
const staleOgImage = `https://i.ytimg.com/vi/${oldId}/maxresdefault.jpg`;
const expectedFreshThumbnail = `https://img.youtube.com/vi/${freshId}/hqdefault.jpg`;

assert.equal(youtubeThumbnailUrl(pageUrl), expectedFreshThumbnail, "YouTube thumbnail helper should derive artwork from the current page URL video id");
assert.equal(youtubeArtworkUrl(pageUrl, staleOgImage), expectedFreshThumbnail, "current page URL thumbnail should beat a stale og:image from a previous YouTube SPA route");

const parsed = parseDelimitedMedia(`youtube-json||${JSON.stringify({
  title: "Fresh video",
  artist: "Fresh channel",
  album: "YouTube",
  artworkUrl: staleOgImage,
  durationSeconds: 180,
  positionSeconds: 12,
  playbackState: "playing"
})}||${pageUrl}`);

assert.equal(parsed.artworkUrl, expectedFreshThumbnail, "YouTube JSON probes should replace stale artwork with the current URL thumbnail");
assert.equal(parsed.pageUrl, pageUrl, "YouTube parser should preserve the current page URL used for freshness");

const bridgeContent = fs.readFileSync(path.join(__dirname, "..", "extensions", "youtube-media-bridge", "content.js"), "utf8");
assert.match(bridgeContent, /function videoIdFromUrl\(url\)/, "YouTube bridge should parse the current location video id");
assert.match(bridgeContent, /thumbnailForUrl\(location\.href\) \|\| meta\('meta\[property="og:image"\]'\)/, "YouTube bridge should prefer current URL thumbnails before potentially stale og:image");

console.log("YouTube thumbnail freshness test passed.");
