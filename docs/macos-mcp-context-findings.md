# macOS-MCP context findings

This note records the macOS-MCP research used for the experimental read-only active app/window context HUD slice. It is intentionally a findings document, not vendored source.

## Sources inspected

Network access succeeded on 2026-06-17; no blocker was encountered.

- `cyanheads/macos-mcp-server` README: `https://raw.githubusercontent.com/cyanheads/macos-mcp-server/main/README.md`
- Tool definitions directory via GitHub API: `https://api.github.com/repos/cyanheads/macos-mcp-server/contents/src/mcp-server/tools/definitions?ref=main`
- `macos-check-permissions.tool.ts`: `https://raw.githubusercontent.com/cyanheads/macos-mcp-server/main/src/mcp-server/tools/definitions/macos-check-permissions.tool.ts`
- `macos-manage-apps.tool.ts`: `https://raw.githubusercontent.com/cyanheads/macos-mcp-server/main/src/mcp-server/tools/definitions/macos-manage-apps.tool.ts`
- `macos-manage-windows.tool.ts`: `https://raw.githubusercontent.com/cyanheads/macos-mcp-server/main/src/mcp-server/tools/definitions/macos-manage-windows.tool.ts`
- `osascript-service.ts`: `https://raw.githubusercontent.com/cyanheads/macos-mcp-server/main/src/services/osascript/osascript-service.ts`
- `system-info-service.ts`: `https://raw.githubusercontent.com/cyanheads/macos-mcp-server/main/src/services/system-info/system-info-service.ts`

## Practical patterns to reuse

1. Local-first command surface.
   macOS-MCP's practical path is a local stdio server that shells out to macOS commands and JXA/AppleScript. Dynamac should keep the MVP as a local status writer command consumed by the existing Electron/native status-file readers. No remote service is required.

2. Read-only active context before control.
   The useful read-only subset is equivalent to `macos_manage_apps action=frontmost` plus safe window listing/title reads from `macos_manage_windows action=list`. Dynamac should expose active app name/bundle id/PID and frontmost window title when available, but must not launch, quit, focus, move, resize, close, hide, or show apps as part of this MVP.

3. Permission diagnostics are first-class data.
   `macos_check_permissions` reports Accessibility, Screen Recording, Finder Automation, notifications, and the calling process so users know which app needs consent. Dynamac should surface Accessibility and Screen Recording status in the HUD/status payload and include the calling process or source where practical.

4. Degrade visibly instead of failing silently.
   macOS-MCP treats permission failures as diagnosable states. Dynamac should convert denied/missing tools/timeouts into `warning` or `idle` status items with human-readable degradation text such as "Accessibility unavailable; showing active app only" instead of throwing or hiding the provider.

5. Safer subprocess execution.
   The inspected osascript service uses `execFile` with argv arrays, timeouts, and permission-error classification. Dynamac's Node status writer should continue using bounded subprocess calls and avoid shell interpolation for dynamic values.

6. No broad vendoring.
   macOS-MCP includes write-capable tools and HTTP transport. Dynamac only needs the patterns above: local command sampling, explicit permission checks, structured payloads, and visible degradation. Full MCP server code, write actions, and network transports are out of scope.

## Constraints for this branch

- Read-only and local: active app/window context is sampled from local macOS APIs or built-in tools only.
- Consent-respecting: do not bypass macOS Accessibility or Screen Recording permissions, and do not use private always-on hooks.
- Permission-light: active app identity can be shown even when deeper window/UI tree context is unavailable; Screen Recording is required only for screenshot-like capability and should not gate text-only active app display.
- Graceful degradation: unavailable permissions/tools become explicit HUD/status text.
- Brownfield fit: data flows through existing `scripts/write-mac-activity-status.js`, `src/mac-activity-status.js`, Activity Router, status JSON, and native/Electron HUD readers.

## Dynamac status contract implication

A compliant experimental payload should include a status item that represents:

- `activeApp`: app name and, when available, bundle identifier/PID.
- `activeWindow`: focused/frontmost window title when permitted and available.
- `uiTreeContext`: optional summarized accessibility context; omit or mark unavailable when permissions are denied.
- `permissionStatus`: Accessibility and Screen Recording availability plus diagnostic detail.
- `degradationState`: human-readable explanation of reduced capability.
- `statusSource`: the local writer/source that produced the snapshot.

The HUD should render the active app/window when available and render the degradation status when permissions or tools are unavailable.
