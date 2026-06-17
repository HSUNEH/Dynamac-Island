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

## Runtime status source

`npm run status:write` and `npm run native:start` now include a `Mac Context` status item from `scripts/write-mac-activity-status.js` via `src/mac-activity-status.js`.

Key fields:

- `agent: "Mac Context"`
- `activityType: "macContext"`
- `activeApp`: current frontmost app name when available
- `activeWindow`: front window title when Accessibility/System Events allows it
- `uiTreeContext`: small summarized context, or an unavailable summary when permission is missing
- `permissionStatus.accessibility`: `granted`, `denied`, or `unknown`
- `permissionStatus.screenRecording`: `granted`, `denied`, or `unknown`
- `degradationState`: human-readable reason for reduced capability
- `statusSource: "scripts/write-mac-activity-status.js"`

The app name probe uses `NSWorkspace.shared.frontmostApplication` through local Swift when available because it does not need Accessibility. The permission-status detector uses injectable platform probes for Accessibility and Screen Recording, then normalizes them into `status`, `diagnostic`, and `available` fields so tests can exercise granted/denied/unavailable states without touching TCC. The window title and UI-tree-like summary are reduced unless Accessibility is granted. Screen Recording is only preflighted and reported; this MVP does not request it or take screenshots.

Disable the experimental status item with:

```sh
DYNAMAC_DISABLE_MAC_CONTEXT_HUD=1 npm run status:write
```

## HUD display behavior

`src/activity-router.js` maps `Mac Context` to the `macContext` activity type. It ranks below transient clipboard/HUD events, shelf/drop, and active timers, but above Now Playing/battery so the active context can surface in compact HUD mode when no higher-priority immediate HUD or live activity is active.

The native overlay decodes the routed generic activity and renders it with the `macwindow` glyph. Expanded mode shows the compact label plus degradation detail.

## Permission and degradation contract

This MVP intentionally does not:

- bypass Accessibility or Screen Recording consent;
- install a background automation daemon;
- require remote MCP/HTTP services;
- vendor a full macOS-MCP implementation;
- use private always-on hooks.

Expected degradation examples:

- Accessibility denied: active app may still be shown, window title/UI tree is degraded.
- Swift unavailable: permission probes become `unknown`, but the writer keeps producing a valid status payload when other probes work.
- Screen Recording denied: status reports it, screenshots remain disabled because this slice does not need screenshots.

## Comparison against main

- Capability: main shows media/clipboard/timer/HUD/battery; this branch adds read-only active app/window context and permission/degradation status.
- Permission burden: main already uses some local app/media probes; this branch adds no required Screen Recording and only uses Accessibility when macOS has already granted it for window title/UI summary.
- Reliability: output remains a local atomic JSON status file and is test-covered with fixtures for full and degraded permission states.
- UX: users see either the active app/window context or a clear degradation reason in the Dynamic Island HUD instead of a silent missing feature.
- Regression risk: contained to status serialization, activity routing, and native generic routed display mapping; no main merge is performed by this branch.

## Verification

Relevant commands:

```sh
npm run test:mac-activity-status
npm run test:activity-router
npm run test:native-overlay-contract
npm run native:smoke
npm run check
```
