#!/usr/bin/env node

const assert = require("node:assert");
const path = require("node:path");
const {
  resolveDefaultStatusFile,
  ensureWritableStatusFile
} = require("../src/main-process");

const developmentAppPath = path.resolve(".");
assert.equal(
  resolveDefaultStatusFile(
    { getPath() { throw new Error("getPath should not be called for unpackaged apps"); } },
    developmentAppPath
  ),
  path.join(developmentAppPath, "status", "status.json"),
  "unpackaged app should keep using project status/status.json"
);

const packagedAppPath = path.join("/Applications", "Dynamac Island.app", "Contents", "Resources", "app.asar");
assert.equal(
  resolveDefaultStatusFile(
    { getPath(name) { assert.equal(name, "userData"); return "/Users/st/Library/Application Support/Dynamac Island"; } },
    packagedAppPath
  ),
  "/Users/st/Library/Application Support/Dynamac Island/status/status.json",
  "packaged app should use writable userData status path instead of app.asar"
);

const calls = [];
const files = new Map([["/bundle/status/status.json", "{\"statuses\":[]}"]]);
const fakeFs = {
  existsSync(filePath) {
    calls.push(["existsSync", filePath]);
    return files.has(filePath);
  },
  mkdirSync(directory, options) {
    calls.push(["mkdirSync", directory, options]);
  },
  copyFileSync(from, to) {
    calls.push(["copyFileSync", from, to]);
    files.set(to, files.get(from));
  }
};

ensureWritableStatusFile({
  statusFile: "/userData/status/status.json",
  bundledStatusFile: "/bundle/status/status.json",
  fs: fakeFs
});

assert.equal(files.get("/userData/status/status.json"), "{\"statuses\":[]}");
assert.deepEqual(
  calls.filter((call) => call[0] === "copyFileSync"),
  [["copyFileSync", "/bundle/status/status.json", "/userData/status/status.json"]],
  "first packaged launch should seed writable status file from bundled fixture"
);

console.log("Packaged status path test passed.");
