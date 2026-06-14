# Dynamac Island

Dynamac Island is a macOS notch-attached utility island for everyday Mac activity: Now Playing, clipboard, battery/charging, and later shelf/HUD-style signals. It is not a normal desktop app window: the Electron window is frameless, transparent, non-movable, always-on-top, and anchored to the physical top-center edge of the primary display so it visually attaches to the MacBook notch. A native AppKit overlay is also available for notch-accurate testing when Electron is clamped by macOS windowing behavior.

## Concept

Apple's Dynamic Island is a compact live-activity surface around the camera/sensor area. Its job is not to launch another app window; its job is to keep the most relevant ongoing activity visible, glanceable, and quickly controllable.

Dynamac Island follows that pattern for this Mac:

- **Small state:** collapsed native wings beside the hardware notch for the current most important activity.
- **Live activity:** general Mac utility signals that work without Hermes: Now Playing, local Timer, clipboard, battery/charging, Activity Router ranking, and later shelf/drop, volume/brightness HUD, calendar, and reminders.
- **Quick expansion:** click expansion for Now Playing detail and playback controls without opening a full app.
- **Multiple activities:** future rotation/swipe-like switching between active signals.

## Current State

- Greenfield Node/npm + Electron app.
- Notch-attached floating overlay, not a normal movable app window.
- Window source: `src/window-config.js` centers the island against `screen.getPrimaryDisplay().bounds` and pins `y` to the physical top edge.
- Native overlay source: `native/DynamacIslandNative.swift` builds with `swiftc` through `npm run native:start`, avoiding the SwiftPM/Xcode path for quick MacBook CLT testing.
- Native compact shape: on notched MacBook displays, the hardware notch area remains transparent and Dynamac paints only left/right wings beside the notch so it attaches to the occluded area instead of covering it; on non-notch/external displays, Dynamac uses one normal compact pill instead of leaving an empty center gap. Display topology changes, wake/unlock, and display-wake events trigger delayed notch re-measurement plus frame re-anchoring so the compact shape adapts after monitor connects/disconnects or main-display handoff. Mission Control and App Exposé start events animate the island into a tiny screen-center capsule before restoring it to the notch/top-center position, matching the system's windows-pull-in motion instead of leaving the overlay pinned at the notch.
- Runtime status source: Electron development watches `status/status.json`; native `npm run native:start` writes and refreshes a local Mac activity snapshot in `.build/status.json` while running, using a low-latency default refresh loop plus a native-to-writer refresh signal so play/pause and next/previous track metadata/artwork changes reach the island quickly; Spotify/Music MediaRemote snapshots are enriched with native app artwork and remote covers are materialized into a local `.build/artwork-cache` file before the native overlay reads them, instead of making the UI thread fetch CDN artwork.
- Local Timer MVP: Dynamac supports one local active timer as the first non-media live activity. Starting a timer creates a deterministic `Timer` status item with `durationSeconds`, `remainingSeconds`, lifecycle `state`, `startedAt`, `updatedAt`, `displayText`, `error`, and `replacedPrevious`; starting a second timer replaces a currently running timer and marks the new status with `replacedPrevious: true`. Stop and reset keep the Timer status serializable for inspection while releasing active compact overlay priority; reset immediately restores `remainingSeconds` to the original duration and stamps fresh `startedAt`/`updatedAt` timestamps. The native overlay can render the active Timer status directly in compact and expanded modes. Sound, system notifications, history, sync, and broader DynamicLake actions are deferred.
- Activity Router core: `src/activity-router.js` normalizes status items into deterministic local activities with stable `activityId`, `activityType`, `priority`, timestamps, transient expiry, status payload, compact/expanded surface summaries, source, metadata, reveal-ready path, and persistence flags. Compact selection uses the priority order volume/brightness HUD > clipboard > shelf/drop > timer > now playing > battery/future passive, then updated recency, creation time, and ID for deterministic ties. This is testable core logic only: native global volume/brightness event capture, native drag capture, Finder reveal actions, and clipboard history persistence are not implied by the router.
- Mac activity snapshot model: `Now Playing` collects media candidates from macOS MediaRemote/`nowplaying-cli`, Spotify/Music AppleScript enrichment, normal Arc active-Space YouTube/YouTube Music tab title+URL probes, browser YouTube/YouTube Music surfaces, CDP (`127.0.0.1:9222-9225`, configurable with `DYNAMAC_CDP_PORTS`), and the optional local browser media bridge (`127.0.0.1:17654`). The selected compact item is no longer chosen by a hard-coded service priority: while multiple surfaces are playing, Dynamac keeps the candidate that was already playing first (`firstSeenAt`) until it stops, then falls through to the next active candidate. MediaRemote bundle IDs are normalized into generic sources such as `spotify`, `music`, `tidal`, `melon`, `genie`, `youtube-music`, `browser-media`, or `now-playing`; service-specific probes only enrich missing artwork/page metadata. Normal Arc does not require `--load-extension`: Dynamac reads YouTube tab title/URL from Arc's active Space and merges it with MediaRemote when Arc is the current playing app. `npm run start:arc-media` remains available as a precision upgrade that launches ST's normal Arc profile/account with the bridge extension in a dedicated Snuffles Space for direct page duration/currentTime/channel heartbeat. To force browser-extension mode for Arc or Chrome, launch with `npm run start:arc-media` or `npm run start:chrome-media`, allow YouTube/Media loopback access to `127.0.0.1` when Arc asks, reload the media tab, then run `npm run diagnose:youtube`. `Clipboard` comes from the local text clipboard, and `Battery` from `pmset -g batt`. Hermes runtime status remains an optional/dev provider, not the default product surface.
- Now Playing native UI: notch mode shows only album art/YouTube thumbnail/music-note fallback on the left wing plus a white waveform playing indicator on the right wing; non-notch/external-display compact mode uses one centered pill with a compact trailing white waveform that stays after the artwork without consuming the pill; expanded mode keeps Dynamac's existing dark/media colors but borrows only the Apple DESIGN.md form language: product-first larger artwork, quiet chrome, 8pt rhythm, SF-style 17/21pt typography, notch-safe metadata placement on MacBook displays so the physical camera housing does not cover source/title text, split elapsed/duration labels, thin scrubber with a visible thumb and an intentionally narrow bar-only seek target, centered pill transport controls, draggable/clickable seek, and previous/play-pause/next vector controls. In expanded mode, clicking the album art or source/title/artist text opens the media source app/page, including activating Spotify for Spotify playback. Expanded mode automatically collapses back to compact mode after 5 seconds of no expanded-mode interaction by default. Notch-to-expanded transitions animate only the lightweight island shell, then fade media content in after resize so artwork-heavy Now Playing surfaces do not stutter.
- Validation model: each status item needs `agent`, `state`, `task`, `updatedAt`, and `detail`.
- Allowed states: `idle`, `running`, `success`, `warning`, `error`.
- Invalid JSON or invalid status fields are visible in the app as an error state.
- Fixture JSON files under `fixtures/` remain only for deterministic tests; they are not the product's default purpose.
- No credentials, deployment, or external network side effects; the YouTube media bridge is a local-only `127.0.0.1` endpoint used only while Dynamac is running.

