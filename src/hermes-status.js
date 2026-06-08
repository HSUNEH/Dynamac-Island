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

function summarizeGatewayProfiles(gateways) {
  if (gateways.length === 0) {
    return "No gateway process line available.";
  }

  const profiles = Array.from(new Set(gateways.map(gatewayProfileFromProcessLine))).sort();
  return `Profiles: ${profiles.join(", ")}.`;
}

function latestSessionFromSessionsJson(hermesHome) {
  const sessionsPath = path.join(hermesHome, "sessions", "sessions.json");
  const sessions = readJsonIfExists(sessionsPath);

  if (!sessions || typeof sessions !== "object" || Array.isArray(sessions)) {
    return null;
  }

  return Object.values(sessions)
    .filter((session) => session && typeof session === "object")
    .sort((left, right) => Date.parse(right.updated_at || 0) - Date.parse(left.updated_at || 0))[0] || null;
}

function fallbackStatusPayload(now, reason) {
  return {
    statuses: [
      {
        agent: "Snuffles",
        state: "warning",
        task: "Hermes runtime snapshot unavailable",
        updatedAt: now.toISOString(),
        detail: reason || "Dynamac Island could not collect local Hermes runtime status."
      },
      {
        agent: "Hermes Gateway",
        state: "warning",
        task: "Gateway status unknown",
        updatedAt: now.toISOString(),
        detail: "Runtime collection failed before gateway status could be summarized."
      },
      {
        agent: "Active Session",
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
  const gateways = listGatewayProcesses(options.processList);
  const latestSession = latestSessionFromSessionsJson(hermesHome);
  const statuses = [];

  statuses.push({
    agent: "Snuffles",
    state: gateways.length > 0 ? "running" : "warning",
    task: gateways.length > 0 ? "Watching Hermes runtime" : "Hermes gateway not detected",
    updatedAt: now.toISOString(),
    detail:
      gateways.length > 0
        ? `${gateways.length} Hermes gateway process${gateways.length === 1 ? "" : "es"} active on this Mac.`
        : "No local Hermes gateway process was found in the process table."
  });

  statuses.push({
    agent: "Hermes Gateway",
    state: gateways.length > 0 ? "running" : "warning",
    task: gateways.length > 0 ? "Gateway online" : "Gateway offline",
    updatedAt: now.toISOString(),
    detail: summarizeGatewayProfiles(gateways)
  });

  if (latestSession) {
    const suspended = latestSession.suspended ? "suspended" : "active";
    const resume = latestSession.resume_pending ? ", resume pending" : "";

    statuses.push({
      agent: "Active Session",
      state: latestSession.suspended ? "warning" : "running",
      task: "Latest Hermes session",
      updatedAt: latestSession.updated_at || now.toISOString(),
      detail: `Session state: ${suspended}${resume}. Title, token count, and cost are hidden on the overlay.`
    });
  } else {
    statuses.push({
      agent: "Active Session",
      state: "warning",
      task: "No session index found",
      updatedAt: now.toISOString(),
      detail: "Could not read ~/.hermes/sessions/sessions.json."
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
  buildHermesStatusPayload,
  fallbackStatusPayload,
  gatewayProfileFromProcessLine,
  summarizeGatewayProfiles,
  writeHermesStatusSnapshot
};
