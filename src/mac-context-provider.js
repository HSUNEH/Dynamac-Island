const childProcess = require("node:child_process");
const crypto = require("node:crypto");

function truncate(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function runCommand(command, args, options = {}) {
  try {
    return childProcess.execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 1800,
      killSignal: "SIGKILL",
      ...options
    }).trim();
  } catch (_error) {
    return "";
  }
}

function runCommandResult(command, args, options = {}) {
  try {
    const stdout = childProcess.execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 1800,
      killSignal: "SIGKILL",
      ...options
    });
    return { ok: true, stdout: stdout.trim(), stderr: "", error: "" };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error.stdout || "").trim(),
      stderr: String(error.stderr || "").trim(),
      error: error.message || String(error)
    };
  }
}

function normalizeActiveApplicationInfo(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const name = String(value.name || value.localizedName || "").trim();
  if (!name) return null;
  const pid = Number(value.pid ?? value.processIdentifier);
  return {
    name,
    bundleIdentifier: String(value.bundleIdentifier || "").trim(),
    pid: Number.isFinite(pid) ? pid : null
  };
}

function parseActiveApplicationText(output) {
  const parts = String(output || "").split("||").map((part) => part.trim());
  return normalizeActiveApplicationInfo({
    name: parts[0],
    bundleIdentifier: parts[1] || "",
    pid: parts[2]
  });
}

function collectActiveApplicationInfo(options = {}) {
  if (options.activeAppInfo !== undefined) return normalizeActiveApplicationInfo(options.activeAppInfo);
  if (options.activeAppText !== undefined) return parseActiveApplicationText(options.activeAppText);

  const swift = runCommand("swift", ["-e", [
    "import AppKit",
    "if let app = NSWorkspace.shared.frontmostApplication {",
    "  print(\"\\(app.localizedName ?? \"\")||\\(app.bundleIdentifier ?? \"\")||\\(app.processIdentifier)\")",
    "}"
  ].join("\n")], { timeout: 1500 });
  const swiftInfo = parseActiveApplicationText(swift);
  if (swiftInfo) return swiftInfo;

  const osascript = runCommand("osascript", [
    "-e",
    "tell application \"System Events\" to get name of first application process whose frontmost is true"
  ], { timeout: 700 });
  return osascript ? { name: osascript, bundleIdentifier: "", pid: null } : null;
}

function normalizePermissionProbeResult(name, result, options = {}) {
  if (options[`${name}Permission`] !== undefined) {
    return { status: options[`${name}Permission`] ? "granted" : "denied", diagnostic: "fixture" };
  }
  if (!result || !result.ok) {
    return { status: "unknown", diagnostic: truncate(result?.stderr || result?.error || "Probe unavailable.", 180) };
  }
  const text = String(result.stdout || "").trim().toLowerCase();
  if (text === "granted" || text === "true") return { status: "granted", diagnostic: "preflight-granted" };
  if (text === "denied" || text === "false") return { status: "denied", diagnostic: "preflight-denied" };
  return { status: "unknown", diagnostic: truncate(result.stdout || "Unexpected permission probe output.", 180) };
}

function permissionStatusWithAvailability(status) {
  const normalized = status && typeof status === "object" ? status : { status: "unknown", diagnostic: "missing permission status" };
  return {
    ...normalized,
    available: normalized.status === "granted"
  };
}

function invokePermissionProbe(name, probe) {
  try {
    const value = probe();
    if (typeof value === "boolean") return { ok: true, stdout: value ? "granted" : "denied", stderr: "", error: "" };
    if (typeof value === "string") return { ok: true, stdout: value, stderr: "", error: "" };
    if (value && typeof value === "object") return value;
    return { ok: false, stdout: "", stderr: "", error: `${name} permission probe returned no result` };
  } catch (error) {
    return { ok: false, stdout: "", stderr: "", error: error.message || String(error) };
  }
}

function defaultPermissionProbes() {
  return {
    accessibility: () => runCommandResult("swift", [
      "-e",
      "import ApplicationServices\nprint(AXIsProcessTrusted() ? \"granted\" : \"denied\")"
    ], { timeout: 1500 }),
    screenRecording: () => runCommandResult("swift", [
      "-e",
      "import CoreGraphics\nprint(CGPreflightScreenCaptureAccess() ? \"granted\" : \"denied\")"
    ], { timeout: 1500 })
  };
}