## Dependencies

- macOS with Node.js and npm for source runs.
- Native overlay smoke tests require Apple Command Line Tools with `swiftc`; full Xcode is not required for `npm run native:start`.
- Runtime shell scripts use only Node.js built-in modules.
- The app UI dependency is Electron, declared as the sole npm dev dependency in `package.json`: `electron@^42.3.3`.
- `npm install` downloads Electron from `registry.npmjs.org`.

## Quick Install on Your MacBook

If you already have Node.js/npm and Git installed, use this one-liner:

```sh
git clone https://github.com/HSUNEH/dynamac-island.git ~/projects/dynamac-island && cd ~/projects/dynamac-island && npm install && npm start
```

Or use the included installer after cloning. This avoids piping a remote installer directly into a shell and lets you inspect the script first:

```sh
git clone https://github.com/HSUNEH/dynamac-island.git ~/projects/dynamac-island
cd ~/projects/dynamac-island
bash scripts/install-macbook.sh
```

If the checkout already exists, rerun:

```sh
cd ~/projects/dynamac-island
bash scripts/install-macbook.sh
```

After installation, relaunch anytime with:

```sh
cd ~/projects/dynamac-island
npm start
```

## Runbook

Use these commands from the local project directory on this MacBook:

```sh
cd ~/projects/dynamac-island
```

