const REQUIRED_MAC_CONTEXT_PERMISSIONS = Object.freeze([
  "accessibility",
  "screenRecording"
]);

const MAIN_PERMISSION_BASELINE = Object.freeze({
  branch: "main",
  macContextStatusSource: false,
  permissions: Object.freeze({
    accessibility: Object.freeze({
      status: "notRequired",
      available: true,
      requiredForMacContext: false,
      diagnostic: "main has no Mac Context HUD integration or UI-tree/window-title contract"
    }),
    screenRecording: Object.freeze({
      status: "notRequired",
      available: true,
      requiredForMacContext: false,
      diagnostic: "main has no Mac Context screenshot/screen-derived context contract"
    })
  })
});

const ALLOWED_EXPERIMENTAL_PERMISSION_STATUSES = Object.freeze([
  "granted",
  "denied",
  "unknown"
]);

function objectStatus(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeMainPermissionEntry(permissionName, mainBaseline = MAIN_PERMISSION_BASELINE) {
  const entry = mainBaseline.permissions?.[permissionName];
  return {
    name: permissionName,
    status: entry?.status || "missing",
    available: entry?.available === true,
    requiredForMacContext: entry?.requiredForMacContext === true,
    diagnostic: entry?.diagnostic || ""
  };
}

function normalizeExperimentalPermissionEntry(permissionName, payload) {
  const entry = payload?.permissionStatus?.[permissionName];
  const status = typeof entry?.status === "string" && entry.status ? entry.status : "missing";
  return {
    name: permissionName,
    status,
    available: entry?.available === true,
    requiredForMacContext: permissionName === "accessibility",
    diagnostic: entry?.diagnostic || ""
  };
}

function summarizePermissionBurden(payload, options = {}) {
  const permissions = options.requiredPermissions || REQUIRED_MAC_CONTEXT_PERMISSIONS;
  const mainBaseline = options.mainBaseline || MAIN_PERMISSION_BASELINE;
  const main = permissions.map((permissionName) => normalizeMainPermissionEntry(permissionName, mainBaseline));
  const experimental = permissions.map((permissionName) => normalizeExperimentalPermissionEntry(permissionName, payload));
  return {
    requiredPermissions: [...permissions],
    main,
    experimental
  };
}

function compareMacContextPermissionBurdenAgainstMain(payload, options = {}) {
  const mainBaseline = options.mainBaseline || MAIN_PERMISSION_BASELINE;
  const permissions = options.requiredPermissions || REQUIRED_MAC_CONTEXT_PERMISSIONS;
  const summary = summarizePermissionBurden(payload, { mainBaseline, requiredPermissions: permissions });
  const mainNames = summary.main.map((entry) => entry.name);
  const experimentalNames = summary.experimental.map((entry) => entry.name);
  const missingMainReports = permissions.filter((permissionName) => !mainNames.includes(permissionName));
  const missingExperimentalReports = summary.experimental
    .filter((entry) => !ALLOWED_EXPERIMENTAL_PERMISSION_STATUSES.includes(entry.status))
    .map((entry) => entry.name);
  const invalidExperimentalStatuses = summary.experimental
    .filter((entry) => !ALLOWED_EXPERIMENTAL_PERMISSION_STATUSES.includes(entry.status))
    .map((entry) => ({ name: entry.name, status: entry.status }));
  const mainRequiresMacContextPermission = summary.main.filter((entry) => entry.requiredForMacContext);
  const experimentalRequiresScreenRecording = summary.experimental.some((entry) => (
    entry.name === "screenRecording" && entry.requiredForMacContext
  ));
  const regressionRisks = [];

  if (!objectStatus(payload?.permissionStatus)) regressionRisks.push("experimental permissionStatus object missing");
  if (missingMainReports.length > 0) regressionRisks.push(`main baseline missing permission reports: ${missingMainReports.join(", ")}`);
  if (missingExperimentalReports.length > 0) regressionRisks.push(`experimental permission reports missing/invalid: ${missingExperimentalReports.join(", ")}`);
  if (mainRequiresMacContextPermission.length > 0) regressionRisks.push("main baseline unexpectedly requires Mac Context permissions");
  if (experimentalRequiresScreenRecording) regressionRisks.push("experimental branch must report Screen Recording without requiring it for Mac Context MVP");

  return {
    schemaVersion: 1,
    kind: "dynamac.macContext.permissionBurdenComparison",
    baseline: mainBaseline,
    requiredPermissions: [...permissions],
    main: summary.main,
    experimental: summary.experimental,
    result: {
      ok: regressionRisks.length === 0,
      consistentPermissionKeys: missingMainReports.length === 0 && missingExperimentalReports.length === 0,
      reportsAccessibility: summary.experimental.some((entry) => entry.name === "accessibility" && ALLOWED_EXPERIMENTAL_PERMISSION_STATUSES.includes(entry.status)),
      reportsScreenRecording: summary.experimental.some((entry) => entry.name === "screenRecording" && ALLOWED_EXPERIMENTAL_PERMISSION_STATUSES.includes(entry.status)),
      mainMacContextPermissionBurden: "none",
      experimentalMacContextPermissionBurden: "Accessibility is required only for activeWindow/UI-tree enrichment; Screen Recording is reported but not required for this MVP.",
      invalidExperimentalStatuses,
      regressionRisks
    }
  };
}

module.exports = {
  ALLOWED_EXPERIMENTAL_PERMISSION_STATUSES,
  MAIN_PERMISSION_BASELINE,
  REQUIRED_MAC_CONTEXT_PERMISSIONS,
  compareMacContextPermissionBurdenAgainstMain,
  normalizeExperimentalPermissionEntry,
  normalizeMainPermissionEntry,
  summarizePermissionBurden
};