function collectMacPermissionStatus(options = {}) {
  if (options.permissionStatus !== undefined) {
    return {
      accessibility: permissionStatusWithAvailability(options.permissionStatus.accessibility),
      screenRecording: permissionStatusWithAvailability(options.permissionStatus.screenRecording)
    };
  }

  const probes = {
    ...defaultPermissionProbes(),
    ...(options.permissionProbes || {})
  };
  const accessibilityProbe = options.accessibilityProbeResult || invokePermissionProbe("accessibility", probes.accessibility);
  const screenRecordingProbe = options.screenRecordingProbeResult || invokePermissionProbe("screenRecording", probes.screenRecording);
  return {
    accessibility: permissionStatusWithAvailability(normalizePermissionProbeResult("accessibility", accessibilityProbe, options)),
    screenRecording: permissionStatusWithAvailability(normalizePermissionProbeResult("screenRecording", screenRecordingProbe, options))
  };
}

function collectActiveWindowTitle(options = {}) {
  if (options.activeWindowTitle !== undefined) return String(options.activeWindowTitle || "").trim();
  const output = runCommand("osascript", [
    "-e",
    "tell application \"System Events\" to tell (first application process whose frontmost is true) to if exists front window then get name of front window else return \"\""
  ], { timeout: 700 });
  return output || "";
}

function buildUiTreeContext(activeApp, activeWindow, permissionStatus, options = {}) {
  if (options.uiTreeContext !== undefined) return options.uiTreeContext;
  const accessibility = permissionStatus?.accessibility?.status || "unknown";
  if (accessibility !== "granted") {
    return {
      available: false,
      summary: "Accessibility UI tree summary unavailable without user-granted Accessibility permission.",
      nodes: []
    };
  }
  return {
    available: true,
    summary: activeWindow ? `Front window for ${activeApp?.name || "active app"}: ${activeWindow}` : `Active app ${activeApp?.name || "unknown"} has no readable front window title.`,
    nodes: [{ role: "application", title: activeApp?.name || "" }, { role: "window", title: activeWindow || "" }].filter((node) => node.title)
  };
}

function permissionDiagnosticSuffix(status) {
  const diagnostic = truncate(status?.diagnostic || "", 120);
  return diagnostic ? ` (${diagnostic})` : "";
}

function macContextDegradationReasons(activeApp, activeWindow, permissionStatus, uiTreeContext) {
  const reasons = [];
  const accessibility = permissionStatus?.accessibility || { status: "unknown", diagnostic: "missing permission status" };
  const screenRecording = permissionStatus?.screenRecording || { status: "unknown", diagnostic: "missing permission status" };

  if (!activeApp?.name) reasons.push("Active application unavailable; showing Mac Context degraded state.");
  if (!activeWindow) reasons.push("Front window title unavailable; Accessibility or System Events may be unavailable.");

  if (accessibility.status === "denied") {
    reasons.push("Accessibility denied; front window title and UI tree are reduced until permission is granted in System Settings.");
  } else if (accessibility.status !== "granted") {
    reasons.push(`Accessibility status unknown${permissionDiagnosticSuffix(accessibility)}; front window title and UI tree are reduced until the local probe succeeds.`);
  }

  if (screenRecording.status === "denied") {
    reasons.push("Screen Recording denied; screenshot and screen-derived context stay disabled.");
  } else if (screenRecording.status !== "granted") {
    reasons.push(`Screen Recording status unknown${permissionDiagnosticSuffix(screenRecording)}; screenshot and screen-derived context stay disabled until the local probe succeeds.`);
  }

  if (!uiTreeContext?.available) reasons.push("UI tree summary unavailable; HUD is using the safest app/window-level context only.");
  return reasons;
}

function macContextDegradationState(activeApp, activeWindow, permissionStatus, uiTreeContext) {
  const reasons = macContextDegradationReasons(activeApp, activeWindow, permissionStatus, uiTreeContext);
  return reasons.length ? reasons.join("; ") : "Full read-only active app/window context available.";
}

function macPermissionStatusDegradationReasons(permissionStatus) {
  const reasons = [];
  const accessibility = permissionStatus?.accessibility || { status: "unknown", diagnostic: "missing permission status" };
  const screenRecording = permissionStatus?.screenRecording || { status: "unknown", diagnostic: "missing permission status" };

  if (accessibility.status === "denied") {
    reasons.push("Accessibility denied; active window title and UI tree context will stay reduced until permission is granted in System Settings.");
  } else if (accessibility.status !== "granted") {
    reasons.push(`Accessibility status unknown${permissionDiagnosticSuffix(accessibility)}; active window title and UI tree context will stay reduced until the local probe succeeds.`);
  }

  if (screenRecording.status === "denied") {
    reasons.push("Screen Recording denied; screenshot and screen-derived context stay disabled.");
  } else if (screenRecording.status !== "granted") {
    reasons.push(`Screen Recording status unknown${permissionDiagnosticSuffix(screenRecording)}; screenshot and screen-derived context stay disabled until the local probe succeeds.`);
  }

  return reasons;
}

function macPermissionStatusDegradationState(permissionStatus) {
  const reasons = macPermissionStatusDegradationReasons(permissionStatus);
  return reasons.length ? reasons.join("; ") : "Permission preflight passed; active app/window retrieval has not been invoked by this status-only API.";
}

