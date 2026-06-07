# Dynamac Island

Open-source Dynamic Island-style notch overlay for macOS.

Dynamac Island starts as a native Swift/SwiftUI/AppKit project aimed at MacBook Pro notch devices, especially ST's MacBook Pro 14-inch M1. The goal is to build a clean, hackable alternative inspired by Dynamic-Island-Sketchybar, Alcove, and DynamicLake while staying transparent about public API limits.

## MVP direction

- Native macOS background/menu-bar app.
- Always-on-top notch-centered island panel.
- Testable core state machine for transient island events.
- Manual notch calibration first, automatic detection later.
- Public-API-first modules: volume, battery, frontmost app, timer.
- Optional/experimental modules clearly labeled when macOS permissions or non-public APIs are involved.

## Current status

This repo currently contains the tested core library scaffold:

- `DynamacIslandCore` — island state, event priority, and notch geometry.
- `Dynamac-Island` — CLI smoke executable until the full macOS app shell lands.
- `DynamacIslandCoreTests` — dependency-free Swift test runner for Command Line Tools environments.

## Quick start

```bash
swift build
swift run DynamacIslandCoreTests
swift run Dynamac-Island
```

Expected test result:

```text
All DynamacIslandCore tests passed
```

## Architecture

```text
Event providers
  ├─ volume / battery / frontmost app / timer
  ↓
DynamacIslandCore
  ├─ IslandModel state machine
  ├─ priority + expiry rules
  └─ notch geometry calculation
  ↓
macOS app shell
  ├─ NSPanel / NSWindow overlay
  ├─ SwiftUI island view
  └─ status bar preferences
```

## Reference projects/products

- Dynamic-Island-Sketchybar: https://github.com/crissNb/Dynamic-Island-Sketchybar
- Alcove: https://tryalcove.com/
- DynamicLake: https://www.dynamiclake.com/

## Roadmap

1. Core state + geometry — started.
2. AppKit overlay panel centered on the notch.
3. Status bar menu and preferences.
4. Volume and battery providers.
5. Frontmost app and timer live activity providers.
6. Manual notch calibration UI.
7. Media provider with explicit API/permission caveats.

## Design constraints

- Avoid private APIs in default builds.
- Keep macOS permissions optional where possible.
- Keep core logic testable without launching a GUI.
- Make notch dimensions configurable because scaled resolutions and display setups vary.

## License

MIT © HSUNEH
