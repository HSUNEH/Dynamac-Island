const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    return null;
  }
}

function listGatewayProcesses(processList) {
  const source = processList ?? childProcess.execFileSync("ps", ["aux"], { encoding: "utf8" });
  return source
    .split("\n")
    .filter((line) => line.includes("hermes_cli.main") && line.includes("gateway run"));
}

function gatewayProfileFromProcessLine(line) {
  const profileMatch = line.match(/--profile\s+([^\s]+)/);
  return profileMatch ? profileMatch[1] : "default";
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function activeGatewayProfiles(gateways) {
  return uniqueSorted(gateways.map(gatewayProfileFromProcessLine));
}

function summarizeList(values, emptyLabel) {
  if (values.length === 0) {
    return emptyLabel;
  }

  return values.join(", ");
}

function listInstalledProfiles(hermesHome, fileSystem = fs) {
  const profilesDir = path.join(hermesHome, "profiles");
  let profiles = ["default"];

  try {
    const profileDirs = fileSystem
      .readdirSync(profilesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !name.startsWith("."));
    profiles = profiles.concat(profileDirs);
  } catch (_error) {
    // A single-profile Hermes install may not have profiles/ yet.
  }

  return uniqueSorted(profiles);
}

function sessionsPathForProfile(hermesHome, profile) {
  if (profile === "default") {
    return path.join(hermesHome, "sessions", "sessions.json");
  }

  return path.join(hermesHome, "profiles", profile, "sessions", "sessions.json");
}

function latestSessionFromSessionsJsonFile(sessionsPath) {
  const sessions = readJsonIfExists(sessionsPath);

  if (!sessions || typeof sessions !== "object" || Array.isArray(sessions)) {
    return null;
  }

  return Object.values(sessions)
    .filter((session) => session && typeof session === "object")
    .sort((left, right) => Date.parse(right.updated_at || 0) - Date.parse(left.updated_at || 0))[0] || null;
}

function latestSessionFromSessionsJson(hermesHome) {
  return latestSessionFromSessionsJsonFile(sessionsPathForProfile(hermesHome, "default"));
}

function latestSessionAcrossProfiles(hermesHome, profiles) {
  return profiles
    .map((profile) => ({
      profile,
      session: latestSessionFromSessionsJsonFile(sessionsPathForProfile(hermesHome, profile))
    }))
    .filter((entry) => entry.session)
    .sort((left, right) => Date.parse(right.session.updated_at || 0) - Date.parse(left.session.updated_at || 0))[0] || null;
}

function fallbackStatusPayload(now, reason) {
  return {
    statuses: [
      {
        agent: "Hermes Runtime",
        state: "warning",
        task: "Runtime snapshot unavailable",
        updatedAt: now.toISOString(),
        detail: reason || "Dynamac Island could not collect local Hermes runtime status."
      },
      {
        agent: "Installed Profiles",
        state: "warning",
        task: "Profile scan unavailable",
        updatedAt: now.toISOString(),
        detail: "Installed profile data is hidden when unavailable or unreadable."
      },
      {
        agent: "Latest Session",
        state: "warning",
        task: "Session status unavailable",
        updatedAt: now.toISOString(),
        detail: "Local session metadata is hidden when unavailable or unreadable."
      }
    ]
  };
}

function buildHermesStatusPayload(options = {}) {
  const hermesHome = options.hermesHome || path.join(os.homedir(), ".hermes");
  const now = options.now || new Date();
  const fileSystem = options.fs || fs;
  const gateways = listGatewayProcesses(options.processList);
  const installedProfiles = listInstalledProfiles(hermesHome, fileSystem);
  const runningProfiles = activeGatewayProfiles(gateways);
  const latestProfileSession = latestSessionAcrossProfiles(hermesHome, installedProfiles);
  const statuses = [];

  statuses.push({
    agent: "Hermes Runtime",
    state: gateways.length > 0 ? "running" : "warning",
    task:
      gateways.length > 0
        ? `${runningProfiles.length}/${installedProfiles.length} profiles online`
        : "No gateway online",
    updatedAt: now.toISOString(),
    detail:
      gateways.length > 0
        ? `Active gateway profiles: ${summarizeList(runningProfiles, "none")}. Installed profiles: ${summarizeList(installedProfiles, "none")}.`
        : `Installed profiles: ${summarizeList(installedProfiles, "none")}. No local Hermes gateway process was found.`
  });

  statuses.push({
    agent: "Installed Profiles",
    state: installedProfiles.length > 0 ? "running" : "warning",
    task: `${installedProfiles.length} profile${installedProfiles.length === 1 ? "" : "s"} installed`,
    updatedAt: now.toISOString(),
    detail: `Profiles: ${summarizeList(installedProfiles, "none")}.`
  });

  if (latestProfileSession) {
    const { profile, session } = latestProfileSession;
    const suspended = session.suspended ? "suspended" : "active";
    const resume = session.resume_pending ? ", resume pending" : "";
    const platform = session.platform ? ` on ${session.platform}` : "";

    statuses.push({
      agent: "Latest Session",
      state: session.suspended ? "warning" : "running",
      task: `${profile} session ${suspended}`,
      updatedAt: session.updated_at || now.toISOString(),
      detail: `Latest local session is ${suspended}${resume}${platform}. Title, token count, cost, paths, and raw IDs are hidden on the overlay.`
    });
  } else {
    statuses.push({
      agent: "Latest Session",
      state: "warning",
      task: "No session index found",
      updatedAt: now.toISOString(),
      detail: "Could not read any Hermes sessions/sessions.json from the installed profiles."
    });
  }

  return { statuses };
}

function writeHermesStatusSnapshot(options = {}) {
  const outputPath = options.outputPath;
  if (!outputPath) {
    throw new Error("outputPath is required");
  }

  const now = options.now || new Date();
  let payload;
  try {
    payload = buildHermesStatusPayload({ ...options, now });
  } catch (error) {
    payload = fallbackStatusPayload(now, error && error.message ? error.message : null);
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

  return { ok: true, outputPath, payload };
}

module.exports = {
  activeGatewayProfiles,
  buildHermesStatusPayload,
  fallbackStatusPayload,
  gatewayProfileFromProcessLine,
  latestSessionAcrossProfiles,
  latestSessionFromSessionsJson,
  listInstalledProfiles,
  summarizeList,
  writeHermesStatusSnapshot
};