function macContextActivityId(activeApp, activeWindow) {
  const key = `${activeApp?.bundleIdentifier || activeApp?.name || "unknown"}||${activeWindow || ""}`;
  return `mac-context-${crypto.createHash("sha1").update(key).digest("hex").slice(0, 10)}`;
}

function collectMacContextProvider(options = {}) {
  const activeApp = collectActiveApplicationInfo(options);
  const permissionStatus = collectMacPermissionStatus(options);
  const activeWindow = collectActiveWindowTitle(options);
  const uiTreeContext = buildUiTreeContext(activeApp, activeWindow, permissionStatus, options);
  const degradationState = macContextDegradationState(activeApp, activeWindow, permissionStatus, uiTreeContext);

  return {
    activeApp,
    activeWindow,
    uiTreeContext,
    permissionStatus,
    degradationState,
    statusSource: "scripts/write-mac-activity-status.js",
    source: "local-macos-context-provider"
  };
}

function collectMacContextStatusOnly(options = {}) {
  const permissionStatus = collectMacPermissionStatus(options);
  return {
    activeApp: null,
    activeWindow: "",
    uiTreeContext: {
      available: false,
      summary: "Status-only preflight did not request active app, active window, or Accessibility UI tree context.",
      nodes: []
    },
    permissionStatus,
    degradationState: macPermissionStatusDegradationState(permissionStatus),
    statusSource: "src/mac-context-provider.js#collectMacContextStatusOnly",
    source: "local-macos-context-status-only"
  };
}

function macContextProviderToActivity(providerContext) {
  const activeApp = providerContext?.activeApp || null;
  const activeWindow = providerContext?.activeWindow || "";
  const permissionStatus = providerContext?.permissionStatus || {
    accessibility: { status: "unknown", diagnostic: "missing permission status" },
    screenRecording: { status: "unknown", diagnostic: "missing permission status" }
  };
  const uiTreeContext = providerContext?.uiTreeContext || { available: false, summary: "UI tree summary unavailable.", nodes: [] };
  const degradationState = providerContext?.degradationState || macContextDegradationState(activeApp, activeWindow, permissionStatus, uiTreeContext);
  const hasContext = Boolean(activeApp?.name);
  const state = hasContext && permissionStatus.accessibility.status === "granted" ? "running" : (hasContext ? "warning" : "error");
  const appLabel = activeApp?.name || "Active app unavailable";
  const windowLabel = activeWindow ? ` · ${truncate(activeWindow, 42)}` : " · window degraded";
  const activityId = macContextActivityId(activeApp, activeWindow);

  return {
    agent: "Mac Context",
    activityType: "macContext",
    activityId,
    state,
    task: truncate(`${appLabel}${windowLabel}`, 80),
    detail: degradationState,
    source: "local-macos-context-writer",
    statusSource: providerContext?.statusSource || "scripts/write-mac-activity-status.js",
    activeApp: activeApp?.name || "",
    activeWindow: activeWindow || "",
    uiTreeContext,
    permissionStatus,
    degradationState,
    macContext: {
      activityType: "macContext",
      activityId,
      source: "local-macos-context-writer",
      metadata: {
        bundleIdentifier: activeApp?.bundleIdentifier || "",
        pid: activeApp?.pid || null,
        accessibility: permissionStatus.accessibility.status,
        screenRecording: permissionStatus.screenRecording.status
      },
      compactSurface: {
        activityType: "macContext",
        glyph: "macwindow",
        label: truncate(activeApp?.name || "Mac Context", 28)
      },
      expandedSurface: {
        activityType: "macContext",
        title: activeWindow ? `${activeApp?.name || "Mac Context"} · ${activeWindow}` : degradationState
      },
      persisted: false
    },
    metadata: {
      bundleIdentifier: activeApp?.bundleIdentifier || "",
      pid: activeApp?.pid || null,
      permissionStatus,
      degradationState,
      statusSource: providerContext?.statusSource || "scripts/write-mac-activity-status.js"
    }
  };
}

module.exports = {
  buildUiTreeContext,
  collectActiveApplicationInfo,
  collectActiveWindowTitle,
  collectMacContextProvider,
  collectMacContextStatusOnly,
  collectMacPermissionStatus,
  defaultPermissionProbes,
  invokePermissionProbe,
  macContextActivityId,
  macContextDegradationReasons,
  macContextDegradationState,
  macContextProviderToActivity,
  macPermissionStatusDegradationReasons,
  macPermissionStatusDegradationState,
  normalizeActiveApplicationInfo,
  normalizePermissionProbeResult,
  parseActiveApplicationText,
  permissionStatusWithAvailability,
  runCommand,
  runCommandResult
};
