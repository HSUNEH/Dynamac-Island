# Dynamac Island

Dynamac Island is a small local Electron MVP for a macOS-testable floating status pill. It renders mock Snuffles, Codex, and Ouroboros job states from a watched local JSON file.

## Current State

- Greenfield Node/npm + Electron app.
- Floating, frameless Dynamic-Island-style status panel.
- Status source: `status/status.json`.
- Validation model: each status item needs `agent`, `state`, `task`, `updatedAt`, and `detail`.
- Allowed states: `idle`, `running`, `success`, `warning`, `error`.
- Invalid JSON or invalid status fields are visible in the app as an error state.
- No credentials, network services, HTTP endpoint, deployment, or external side effects.

## Dependencies

- Node.js and npm are required on the target MacBook.
- Runtime shell scripts use only Node.js built-in modules.
- The app UI dependency is Electron, declared as the sole npm dev dependency in `package.json`: `electron@^42.3.3`.
- `npm install` downloads Electron from `registry.npmjs.org`. On the build Mac mini, `npm install`, `npm run check`, `npm run smoke:launch`, and `npm audit --audit-level=high` pass.


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

Launch the local Electron app:

```sh
npm start
```

Run the automated Electron launch smoke test:

```sh
npm run smoke:launch
```

Validate the default watched status file:

```sh
npm run check
npm run check-readme
npm run test:install-macbook-script
npm run test:status-loader
npm run check-status
```

Validate deterministic fixtures:

```sh
npm run check-status:valid
npm run check-status:invalid
npm run check-status:malformed
```

`check-status:invalid` is expected to exit non-zero and print validation errors. `check-status:malformed` is expected to exit non-zero and print a JSON parse error.

## MacBook Smoke Test

Run these checks on the target MacBook after `npm install`:

1. Run `npm run smoke:launch` from `~/projects/dynamac-island` and confirm it exits with "Smoke launch passed".
2. Run `npm start` from `~/projects/dynamac-island`.
3. Confirm a small floating black pill appears near the top of the screen.
4. Confirm the pill lists Snuffles, Codex, and Ouroboros mock job states.
5. Edit `status/status.json` and confirm the app updates without relaunching.
6. Put invalid JSON in `status/status.json` and confirm the pill shows an error state.
7. Restore valid JSON by copying the fixture back into the watched file:

```sh
cp fixtures/valid-status.json status/status.json
```

Run the README content validation test:

```sh
npm run check-readme
```

This test is runnable and fails if the README stops documenting the MacBook path, install and launch commands, floating pill check, mock agent check, watched JSON update check, invalid-input error-state check, status validation commands, current scope, or roadmap.

## Manual Update Verification

Use this exact path when headless UI automation cannot prove that the live island updates on screen:

1. Terminal 1: launch the app from the project directory:

```sh
cd ~/projects/dynamac-island
npm start
```

2. Confirm the floating pill is visible and initially lists Snuffles, Codex, and Ouroboros.
3. Terminal 2: replace the watched status file with a deterministic warning update:

```sh
cd ~/projects/dynamac-island
node -e 'const fs=require("node:fs"); const now=new Date().toISOString(); fs.writeFileSync("status/status.json", JSON.stringify({ statuses: [{ agent: "Snuffles", state: "running", task: "Manual watcher check", updatedAt: now, detail: "Snuffles is still visible after a watched-file update." }, { agent: "Codex", state: "warning", task: "Manual watcher check", updatedAt: now, detail: "Codex warning proves the renderer received the edited JSON." }, { agent: "Ouroboros", state: "success", task: "Manual watcher check", updatedAt: now, detail: "Ouroboros remains present in the mock job list." }] }, null, 2));'
```

4. Observe the running app without relaunching and confirm the pill now shows `Manual watcher check` and `Codex warning proves the renderer received the edited JSON.`
5. Terminal 2: write malformed JSON to the watched file:

```sh
printf '{ "statuses": [\n' > status/status.json
```

6. Observe the running app without relaunching and confirm the pill shows an error state for the invalid status input.
7. Terminal 2: restore the valid fixture:

```sh
cp fixtures/valid-status.json status/status.json
```

8. Observe the running app without relaunching and confirm Snuffles, Codex, and Ouroboros return to their valid mock states.

## Status File

Edit `status/status.json` while the app is running. The Electron main process watches the status directory and pushes updates to the renderer automatically.

Example:

```json
{
  "statuses": [
    {
      "agent": "Snuffles",
      "state": "running",
      "task": "Monitoring local session",
      "updatedAt": "2026-06-08T12:00:00.000Z",
      "detail": "Watching mock signals from the local JSON status file."
    }
  ]
}
```

## Verification

```sh
npm run check
npm run check-readme
npm run smoke:launch
npm run test:status-loader
npm run check-status
npm run check-status:valid
npm run check-status:invalid
npm run check-status:malformed
```

Expected results:

- `check` passes when the README, default watched status file, and valid fixture checks pass.
- `check-readme` passes when this README documents the current MVP state, scope, runbook, validation commands, and roadmap.
- `smoke:launch` passes after `npm install` when Electron can open the real app window, finish loading `src/index.html`, and quit automatically.
- `test:status-loader` passes when the status loader can read, parse, and validate `fixtures/valid-status.json`.
- `check-status` passes for `status/status.json`.
- `check-status:valid` passes for `fixtures/valid-status.json`.
- `check-status:invalid` fails for `fixtures/invalid-status.json`.
- `check-status:malformed` fails for `fixtures/malformed-status.json` before schema validation because the JSON cannot be parsed.

## Roadmap

- Add a small fixture switcher in dev mode.
- Add Hermes/Snuffles/Codex file adapters once their local status formats are stable.
- Add a packaged macOS build target after the MVP UI and status schema settle.
