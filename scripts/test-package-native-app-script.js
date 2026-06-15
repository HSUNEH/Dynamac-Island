#!/usr/bin/env node

// Contract for scripts/package-native-app.js — assembles the native overlay into a
// menu-bar (.app) bundle. Verifies the bundle is built as a Dock-less utility that
// ships the Swift binary plus the dependency-free node writer it spawns.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.resolve(__dirname, "package-native-app.js"), "utf8");

// Builds the overlay binary fresh and uses it as the bundle's main executable.
assert.match(source, /npm", \["run", "native:build"\]/, "packaging must build the Swift overlay first");
assert.match(source, /Contents\/MacOS|"MacOS"/, "bundle must place the executable under Contents/MacOS");
assert.match(source, /CFBundleExecutable/, "Info.plist must declare the bundle executable");
assert.match(source, /CFBundleIconFile/, "Info.plist must declare the custom app icon");
assert.match(source, /app-icon\.icns/, "native bundle should ship the Dynamac island app icon");

// LSUIElement makes it a menu-bar utility with no Dock icon (the requested behavior).
assert.match(source, /<key>LSUIElement<\/key>\s*\n\s*<true\/>/, "bundle must set LSUIElement so it has no Dock icon");
assert.match(source, /CFBundleIdentifier/, "Info.plist must carry a bundle identifier (needed for launch-at-login / SMAppService)");
assert.match(source, /com\.hsuneh\.dynamac-island/, "bundle id must be stable so SMAppService login items persist");

// Ships the node writer + its dependency-free sources (no node_modules needed).
assert.match(source, /scripts\/native-writer\.js/, "bundle must include the writer the app spawns");
assert.match(source, /scripts\/youtube-media-bridge-server\.js/, "bundle must include the YouTube media bridge server");
assert.match(source, /src\/mac-activity-status\.js/, "bundle must include the status snapshot source");

// Ad-hoc signature so launchd/SMAppService accept the local bundle.
assert.match(source, /codesign/, "bundle must be (ad-hoc) code signed for local launch + login item registration");

console.log("package-native-app script test passed.");
