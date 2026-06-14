#!/usr/bin/env node

// Assemble the native overlay into a double-clickable macOS .app bundle.
//
// The Swift overlay is the bundle's main executable (an .accessory/LSUIElement
// app — no Dock icon, a menu bar item that opens the on/off settings window). It
// spawns scripts/native-writer.js (bundled under Contents/Resources/app) using
// the system node to run the status-writer loop + YouTube media bridge. There are
// no runtime npm dependencies, so only the plain JS under src/ and scripts/ is
// copied — no node_modules.

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const appName = "Dynamac Island";
const bundleId = "com.hsuneh.dynamac-island";
const version = require(path.join(repoRoot, "package.json")).version || "0.0.0";

const distDir = path.join(repoRoot, "dist");
const appDir = path.join(distDir, `${appName}.app`);
const contentsDir = path.join(appDir, "Contents");
const macOSDir = path.join(contentsDir, "MacOS");
const resourcesDir = path.join(contentsDir, "Resources");
const appResourceDir = path.join(resourcesDir, "app");

function run(command, args) {
  const result = childProcess.spawnSync(command, args, { cwd: repoRoot, stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`Command failed: ${command} ${args.join(" ")}`);
    process.exit(result.status ?? 1);
  }
}

function copyInto(destRoot, relativePaths) {
  for (const rel of relativePaths) {
    const from = path.join(repoRoot, rel);
    if (!fs.existsSync(from)) continue;
    const to = path.join(destRoot, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to, { recursive: true });
  }
}

// 1. Build the Swift overlay binary fresh.
run("npm", ["run", "native:build"]);

// 2. Reset the bundle skeleton.
fs.rmSync(appDir, { recursive: true, force: true });
for (const dir of [macOSDir, resourcesDir, appResourceDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

// 3. Main executable: the Swift overlay.
const executableName = "dynamac-native";
fs.copyFileSync(path.join(repoRoot, ".build", executableName), path.join(macOSDir, executableName));
fs.chmodSync(path.join(macOSDir, executableName), 0o755);

// 4. Bundle the node writer service and its (dependency-free) sources.
copyInto(appResourceDir, [
  "scripts/native-writer.js",
  "scripts/youtube-media-bridge-server.js",
  "src/mac-activity-status.js",
  "package.json"
]);

// 5. Info.plist — LSUIElement hides the Dock icon (menu bar utility).
const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>${appName}</string>
  <key>CFBundleDisplayName</key>
  <string>${appName}</string>
  <key>CFBundleIdentifier</key>
  <string>${bundleId}</string>
  <key>CFBundleVersion</key>
  <string>${version}</string>
  <key>CFBundleShortVersionString</key>
  <string>${version}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleExecutable</key>
  <string>${executableName}</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
`;
fs.writeFileSync(path.join(contentsDir, "Info.plist"), infoPlist);

// 6. Ad-hoc code signature so launchd/SMAppService accept the bundle locally.
run("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", appDir]);

console.log(`Packaged ${appName}.app at ${appDir}`);
console.log(`Launch it with:  open "${appDir}"`);
