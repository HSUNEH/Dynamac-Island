#!/usr/bin/env node
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const home = os.homedir();
const DEFAULT_PROFILE_NAME = process.env.DYNAMAC_BROWSER_PROFILE_NAME || "snuffles";

function appExists(appName) {
  if (process.env.DYNAMAC_FORCE_ARC_PROFILE_SEED === "1" && appName === "Arc") return true;
  return fs.existsSync(path.join("/Applications", `${appName}.app`));
}

function ensureArcSnufflesProfile(roots, profileName = DEFAULT_PROFILE_NAME) {
  if (!appExists("Arc")) return [];
  const root = roots[0];
  const defaultDir = path.join(root, "Default");
  const localStatePath = path.join(root, "Local State");
  const preferencesPath = path.join(defaultDir, "Preferences");
  fs.mkdirSync(defaultDir, { recursive: true });

  let localState = {};
  if (fs.existsSync(localStatePath)) {
    try { localState = JSON.parse(fs.readFileSync(localStatePath, "utf8")); } catch { localState = {}; }
  }
  localState.profile = localState.profile || {};
  localState.profile.info_cache = localState.profile.info_cache || {};
  localState.profile.info_cache.Default = {
    ...(localState.profile.info_cache.Default || {}),
    name: profileName,
    user_name: profileName,
    is_using_default_name: false
  };
  localState.profile.last_used = localState.profile.last_used || "Default";
  localState.profile.last_active_profiles = localState.profile.last_active_profiles || ["Default"];
  fs.writeFileSync(localStatePath, JSON.stringify(localState, null, 2));

  if (!fs.existsSync(preferencesPath)) {
    fs.writeFileSync(preferencesPath, JSON.stringify({
      browser: { allow_javascript_apple_events: true },
      profile: {
        name: profileName,
        avatar_index: 0
      }
    }, null, 2));
  }
  return [preferencesPath];
}

const browserProfiles = [
  {
    name: "Google Chrome",
    appName: "Google Chrome",
    roots: [path.join(home, "Library/Application Support/Google/Chrome")]
  },
  {
    name: "Arc",
    appName: "Arc",
    roots: [
      path.join(home, "Library/Application Support/Arc/User Data"),
      path.join(home, "Library/Application Support/Arc"),
      path.join(home, "Library/Application Support/company.thebrowser.Browser"),
      path.join(home, "Library/Containers/company.thebrowser.Browser/Data/Library/Application Support/Arc/User Data"),
      path.join(home, "Library/Containers/company.thebrowser.Browser/Data/Library/Application Support/Arc")
    ]
  },
  {
    name: "Brave Browser",
    appName: "Brave Browser",
    roots: [path.join(home, "Library/Application Support/BraveSoftware/Brave-Browser")]
  },
  {
    name: "Microsoft Edge",
    appName: "Microsoft Edge",
    roots: [path.join(home, "Library/Application Support/Microsoft Edge")]
  }
];

function walkPreferences(root) {
  const results = [];
  if (!fs.existsSync(root)) return results;
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!["Cache", "Code Cache", "GPUCache", "GrShaderCache", "ShaderCache", "Crashpad"].includes(entry.name)) {
          stack.push(full);
        }
      } else if (entry.isFile() && entry.name === "Preferences") {
        results.push(full);
      }
    }
  }
  return results;
}

function patchPreferenceFile(file) {
  let obj;
  try {
    obj = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return { file, changed: false, error: `parse failed: ${error.message}` };
  }
  obj.browser = obj.browser || {};
  const before = obj.browser.allow_javascript_apple_events;
  obj.browser.allow_javascript_apple_events = true;
  if (before === true) return { file, changed: false, alreadyEnabled: true };
  const backup = `${file}.dynamac-bak-${Date.now()}`;
  fs.copyFileSync(file, backup);
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
  return { file, changed: true, backup };
}

let foundAny = false;
for (const browser of browserProfiles) {
  let files = [...new Set(browser.roots.flatMap(walkPreferences))];
  if (!files.length && browser.name === "Arc") {
    const seeded = ensureArcSnufflesProfile(browser.roots);
    if (seeded.length) {
      console.log(`${browser.name}: seeded Chromium profile '${DEFAULT_PROFILE_NAME}' — ${path.dirname(seeded[0])}`);
      files = [...new Set(browser.roots.flatMap(walkPreferences))];
    }
  }
  if (!files.length) {
    console.log(`${browser.name}: no Chromium Preferences file found`);
    continue;
  }
  foundAny = true;
  for (const file of files) {
    const result = patchPreferenceFile(file);
    if (result.error) {
      console.log(`${browser.name}: ${result.error} — ${result.file}`);
    } else if (result.alreadyEnabled) {
      console.log(`${browser.name}: already enabled — ${result.file}`);
    } else if (result.changed) {
      console.log(`${browser.name}: enabled — ${result.file}`);
      console.log(`${browser.name}: backup — ${result.backup}`);
    }
  }
}

if (!foundAny) {
  process.exitCode = 1;
  console.log("No browser Preferences files found. Launch the browser once, finish first-run/onboarding, then run this again.");
}
