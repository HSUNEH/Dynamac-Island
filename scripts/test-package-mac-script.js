#!/usr/bin/env node

const assert = require("node:assert");
const fs = require("node:fs");
const pkg = require("../package.json");

assert.ok(pkg.scripts["package:mac"], "package.json should define npm run package:mac");
assert.match(pkg.scripts["package:mac"], /electron-packager|package-mac/, "package:mac should package a macOS .app");
assert.ok(pkg.devDependencies["@electron/packager"], "@electron/packager should be a dev dependency");

const readme = fs.readFileSync("README.md", "utf8");
assert.match(readme, /\.app/, "README should document .app packaging");
assert.match(readme, /npm run package:mac/, "README should document npm run package:mac");
assert.match(readme, /dist\//, "README should document the dist output directory");

const source = fs.readFileSync("scripts/package-mac.js", "utf8");
assert.match(source, /assets\/app-icon/, "package:mac should use the custom Dynamac app icon basename");
assert.ok(fs.existsSync("assets/app-icon.icns"), "custom macOS app icon should exist");
assert.ok(fs.existsSync("assets/app-icon.png"), "source app icon PNG should exist");

console.log("package:mac script documentation test passed.");
