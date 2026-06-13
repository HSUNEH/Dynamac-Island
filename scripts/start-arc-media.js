#!/usr/bin/env node
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const extensionPath = path.join(repoRoot, "extensions", "youtube-media-bridge");
const candidates = [
  process.env.DYNAMAC_ARC_APP,
  "/Applications/Arc.app",
  path.join(os.homedir(), "Applications", "Arc.app")
].filter(Boolean);

const appPath = candidates.find((candidate) => fs.existsSync(candidate));
if (!appPath) {
  console.error("Could not find Arc.app. Install Arc or set DYNAMAC_ARC_APP=/path/to/Arc.app.");
  process.exit(1);
}

console.log(`Launching ST's normal Arc with Dynamac YouTube media bridge extension...`);
console.log(`Using Arc app: ${appPath}`);
console.log("This intentionally uses ST's normal Arc profile/account; keep a dedicated Arc Space for Snuffles tabs.");
childProcess.execFileSync("open", [
  "-a",
  appPath,
  "--args",
  `--load-extension=${extensionPath}`
], {
  cwd: repoRoot,
  stdio: "inherit"
});
