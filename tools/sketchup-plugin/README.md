# Berkah Studio SketchUp plugin

Source of the Berkah Studio extension for SketchUp (moved here from the 1.1.6 package on
2026-10-22, `WO-SKETCHUP-01` rev 2 Stage 0). Plan: `docs/apps/sketchup/WO-SKETCHUP-01.md`.

- `src/berkahstudio.rb` — the loader SketchUp registers; `VERSION` lives here.
- `src/berkahstudio/` — the extension: Auto-Rename Material, Component Tracker, Wall Finish
  Labels. Sync with StudioFlow is switched off until Stage 1b.

## Build

```bash
node tools/sketchup-plugin/build.mjs
```

writes `tools/sketchup-plugin/dist/BerkahStudio_<version>.rbz` (ignored by git). Install it
with SketchUp > Extension Manager > Install Extension, then restart SketchUp.

## Rules

- Codes use the Product Schedule's format, at least two digits (PL-01). PL-1 and PL-01 are the
  same code.
- Keep each change small and bump `VERSION`; record it in `CHANGELOG.md` like any revision.
- No Ruby interpreter is installed on the development machines yet: check a change by loading
  it in SketchUp (Extensions > Berkah Studio > Reload Plugin, Ruby Console for errors).
