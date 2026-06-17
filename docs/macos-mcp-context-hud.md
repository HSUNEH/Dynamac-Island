# Experimental macOS-MCP-inspired Context HUD

This branch adds a local, read-only Mac Context status item to the existing Dynamac Island status writer and native HUD pipeline.

## Practical pattern borrowed from macOS-MCP

The inspected macOS-MCP pattern is not vendored. Dynamac only adopts the small local pattern that fits this app:

- expose a stable local status source instead of a remote service;
- report permission/degradation status before assuming a capability works;
- keep active app/window context read-only;
- avoid permission bypasses, private always-on hooks, and remote network dependencies;
- degrade visibly when Accessibility, Screen Recording, Swift probes, or System Events are unavailable.

Reference observed: `cyanheads/macos-mcp-server` documents local macOS tools such as `macos_check_permissions` and `macos_manage_apps frontmost`, including Accessibility and Screen Recording diagnostics. Dynamac mirrors that shape as a local status file item rather than an MCP server.

## Runtime status source contract

`npm run status:write` and `npm run native:start` now include a `Mac Context` status item from `scripts/write-mac-activity-status.js` via `src/mac-activity-status.js`. This is the HUD-facing status source. It writes through the existing Dynamac status JSON pipeline; it does not start a network server, register an MCP transport, or write to remote services.

For a standalone local API/command contract, `npm run mac-context:status -- --pretty` prints one deterministic JSON payload from `scripts/mac-context-status.js`. It exposes the same read-only active app/window context plus normalized permission/degradation status without starting Electron, a native overlay, an MCP server, or any remote network service. Contract tests use `--fixture` and `--now` so callers can validate exact schema behavior without touching macOS TCC.

HUD-facing status item fields:

- `agent: "Mac Context"`
- `activityType: "macContext"`
- `activeApp`: current frontmost app name when available
- `activeWindow`: front window title when Accessibility/System Events allows it
- `uiTreeContext`: small summarized context, or an unavailable summary when permission is missing
- `permissionStatus.accessibility`: `granted`, `denied`, or `unknown`
- `permissionStatus.screenRecording`: `granted`, `denied`, or `unknown`
- `degradationState`: human-readable reason for reduced capability
- `statusSource: "scripts/write-mac-activity-status.js"`

Contract notes for consumers:

- Treat the item as read-only context. It is a snapshot of frontmost app/window state and permission/tool availability, not a command surface for focusing, resizing, launching, or closing apps.
- Treat `agent: "Mac Context"` and `activityType: "macContext"` as the stable routing keys.
- Treat `statusSource` as the local producer identity. The native HUD should not infer that an MCP server is present just because the pattern is macOS-MCP-inspired.
- Treat `activeApp` and `activeWindow` as independently optional. `activeApp` can be available without Accessibility; `activeWindow` usually needs Accessibility/System Events.
- Treat `uiTreeContext.available` as authoritative for whether a UI-tree summary can be shown. Do not fabricate deeper UI nodes when it is `false`.
- Treat `permissionStatus.*.available` as a convenience boolean derived from `status === "granted"`; preserve the original `status` and `diagnostic` for display/debugging.
- Treat `degradationState` as user-visible text safe for compact/expanded HUD surfaces. It should be surfaced instead of hiding the Mac Context item when capability is reduced.

Standalone command schema:

- `schemaVersion: 1`
- `kind: "dynamac.macContext.statusSource"`
- `sampledAt`: ISO timestamp, injectable with `--now` for tests
- `result`: structured generation result. `result.ok` means the local command completed and `result.status: "success"`/`result.success: true` means active app/window context, permission preflight, and UI-tree summary were all available; otherwise it remains a valid degraded payload with booleans explaining the missing capability.
- `statusSource: "scripts/mac-context-status.js"`
- `source`: `local-macos-context-provider` or `local-macos-context-status-only`
- `activeApp`, `activeWindow`, `uiTreeContext`, `permissionStatus`, `degradationState`

Example degraded shape, with unimportant fields omitted:

```json
{
  "schemaVersion": 1,
  "kind": "dynamac.macContext.statusSource",
  "result": {
    "ok": true,
    "status": "degraded",
    "success": false,
    "degradation": {
      "degraded": true,
      "requiredSourcesUnavailable": true,
      "unavailableSources": ["activeWindow", "uiTreeContext"],
      "requiredPermissionsUnavailable": true,
      "unavailablePermissions": [{ "name": "accessibility", "status": "denied", "available": false }]
    }
  },
  "activeApp": { "name": "Safari", "bundleIdentifier": "com.apple.Safari", "pid": 123 },
  "activeWindow": "",
  "uiTreeContext": { "available": false, "summary": "Accessibility UI tree summary unavailable without user-granted Accessibility permission.", "nodes": [] },
  "permissionStatus": {
    "accessibility": { "status": "denied", "diagnostic": "preflight-denied", "available": false },
    "screenRecording": { "status": "granted", "diagnostic": "preflight-granted", "available": true }
  },
  "degradationState": "Accessibility denied; front window title and UI tree are reduced until permission is granted in System Settings."
}
```

The app name probe uses `NSWorkspace.shared.frontmostApplication` through local Swift when available because it does not need Accessibility. The permission-status detector uses injectable platform probes for Accessibility and Screen Recording, then normalizes them into `status`, `diagnostic`, and `available` fields so tests can exercise granted/denied/unavailable states without touching TCC. The window title and UI-tree-like summary are reduced unless Accessibility is granted. Screen Recording is only preflighted and reported; this MVP does not request it or take screenshots.

