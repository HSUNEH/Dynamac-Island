#!/usr/bin/env node

const { spawnSync } = require("node:child_process");

const arch = process.env.DYNAMAC_PACKAGE_ARCH || process.arch;
const normalizedArch = arch === "x64" ? "x64" : arch === "arm64" ? "arm64" : arch;
const appName = "Dynamac Island";
const iconPath = "assets/app-icon";

const args = [
  "electron-packager",
  ".",
  appName,
  "--platform=darwin",
  `--arch=${normalizedArch}`,
  "--out=dist",
  "--overwrite",
  "--prune=true",
  `--icon=${iconPath}`,
  "--app-bundle-id=com.hsuneh.dynamac-island",
  "--ignore=^/dist($|/)",
  "--ignore=^/\.git($|/)",
  "--ignore=^/node_modules/\.cache($|/)"
];

const result = spawnSync("npx", args, {
  stdio: "inherit",
  shell: false
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Packaged ${appName}.app for darwin-${normalizedArch} in dist/`);
