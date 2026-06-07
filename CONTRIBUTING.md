# Contributing

Thanks for helping build Dynamac Island.

## Development loop

```bash
swift build
swift run DynamacIslandCoreTests
swift run Dynamac-Island
```

## Principles

- Test core logic before implementing behavior.
- Keep GUI-specific code thin; put deterministic logic in `DynamacIslandCore`.
- Prefer public macOS APIs.
- Clearly label modules that require Accessibility, Automation, Screen Recording, or private APIs.
- Keep defaults safe and non-intrusive: click-through idle overlay, conservative window levels, and user-visible preferences.

## Commit style

Use Conventional Commits:

- `feat: add notch overlay panel`
- `fix: correct expanded frame y origin`
- `test: cover island event priority`
- `docs: document permission model`