For permission-only checks, `collectMacContextStatusOnly()` exposes the same normalized `permissionStatus` plus a status-only `degradationState` without reading active app/window fixtures or invoking active app/window retrieval. Its `source` is `local-macos-context-status-only`, `activeApp` is `null`, `activeWindow` is empty, and `uiTreeContext.available` is `false` by design so callers can preflight TCC/tool availability before sampling active context. In status-only mode, `result.ok` can still be `true` while `result.status` is `degraded`; that means the command worked and accurately reported reduced capability.

Disable the experimental status item with:

```sh
DYNAMAC_DISABLE_MAC_CONTEXT_HUD=1 npm run status:write
```

## HUD display behavior

`src/activity-router.js` maps `Mac Context` to the `macContext` activity type. It ranks below transient clipboard/HUD events, shelf/drop, and active timers, but above Now Playing/battery so the active context can surface in compact HUD mode when no higher-priority immediate HUD or live activity is active.

Consumption flow:

1. `scripts/write-mac-activity-status.js` samples Mac activity and includes the Mac Context item in the status JSON.
2. `src/mac-activity-status.js` calls `collectMacContextStatus()` unless `enableMacContext === false` or `DYNAMAC_DISABLE_MAC_CONTEXT_HUD=1` is set.
3. `src/mac-context-provider.js` converts provider data into an activity item through `macContextProviderToActivity()`.
4. `src/activity-router.js` recognizes `Mac Context`, assigns `activityType: "macContext"`, and exposes compact/expanded surfaces in `activityRouter`.
5. `native/DynamacIslandNative.swift` decodes the routed generic activity and renders the `macwindow` glyph/label in compact mode. Expanded mode shows the active app/window label when available and the degradation detail when reduced.

Display rules:

- Compact mode should prefer the active app label (`compactSurface.label`) so the island remains glanceable.
- Expanded mode may show `activeWindow` when available, but must fall back to `degradationState` when the window title/UI tree is unavailable.
- Permission failures are not hidden. They remain visible as warning/error Mac Context activity details so the user knows whether Accessibility, Screen Recording, Swift probes, System Events, or an MCP-like acquisition source is unavailable.
- The HUD must not prompt for, bypass, or auto-grant macOS permissions. It only displays diagnostics produced by the local status source.

## Permission and degradation contract

This MVP intentionally does not:

- bypass Accessibility or Screen Recording consent;
- install a background automation daemon;
- require remote MCP/HTTP services;
- vendor a full macOS-MCP implementation;
- use private always-on hooks.

Expected degradation examples:

- Accessibility denied: active app may still be shown, and the HUD says front window title/UI tree are reduced until Accessibility is granted in System Settings.
- Accessibility unknown: diagnostics such as a Swift probe timeout are surfaced in `degradationState` instead of silently hiding the reason.
- Swift unavailable: permission probes become `unknown`, but the writer keeps producing a valid status payload when other probes work.
- Screen Recording denied or unknown: status reports the explicit Screen Recording reason, and screenshots/screen-derived context remain disabled because this slice does not need screenshots.

Degradation semantics:

- Command-level success and capability-level success are separate. A payload with `result.ok: true` and `result.status: "degraded"` is a valid successful command result that found missing permissions/tools.
- `permissionStatus.accessibility.status` governs whether active window title and UI-tree summaries can be trusted. Denied/unknown Accessibility should produce visible degraded HUD text.
- `permissionStatus.screenRecording.status` is reported for transparency, but this MVP does not request screenshots or gate active app/window text on Screen Recording.
- `acquisitionStatus.activeWindow.reason` classifies acquisition problems as `permissionDenied`, `toolUnavailable`, `mcpUnreachable`, `empty`, or `statusOnly` when available. The HUD-facing `degradationState` folds those reasons into human-readable text.
- Missing tools or unreachable MCP-like acquisition paths are not fatal to the status writer. They become `unknown`/`degraded` diagnostics while the local fallback context continues when possible.
- Invalid standalone command input is different from degradation: malformed fixtures, unknown flags, and invalid `--now` values exit non-zero and print an error instead of producing a misleading status payload.

## Comparison against main

- Capability: main shows media/clipboard/timer/HUD/battery; this branch adds read-only active app/window context and permission/degradation status.
- Permission burden: main already uses some local app/media probes; this branch adds no required Screen Recording and only uses Accessibility when macOS has already granted it for window title/UI summary.
- Reliability: output remains a local atomic JSON status file and is test-covered with fixtures for full and degraded permission states.
- UX: users see either the active app/window context or a clear degradation reason in the Dynamic Island HUD instead of a silent missing feature.
- Regression risk: contained to status serialization, activity routing, and native generic routed display mapping; no main merge is performed by this branch.

`src/mac-context-main-comparison.js` is the runnable comparison module for this experimental branch. It uses a stable main baseline that has no Mac Context status source, summarizes the experimental `dynamac.macContext.statusSource` payload, and fails if the branch stops reporting the expected read-only fields: `activeApp`, `activeWindow`, `uiTreeContext`, `permissionStatus`, `degradationState`, and `statusSource`. The comparison test also passes a frozen routed HUD snapshot into the module and verifies that running the comparison reports the Mac Context HUD display without mutating HUD state. Run it with `npm run test:mac-context-main-comparison`.

## Verification

Relevant commands:

```sh
npm run test:mac-context-provider
npm run test:mac-context-status-only
npm run test:mac-context-main-comparison
npm run test:mac-context-status-command
npm run test:mac-activity-status
npm run test:activity-router
npm run test:native-overlay-contract
npm run native:smoke
npm run check
```
