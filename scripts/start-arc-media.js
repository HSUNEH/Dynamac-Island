#!/usr/bin/env node
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const extensionPath = path.join(repoRoot, "extensions", "youtube-media-bridge");
const candidates = [
  process.env.DYNAMAC_ARC_APP,
  path.join(os.homedir(), "Applications", "Arc-Snuffles.app"),
  "/Users/sunbot/Applications/Arc-Snuffles.app",
  "/Applications/Arc.app"
].filter(Boolean);

const appPath = candidates.find((candidate) => fs.existsSync(candidate));
if (!appPath) {
  console.error("Could not find Arc. Set DYNAMAC_ARC_APP=/path/to/Arc.app or install Arc-Snuffles.app.");
  process.exit(1);
}

console.log(`Launching ${appPath} with Dynamac YouTube media bridge extension...`);
childProcess.execFileSync("open", ["-na", appPath, "--args", `--load-extension=${extensionPath}`], {
  cwd: repoRoot,
  stdio: "inherit"
});
