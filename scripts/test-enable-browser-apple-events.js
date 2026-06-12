const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const childProcess = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "enable-browser-apple-events.js");
const source = fs.readFileSync(scriptPath, "utf8");

assert.match(source, /allow_javascript_apple_events/, "browser Apple Events helper should enable Chromium's JavaScript-from-Apple-Events preference");
assert.match(source, /Library\/Application Support\/Google\/Chrome/, "helper should cover Google Chrome profiles");
assert.match(source, /Library\/Application Support\/Arc/, "helper should cover Arc profile candidates");
assert.match(source, /company\.thebrowser\.Browser/, "helper should cover Arc's bundle/container candidates");
assert.match(source, /\.dynamac-bak-/, "helper should back up Preferences files before editing");
assert.match(source, /DEFAULT_PROFILE_NAME[^\n]+snuffles/, "helper should default seeded browser profiles to snuffles");
assert.match(source, /ensureArcSnufflesProfile/, "helper should create a minimal Arc profile when Arc exists but has no Preferences yet");

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "dynamac-browser-events-"));
const prefDir = path.join(tmpHome, "Library", "Application Support", "Google", "Chrome", "Default");
fs.mkdirSync(prefDir, { recursive: true });
const prefPath = path.join(prefDir, "Preferences");
fs.writeFileSync(prefPath, JSON.stringify({ browser: { existing: true } }));

const result = childProcess.spawnSync(process.execPath, [scriptPath], {
  env: { ...process.env, HOME: tmpHome },
  encoding: "utf8"
});
assert.equal(result.status, 0, result.stderr || result.stdout);
const patched = JSON.parse(fs.readFileSync(prefPath, "utf8"));
assert.equal(patched.browser.allow_javascript_apple_events, true);
assert.equal(patched.browser.existing, true);
const backups = fs.readdirSync(prefDir).filter((name) => name.startsWith("Preferences.dynamac-bak-"));
assert.equal(backups.length, 1, "helper should create exactly one backup for changed Preferences");

const arcHome = fs.mkdtempSync(path.join(os.tmpdir(), "dynamac-arc-seed-"));
const arcResult = childProcess.spawnSync(process.execPath, [scriptPath], {
  env: {
    ...process.env,
    HOME: arcHome,
    DYNAMAC_FORCE_ARC_PROFILE_SEED: "1",
    DYNAMAC_BROWSER_PROFILE_NAME: "snuffles"
  },
  encoding: "utf8"
});
assert.equal(arcResult.status, 0, arcResult.stderr || arcResult.stdout);
assert.match(arcResult.stdout, /Arc: seeded Chromium profile 'snuffles'/);
const arcRoot = path.join(arcHome, "Library", "Application Support", "Arc", "User Data");
const arcPrefs = JSON.parse(fs.readFileSync(path.join(arcRoot, "Default", "Preferences"), "utf8"));
const arcLocalState = JSON.parse(fs.readFileSync(path.join(arcRoot, "Local State"), "utf8"));
assert.equal(arcPrefs.browser.allow_javascript_apple_events, true);
assert.equal(arcPrefs.profile.name, "snuffles");
assert.equal(arcLocalState.profile.info_cache.Default.name, "snuffles");
assert.equal(arcLocalState.profile.last_used, "Default");

console.log("browser Apple Events helper test passed.");
