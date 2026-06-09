# Native Notch Overlay Findings

## Summary

Dynamac Island cannot reach Dynamic Lake-style notch/menu-bar integration with Electron `BrowserWindow` alone. On macOS, Electron clamps a borderless transparent window to the visible work area under the menu bar, even when `setPosition()` receives a negative y coordinate and the window is always-on-top.

A native AppKit `NSPanel` can position against `NSScreen.frame` and remain at the physical top edge (`y = 0` in top-left accessibility coordinates), which is the behavior needed for a Dynamic Island-like notch surface.

## Evidence from local MacBook

Electron probe:

```text
display bounds:    { x: 0, y: 0, width: 1920, height: 1080 }
display workArea:  { x: 0, y: 30, width: 1920, height: 1050 }
setPosition -120 => { x: 100, y: 30, width: 286, height: 58 }
setPosition -80  => { x: 100, y: 30, width: 286, height: 58 }
setPosition -38  => { x: 100, y: 30, width: 286, height: 58 }
setPosition 0    => { x: 100, y: 30, width: 286, height: 58 }
```

Runtime Electron app window:

```text
position: 817, 30
size:     286, 58
```

Native AppKit probe:

```text
screen.frame        {{0, 0}, {1920, 1080}}
screen.visibleFrame {{0, 0}, {1920, 1050}}
target             {{817, 1022}, {286, 58}}
panel.frame         {{817, 1022}, {286, 58}}
```

Runtime native app accessibility bounds:

```text
position: 817, 0
size:     286, 58
```

## Product implication

Dynamic Lake-style behavior should be implemented as a native AppKit overlay, not as a normal Electron window:

- Use `NSPanel` with `.borderless` and `.nonactivatingPanel`.
- Use `panel.level = .screenSaver` for a high overlay layer.
- Use collection behavior: `.canJoinAllSpaces`, `.fullScreenAuxiliary`, `.stationary`, `.ignoresCycle`.
- Anchor against `NSScreen.frame`, not Electron `screen.workArea` / `visibleFrame`.
- Keep the top edge flush with the physical top/notch area and round only the lower corners in expanded mode.

## Current implementation status

- `native/DynamacIslandNative.swift` is a native proof-of-direction overlay.
- `npm run native:smoke` builds and smoke-tests the native overlay.
- `npm run native:start` launches the native overlay using `status/status.json`.
- The Electron UI remains useful for data/view-model iteration, but should not be treated as the final notch-compatible runtime shell.

## Next steps

1. Promote native overlay to the primary macOS runtime.
2. Move status loading/watching parity from Electron into the native app.
3. Add click/hover expansion with the same compact/expanded state contract.
4. Package as a signed macOS app bundle instead of relying on `swiftc` output.
5. Keep Electron only as an optional dev preview if useful.
