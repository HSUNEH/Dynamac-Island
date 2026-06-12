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

console.log("browser Apple Events helper test passed.");