Install dependencies:

```sh
npm install
```

Launch the notch-attached Electron island:

```sh
npm start
```

Launch the native AppKit notch overlay for physical MacBook notch testing:

```sh
npm run native:start
```

Start a local single active Timer and write it into the watched status file:

```sh
npm run timer:start -- 5m --status status/status.json
```

Timer durations must be positive whole-number `s`, `m`, or `h` values. Invalid input is deterministic and does not write a status file; for example `npm run timer:start -- abc` exits non-zero and prints `{"ok":false,"error":"Timer duration must be a positive whole number followed by s, m, or h."}` on stderr. `0s` also exits non-zero with `Timer duration must be greater than 0 seconds.`

Run a fast native build/smoke test without leaving the overlay open:

```sh
npm run native:smoke
npm run test:notch-position
npm run test:hermes-status
```

Print real MacBook screen/notch diagnostics before launching the native overlay:

```sh
DYNAMAC_NATIVE_DIAG=1 npm run native:start
```

On notched MacBooks, macOS may expose `auxiliaryTopLeftArea` and `auxiliaryTopRightArea`; Dynamac uses the smaller of the position gap and width-derived gap between them plus a small `DYNAMAC_NOTCH_MARGIN` as the native cutout width. The compact height defaults to the measured notch/menu-bar top band only when it is in a tight 24–32 pt range, otherwise 30 pt for notched screens and 38 pt for non-notch displays. On non-notch or external displays, those notch areas are unavailable and Dynamac automatically switches to a single compact pill instead of leaving an empty center gap. If notch values are unavailable on a physical MacBook, it falls back to `DYNAMAC_NOTCH_WIDTH=184` and can be tuned on that MacBook.

For geometry QA, do not rely on screenshots alone: physical MacBook notches do not appear in macOS screenshots, and a fake notch derived from a wrong layout only proves the wrong layout. Use the live calibration loop on the real MacBook screen instead:

```sh
npm run native:calibrate
```

The calibration loop launches a transparent QA outline on top of the real display and lets you adjust the geometry while looking at the physical notch:

```text
w+ / w-       widen or narrow the notch cutout
h+ / h-       make the compact overlay taller or shorter
wing+ / wing- make the side nubs wider or narrower
r+ / r-       round or sharpen corners
save          write .dynamac-calibration.json
```

After `save`, normal launches automatically apply the saved machine-local geometry:

```sh
npm run native:start
```

For screenshot reports after calibration, you can still enable the QA silhouette and capture the result:

```sh
DYNAMAC_QA_NOTCH_SILHOUETTE=1 DYNAMAC_NATIVE_DIAG=1 npm run native:start
screencapture -x /tmp/dynamac-notch-qa.png
```

The saved `.dynamac-calibration.json` is ignored by git because notch geometry is per-machine.

Prefer `npm run native:start` for the current native overlay. `swift run Dynamac-Island` exercises the older SwiftPM MVP target, not the AppKit overlay path.

Run the automated Electron launch smoke test and packaging flow:

```sh
npm run smoke:launch
npm run package:mac
```

Validate status generation and fixtures:

```sh
npm run check
npm run check-readme
npm run test:notch-position
npm run test:hermes-status
npm run check-status
npm run check-status:valid
```

## Build a macOS `.app`

To create a local unsigned macOS app bundle:

```sh
cd ~/projects/dynamac-island
npm install
npm run package:mac
open dist
```

The packaged app is written to `dist/Dynamac Island-darwin-<arch>/Dynamac Island.app`. On Apple Silicon Macs this is usually:

```sh
open "dist/Dynamac Island-darwin-arm64/Dynamac Island.app"
```

