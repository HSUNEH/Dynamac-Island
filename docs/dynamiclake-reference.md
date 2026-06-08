# DynamicLake Reference Notes

Source pages reviewed 2026-06-08:

- https://www.dynamiclake.com/
- https://www.dynamiclake.com/dynamusic
- https://www.dynamiclake.com/dynaglance
- https://www.dynamiclake.com/dynacall
- https://www.dynamiclake.com/dynaclip
- https://www.dynamiclake.com/dynadrop

These notes are product-pattern references for Dynamac Island. Do not copy DynamicLake branding, copy, artwork, or implementation.

## What DynamicLake is doing

DynamicLake frames the Mac notch/top-center area as a compact system-level surface, not as a normal app window. Its product modules map normal Mac activities into a Dynamic-Island-like interaction layer:

- **DynaMusic** — music playback status/control in the island.
- **DynaCall** — call/join-meeting state, pre-join preview, live call activity.
- **DynaGlance** — glanceable calendar/weather/events.
- **DynaClip** — Finder companion/file shelf near the notch.
- **DynaDrop** — drag/drop file actions: convert, AirDrop, share links, transcript, right-click actions.
- **miniLake** — smaller, unobtrusive format that gives up less screen space.
- **Liquid Glass Dynamic Island** — visual style option, especially for external display.

## Transferable design principles

1. **Hardware-attached, not app-like**
   - The island must feel attached to the MacBook notch/top center.
   - Default state should be a black capsule that visually blends with the physical notch.
   - Avoid normal app affordances: titlebar, move/resize, dock/taskbar presence.

2. **Collapsed first**
   - DynamicLake emphasizes small, glanceable states.
   - Dynamac Island should default to the smallest useful Snuffles/Hermes live activity, not a dense dashboard.

3. **Mode-specific modules**
   - DynamicLake splits activities by module: music, calls, glance, files, drop actions.
   - Dynamac Island should use modules/adapters rather than one generic status list forever.

4. **Compact → expanded interaction**
   - Collapsed pill: one icon/status/critical count.
   - Expanded card: details, controls, actions.
   - Expansion should feel like the pill grows downward, not like a separate modal opens.

5. **No fake success**
   - Dynamic activity surfaces must reflect real state.
   - Mock/demo data belongs only in fixtures/tests, never as default production truth.

6. **Privacy by default**
   - A notch overlay is visible during screen share and across workspaces.
   - Hide sensitive titles, full paths, raw commands, token/cost details, and client/thread names unless the user explicitly opts in.

## Dynamac Island product mapping

### Core Snuffles/Hermes module

Collapsed:

- Snuffles icon/dot.
- Gateway health: running/warning/error.
- Active task count or one most important active task.

Expanded:

- Hermes gateway/profile health.
- Active session state.
- Current job/cron/card status.
- Actions: open current thread, open logs, pause/resume/rerun where safe.

### DynaGlance-like module

Purpose: daily operational glance.

Signals:

- Upcoming calendar/meeting.
- Due reminders.
- High-priority unread/actionable messages.
- Weather only if useful for ST's workflow.

### DynaCall-like module

Purpose: meetings/calls.

Signals:

- Join meeting available.
- Current call live status.
- Mic/camera/recording state if available from macOS APIs.

### DynaDrop/DynaClip-like module

Purpose: quick file handoff to Snuffles.

Interaction:

- Drag file to notch island.
- Expanded action menu: summarize, OCR, send to chat, attach to current task, convert, upload.

### DynaMusic-like module

Lower priority for this project, but useful as UI pattern:

- Compact media indicator.
- Expanded controls if integrating Spotify/Apple Music later.

## Near-term implementation priorities

1. Reduce default collapsed UI height/width so it feels more like a real notch island.
2. Add expanded state on click/hover with details and controls.
3. Introduce activity modules/adapters instead of rendering a generic grid forever.
4. Add adapter priority/ranking: show the most urgent live activity in collapsed mode.
5. Add privacy modes:
   - public/screen-share: generic labels only.
   - private: optional detailed titles/actions.
6. Add drag-to-island file intake after core status behavior is stable.

## Design guardrails

- Do not turn the island into a full dashboard.
- Do not display raw session titles, raw logs, full file paths, tokens, costs, or message content by default.
- Do not auto-insert mock cards when real data is missing.
- Do not copy DynamicLake assets or branding.
- Keep the core value: top-center live activity surface for Snuffles/Hermes.
