#!/usr/bin/env node
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const script = fs.readFileSync(path.join(__dirname, "start-arc-media.js"), "utf8");

assert.match(script, /\/Applications\/Arc\.app/, "launcher should target ST's normal Arc.app by default");
assert.match(script, /--load-extension=\$\{extensionPath\}/, "launcher should attach the Dynamac YouTube bridge extension to Arc");
assert.match(script, /normal Arc profile\/account/, "launcher should document that it intentionally uses ST's shared Arc profile");
assert.match(script, /dedicated Arc Space for Snuffles/, "launcher should remind operators to keep Snuffles tabs in a dedicated Arc Space");
assert.doesNotMatch(script, /DYNAMAC_ARC_USER_DATA_DIR/, "launcher should not force an isolated Arc profile anymore");
assert.doesNotMatch(script, /--user-data-dir/, "launcher should not pass --user-data-dir in shared Space mode");
assert.doesNotMatch(script, /Arc-Snuffles-Isolated/, "launcher should not depend on the removed isolated Arc app");

console.log("Arc media launcher shared-space test passed.");