Because this MVP is not signed or notarized yet, macOS Gatekeeper may warn when opening the `.app` outside the development machine. For local testing, use right-click → Open, or launch from Terminal with the `open` command above.

## MacBook Smoke Test

Run these checks on the target MacBook after `npm install`:

1. Run `npm run smoke:launch` from `~/projects/dynamac-island` and confirm it exits with "Smoke launch passed".
2. Run `npm run native:smoke` from `~/projects/dynamac-island` and confirm it prints "DYNAMAC_NATIVE_READY".
3. Run `npm run native:start` from `~/projects/dynamac-island` for the native AppKit notch overlay, or `npm start` for the Electron fallback.
4. Confirm compact mode leaves the hardware notch area uncovered and paints black wings beside the notch, not one centered pill over it.
5. If the cutout does not match the notch, run `DYNAMAC_NATIVE_DIAG=1 npm run native:start` and tune `DYNAMAC_NOTCH_WIDTH` from the printed `layout.notchCutoutWidth` value.
6. For geometry QA, run `npm run native:calibrate`, adjust the live overlay while looking at the physical notch, then `save` to write `.dynamac-calibration.json`.
7. For screenshot-based reports after calibration, launch with `DYNAMAC_QA_NOTCH_SILHOUETTE=1 DYNAMAC_NATIVE_DIAG=1 npm run native:start`, then capture `screencapture -x /tmp/dynamac-notch-qa.png`.
8. Confirm the compact surface uses the normal Mac utility status provider; Hermes runtime status is an optional/dev provider, not the required default on machines without Hermes.
9. Run `npm run test:notch-position` to verify the top-center anchoring contract.
10. Run `npm run test:hermes-status` to verify optional local runtime snapshot generation.

Run the README content validation test:

```sh
npm run check-readme
```

This test is runnable and fails if the README stops documenting the MacBook path, install and launch commands, notch-attached island behavior, Hermes status source, validation commands, current scope, or roadmap.

## Manual Update Verification

Use this exact path when headless UI automation cannot prove that the live island updates on screen.

1. Terminal 1: launch the app from the project directory:

```sh
cd ~/projects/dynamac-island
npm start
```

2. Confirm the floating pill is visible and attached to the notch/top-center area.
3. Terminal 2: inspect the generated runtime status file:

```sh
cd ~/projects/dynamac-island
npm run check-status
```

4. Observe that status entries describe Now Playing, Clipboard, and Battery instead of deterministic sample jobs.
5. For fixture-only development tests, validate deterministic fixture input separately:

```sh
npm run check-status:valid
```

6. To test invalid-input rendering in development, write malformed JSON to the watched file:

```sh
printf '{ "statuses": [\n' > status/status.json
```

7. Observe the running app without relaunching and confirm the pill shows an error state for the invalid status input.
8. Relaunch the native overlay to regenerate real Mac activity status:

```sh
npm run native:start
```

## Timer MVP Behavior

Dynamac Timer is a local-first, single-active-timer live activity for the compact notch overlay. It is the first non-media MVP surface and stays inside the existing status-file/native-overlay contract rather than adding cloud sync, credentials, new permissions, notifications, or broader DynamicLake widgets.

Start a timer with a positive whole-number duration:

```sh
npm run timer:start -- 5m --status status/status.json
```

Starting writes one `Timer` status item into the local watched status file. A valid running timer exposes deterministic status fields for automated checks: stable `id`, `durationSeconds`, current `remainingSeconds`, lifecycle `state: "running"`, ISO UTC `startedAt` and `updatedAt`, user-facing `displayText`, empty `error`, and `replacedPrevious`.

### Timer Replacement Semantics

Dynamac Timer is single-active-timer only. Starting a new timer while another timer is active replaces the previous active timer deterministically: the previous timer is removed from the active overlay/status path, the new timer becomes the only `Timer` status item, and the new timer serializes `replacedPrevious: true`. Starting a new timer after a completed `done` timer also replaces that completed status with the newly running timer; the completed timer is no longer shown as a second timer, and the new timer serializes `replacedPrevious: true` so local automation can tell that an existing Timer status was replaced.

