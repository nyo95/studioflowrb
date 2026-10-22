# Berkah Studio SketchUp plugin

Source of the Berkah Studio extension for SketchUp (moved here from the 1.1.6 package on
2026-10-22, `WO-SKETCHUP-01` rev 2 Stage 0). Plans: `docs/apps/sketchup/WO-SKETCHUP-01.md`,
`WO-SKETCHUP-02.md` (link safety), `WO-SKETCHUP-03.md` (option-aware links).

- `src/berkahstudio.rb` — the loader SketchUp registers; `VERSION` lives here.
- `src/berkahstudio/` — the extension: Auto-Rename Material, Component Tracker, Wall Finish
  Labels, codes from the Product Schedule (Sambung ke StudioFlow).
- `test/` — plain-Ruby tests of the pure link rules (`core/link_rules.rb`).

## Build

```bash
node tools/sketchup-plugin/build.mjs
```

writes `tools/sketchup-plugin/dist/BerkahStudio_<version>.rbz` (ignored by git). Install it
with SketchUp > Extension Manager > Install Extension, then restart SketchUp.

## Rules

- Codes use the Product Schedule's format, at least two digits (PL-01). PL-1 and PL-01 are the
  same code. `PL-01-B` is option B of PL-01 when B is not final (WO-SKETCHUP-03).
- Keep each change small and bump `VERSION`; record it in `CHANGELOG.md` like any revision.
- Check a change with `ruby -wc` on every file and `ruby tools/sketchup-plugin/test/link_rules_test.rb`
  (Ruby 3.2 like SketchUp 2026; Docker `ruby:3.2-slim` where Ruby is not installed), then load it in SketchUp
  (Extensions > Berkah Studio > Reload Plugin, Ruby Console for errors).
