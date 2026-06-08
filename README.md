# Dynamac Island

Dynamac Island is a macOS notch-attached status island for Snuffles/Hermes. It is not a normal desktop app window: the Electron window is frameless, transparent, non-movable, always-on-top, and anchored to the physical top-center edge of the primary display so it visually attaches to the MacBook notch.

## Concept

Apple's Dynamic Island is a compact live-activity surface around the camera/sensor area. Its job is not to launch another app window; its job is to keep the most relevant ongoing activity visible, glanceable, and quickly controllable.

Dynamac Island follows that pattern for this Mac:

- **Small state:** collapsed pill near the notch for the current most important activity.
- **Live activity:** Snuffles/Hermes runtime status, active sessions, gateway/process health, and later GitHub/Discord/cron/job progress.
- **Quick expansion:** future hover/click expansion for detail and controls without opening a full app.
- **Multiple activities:** future rotation/swipe-like switching between active signals.

## Current State

- Greenfield Node/npm + Electron app.
- Notch-attached floating overlay, not a normal movable app window.
- Window source: `src/window-config.js` centers the island against `screen.getPrimaryDisplay().bounds` and pins `y` to the physical top edge.
- Runtime status source: a generated Hermes snapshot written to `status/status.json` in development, or to the packaged app's userData status path in `.app` builds.
- Hermes snapshot model: Snuffles runtime state, Hermes gateway process health, and the latest local Hermes session from `~/.hermes/sessions/sessions.json`.
- Validation model: each status item needs `agent`, `state`, `task`, `updatedAt`, and `detail`.
- Allowed states: `idle`, `running`, `success`, `warning`, `error`.
- Invalid JSON or invalid status fields are visible in the app as an error state.
- Fixture JSON files under `fixtures/` remain only for deterministic tests; they are not the product's default purpose.
- No credentials, network services, HTTP endpoint, deployment, or external side effects.

## Dependencies

- macOS with Node.js and npm for source runs.
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
2. Run `npm start` from `~/projects/dynamac-island`.
3. Confirm a small floating black pill appears attached to the top-center notch area, not in the middle of the desktop like a normal app.
4. Confirm the pill lists real local Hermes/Snuffles runtime signals when Hermes exists on the machine.
5. Confirm the pill still shows a warning state instead of fake success when Hermes data is unavailable.
6. Run `npm run test:notch-position` to verify the top-center anchoring contract.
7. Run `npm run test:hermes-status` to verify local runtime snapshot generation.

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

4. Observe that status entries describe Snuffles, Hermes Gateway, and Active Session instead of deterministic mock jobs.
5. For fixture-only development tests, validate deterministic fixture input separately:

```sh
npm run check-status:valid
```

6. To test invalid-input rendering in development, write malformed JSON to the watched file:

```sh
printf '{ "statuses": [\n' > status/status.json
```

7. Observe the running app without relaunching and confirm the pill shows an error state for the invalid status input.
8. Relaunch the app to regenerate real Hermes runtime status:

```sh
npm start
```

## Status File

The renderer still consumes a local JSON file because it gives the UI a simple, testable boundary. The important change is what writes that file:

- Product/default path: `src/hermes-status.js` generates a snapshot from local Hermes runtime signals.
- Development path: `status/status.json` is watched so updates can be verified without relaunching.
- Packaged `.app` path: Electron userData, usually `~/Library/Application Support/Dynamac Island/status/status.json`.
- Fixture path: `fixtures/*.json` only for deterministic validation tests.

Example generated shape:

```json
{
  "statuses": [
    {
      "agent": "Snuffles",
      "state": "running",
      "task": "Watching Hermes runtime",
      "updatedAt": "2026-06-08T14:05:00.000Z",
      "detail": "2 Hermes gateway processes active on this Mac."
    }
  ]
}
```

## Verification

```sh
npm run check
npm run check-readme
npm run smoke:launch
npm run test:notch-position
npm run test:hermes-status
npm run test:status-loader
npm run check-status
npm run check-status:valid
npm run check-status:invalid
npm run check-status:malformed
```

Expected results:

- `check` passes when README, notch positioning, Hermes snapshot, status validation, and fixture checks pass.
- `check-readme` passes when this README documents the current notch island concept, scope, runbook, validation commands, and roadmap.
- `smoke:launch` passes after `npm install` when Electron can open the real app window, finish loading `src/index.html`, and quit automatically.
- `test:notch-position` passes when the overlay is centered on the physical display bounds and pinned to `y=0`.
- `test:hermes-status` passes when the app can generate status entries from local Hermes runtime/session inputs.
- `test:status-loader` passes when the status loader can read, parse, and validate `fixtures/valid-status.json`.
- `check-status` passes for `status/status.json`.
- `check-status:valid` passes for `fixtures/valid-status.json`.
- `check-status:invalid` fails for `fixtures/invalid-status.json`.
- `check-status:malformed` fails for `fixtures/malformed-status.json` before schema validation because the JSON cannot be parsed.

## Roadmap

- Make the collapsed UI closer to Dynamic Island: smaller default pill, hover/click expansion, compact/live/activity modes.
- Add source adapters for GitHub CI, Discord thread activity, cron jobs, Kanban workers, and active coding agents.
- Add action controls in the expanded view: open thread, open PR, pause/resume job, rerun failed task.
- Improve notch behavior across display sizes: configurable top offset, external monitor fallback, multi-display selection.
- Add signed/notarized DMG distribution after the unsigned local `.app` package flow settles.