While running, the compact notch overlay shows the Timer as the active local utility item with remaining-time text such as `Timer · 4m 30s remaining`. The status file remains local and inspectable at the chosen `--status` path, so Electron development watches `status/status.json` and the native overlay can decode the same Timer object through the existing status model.

When the countdown reaches zero, the Timer remains visible and serializable as complete: `remainingSeconds` becomes `0`, lifecycle state becomes `done`, and the user-visible text changes to done/completed copy instead of disappearing. Stop and reset are local state transitions on the same single timer model: stopped/reset timers are inactive for overlay priority, but they still serialize deterministically for status inspection; reset restores full remaining duration with `state: "reset"`.

Persistence and status expectations are intentionally local-first: Timer state is represented only by local files/status payloads and testable pure timer logic. There is no cloud sync, no account state, no paid service, no invasive macOS permission, and no notification/sound requirement for this MVP.

### Volume/Brightness HUD Core Model

`src/volume-hud-status.js` and `src/brightness-hud-status.js` implement the first DynaKeys-adjacent HUD slice as deterministic pure logic. They accept observed local output-volume or display-brightness input changes (`level`, optional mute/display/device metadata, `source`, `observedAt`) and return one transient `Volume` or `Brightness` activity with stable `activityId`, `activityType`, `priority`, `createdAt`, `updatedAt`, `expiresAt`, `isTransient`, serializable `status`, compact and expanded surfaces, local `source`, metadata, empty `revealReadyPath`, and `persisted: false`.

The models keep repeated changes inside a short burst as one activity, derive `initial`/`up`/`down`/`steady` plus volume mute/unmute transitions from the previous observed value, and start a fresh activity after expiry so old HUD state does not leak into later bursts. They are covered by `npm run test:volume-hud-status` and `npm run test:brightness-hud-status`, both included in `npm run check`.

Deferred: native global volume-key capture, brightness-key capture, global shortcut/action launchers, and direct compact-overlay rendering of these HUDs are not enabled by this slice. The models are ready for a future safe local observer without adding credentials, cloud sync, paid APIs, history persistence, or invasive permissions by default.

### Deferred DynamicLake-Inspired Features

The Timer MVP deliberately does not import the broader DynamicLake-inspired feature set. The following items are out of scope for the Timer MVP and should remain deferred to later slices:

- DynaDrop-style file drop, conversion, AirDrop/share-link, transcript, upload, and right-click actions are out of scope.
- DynaClip-style Finder companion, file shelf, clipboard history, and quick handoff workflows are out of scope.
- DynaKeys-style keyboard shortcuts, global command palettes, hotkey automation, brightness capture, native key observers, and action launchers are out of scope; only the volume HUD core status logic is implemented in this slice.
- DynaGlance-style calendar, weather, reminder, message, and multi-widget glance cards are out of scope.
- Call/meeting modules, notification mirroring, system notification delivery, and sound alerts are out of scope.
- Liquid Glass visual themes, external-display theme packs, timer history, multi-timer queues, expanded action controls, and third-party integrations are out of scope.

Those deferred modules can use the Timer's local status contract as a future pattern, but they must not be required for starting, stopping, resetting, completing, or verifying one local Timer status item.

## Activity Router MVP

The Activity Router is the first shared DynamicLake-inspired core slice for choosing the compact surface. It is deliberately pure/testable JavaScript in `src/activity-router.js` rather than native event capture. Given local status items, it normalizes activity metadata and ranks compact eligibility in this deterministic order:

1. DynaKeys-style transient volume/brightness HUD statuses.
2. DynaClip-style clipboard activity from the current local clipboard classification.
3. DynaDrop/Shelf-style local shelf/drop status with optional `revealReadyPath` metadata.
4. Local Timer status.
5. Now Playing media status.
6. Battery and future passive activities.

Ties are deterministic: higher priority wins, then newer `updatedAt`, older `createdAt`, and stable `activityId`. Transient activities with an expired `expiresAt` are removed from compact eligibility. The generated Mac activity payload includes an `activityRouter` object with `rankedActivities` and the selected `compactSurface`, while preserving the existing `statuses` array consumed by the current Electron/native overlay paths.

Current implemented behavior is status/routing only. DynaKeys does not yet install global keyboard hooks or native volume/brightness observers; DynaClip does not persist clipboard history across restarts; DynaDrop/Shelf does not claim native drag capture or Finder reveal UI. Any shelf fixture/status should describe reveal readiness only when a validated path is already available, and the UI must not imply drag-and-drop works until a safe native pattern is added.

## Status File

The renderer still consumes a local JSON file because it gives the UI a simple, testable boundary. The important change is what writes that file:

- Product/default native path: `src/mac-activity-status.js` generates a snapshot from local Mac utility signals: Now Playing, Clipboard, and Battery.
- Timer path: `npm run timer:start -- <duration> --status <path>` uses `src/timer-start-entrypoint.js` to start a local Timer and write the active running timer into the same native status-store shape through `src/timer-status-store.js`; the write is local-only and replaces the Timer status model for the single active timer MVP. Stop and reset operations use the same status-store path: stopped/reset timers remain present as inactive `Timer` status items for deterministic native decoding, and a reset timer immediately serializes with full remaining duration, `state: "reset"`, and fresh reset timestamps. Valid examples include `5m`, `90s`, and `2h`; non-numeric input such as `abc` and non-positive input such as `0s` fail with stable JSON error output and non-zero exit status.
- Optional/dev path: `src/hermes-status.js` can still generate local Hermes runtime snapshots for Hermes-equipped development machines.
- Development path: `status/status.json` is watched so updates can be verified without relaunching.
- Packaged `.app` path: Electron userData, usually `~/Library/Application Support/Dynamac Island/status/status.json`.
- Fixture path: `fixtures/*.json` only for deterministic validation tests.

Example generated shape:

```json
{
  "statuses": [
    {
      "agent": "Now Playing",
      "state": "running",
      "task": "Song Title",
      "updatedAt": "2026-06-11T09:00:00.000Z",
      "detail": "Artist Name",
      "media": {
        "source": "spotify",
        "title": "Song Title",
        "artist": "Artist Name",
        "album": "Album Name",
        "artworkUrl": "https://i.scdn.co/image/example",
        "durationSeconds": 240,
        "positionSeconds": 42,
        "playbackState": "playing",
        "elapsedLabel": "0:42",
        "durationLabel": "4:00"
      }
    },
    {
      "agent": "Clipboard",
      "state": "running",
      "task": "Link copied · 21 chars",
      "updatedAt": "2026-06-11T09:00:00.000Z",
      "detail": "https://example.com/a"
    },
    {
      "agent": "Battery",
      "state": "running",
      "task": "Charging 82%",
      "updatedAt": "2026-06-11T09:00:00.000Z",
      "detail": "Now drawing from AC Power."
    }
  ]
}
```

Timer status shape when a local timer is active:

```json
{
  "statuses": [
    {
      "agent": "Timer",
      "state": "running",
      "task": "Timer · 4m 30s remaining",
      "updatedAt": "2026-06-14T00:00:00.000Z",
      "detail": "4m 30s remaining of 5m.",
      "timer": {
        "id": "timer-20260614000000000-300s",
        "durationSeconds": 300,
        "remainingSeconds": 270,
        "state": "running",
        "startedAt": "2026-06-14T00:00:00.000Z",
        "updatedAt": "2026-06-14T00:00:00.000Z",
        "displayText": "5m",
        "error": "",
        "replacedPrevious": false
      }
    }
  ]
}
```

Timer reset status shape immediately after reset:

```json
{
  "statuses": [
    {
      "agent": "Timer",
      "state": "idle",
      "task": "Timer · 5m remaining",
      "updatedAt": "2026-06-14T00:01:00.000Z",
      "detail": "5m remaining of 5m.",
      "timer": {
        "id": "timer-20260614000000000-300s",
        "durationSeconds": 300,
        "remainingSeconds": 300,
        "state": "reset",
        "startedAt": "2026-06-14T00:01:00.000Z",
        "updatedAt": "2026-06-14T00:01:00.000Z",
        "displayText": "5m",
        "error": "",
        "replacedPrevious": false
      }
    }
  ]
}
```

`npm run check-status` validates this local artifact deterministically: Timer statuses must include the Timer object fields above, positive integer duration, non-negative remaining seconds no greater than the duration, allowed lifecycle state (`idle`, `running`, `stopped`, `reset`, or `done`), ISO UTC timestamps, string display/error fields, and boolean replacement metadata.

## Verification

```sh
npm run check
npm run check-readme
npm run smoke:launch
npm run test:notch-position
npm run test:mac-activity-status
npm run test:activity-router
npm run test:clipboard-activity
npm run test:brightness-hud-status
npm run test:timer-status-store
npm run test:timer-start-cli
npm run test:timer-docs
npm run test:native-timer-status-serialization
npm run test:hermes-status
npm run test:status-loader
npm run check-status
npm run check-status:valid
npm run check-status:invalid
npm run check-status:malformed
```

Expected results:

- `check` passes when README, notch positioning, Mac activity snapshot, optional Hermes snapshot, status validation, and fixture checks pass.
- `check-readme` passes when this README documents the current notch island concept, scope, runbook, validation commands, and roadmap.
- `smoke:launch` passes after `npm install` when Electron can open the real app window, finish loading `src/index.html`, and quit automatically.
- `test:notch-position` passes when the overlay is centered on the physical display bounds and pinned to `y=0`.
- `test:mac-activity-status` passes when the app can generate default Now Playing, Clipboard, and Battery status entries plus an Activity Router compact-surface snapshot.
- `test:activity-router` passes when volume/brightness HUD, clipboard, shelf/drop, timer, Now Playing, battery, and future passive activities rank deterministically with expiry and tie-break semantics.
- `test:clipboard-activity` passes when local plain-text clipboard reads classify into non-persistent transient DynaClip activities and stale/unchanged/non-text reads remain idle.
- `test:brightness-hud-status` passes when observed brightness changes produce deterministic transient DynaKeys HUD status payloads without persistence.
- `test:timer-status-store` passes when starting/writing/stopping/resetting a Timer produces native-loadable Timer status models, including reset state with full restored duration and fresh reset timestamps.
- `test:timer-docs` passes when the Timer MVP Behavior section documents start, running overlay/status, completion, and local-first persistence/status expectations.
- `test:native-timer-status-serialization` passes when the native AppKit smoke path decodes running, stopped, and reset Timer fixtures, selects the active Timer before background media, releases inactive stopped/reset timers to fallback/media presentation, and preserves `id`, `durationSeconds`, `remainingSeconds`, lifecycle `state`, `startedAt`, `updatedAt`, `displayText`, `error`, and `replacedPrevious` for the overlay contract.
- `test:hermes-status` passes when the optional Hermes provider can generate status entries from local Hermes runtime/session inputs.
- `test:status-loader` passes when the status loader can read, parse, and validate `fixtures/valid-status.json`.
- `check-status` passes for `status/status.json`.
- `check-status:valid` passes for `fixtures/valid-status.json`.
- `check-status:invalid` fails for `fixtures/invalid-status.json`.
- `check-status:malformed` fails for `fixtures/malformed-status.json` before schema validation because the JSON cannot be parsed.

## Design References

- `docs/dynamiclake-reference.md` captures DynamicLake/DynaMusic/DynaGlance/DynaCall/DynaClip/DynaDrop patterns to adapt for Dynamac Island without copying branding, assets, or implementation.

## Roadmap

- Make the collapsed UI closer to Dynamic Island: smaller default pill, hover/click expansion, compact/live/activity modes.
- Add source adapters for GitHub CI, Discord thread activity, cron jobs, Kanban workers, and active coding agents.
- Add module types inspired by Mac notch workflows: glance, calls/meetings, file drop/shelf, timer history/actions, and media controls.
- Add action controls in the expanded view: open thread, open PR, pause/resume job, rerun failed task.
- Improve notch behavior across display sizes: configurable top offset, external monitor fallback, multi-display selection.
- Add signed/notarized DMG distribution after the unsigned local `.app` package flow settles.
