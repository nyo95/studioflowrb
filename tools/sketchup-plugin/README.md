# Berkah Studio SketchUp plugin

Source of the Berkah Studio extension for SketchUp (moved here from the 1.1.6 package on
2026-10-22, `WO-SKETCHUP-01` rev 2 Stage 0). Plans: `docs/apps/sketchup/WO-SKETCHUP-01.md`,
`WO-SKETCHUP-02.md` (link safety), `WO-SKETCHUP-03.md` (option-aware links).

- `src/berkahstudio.rb` — the loader SketchUp registers; `VERSION` lives here.
- `src/berkahstudio/` — the extension: Auto-Rename Material, Component Tracker, Wall Finish
  Labels, codes from the Product Schedule (Sambung ke StudioFlow).
- `test/` — plain-Ruby tests of the link rules and Schedule link flows, using fake SketchUp and StudioFlow objects (no network).
- `dev/berkahstudio_dev.rb` — development loader copied once into SketchUp's Plugins folder.

## Build

```bash
node tools/sketchup-plugin/build.mjs
```

writes `tools/sketchup-plugin/dist/BerkahStudio_<version>.rbz` (ignored by git). Install it
with SketchUp > Extension Manager > Install Extension, then restart SketchUp.

## Develop without restarting SketchUp

1. If Berkah Studio was installed from an `.rbz`, remove or disable that installed copy first and restart SketchUp.
   The development loader refuses to start while both copies are present.
2. Copy `dev/berkahstudio_dev.rb` into SketchUp's Plugins folder once.
3. Edit the `SOURCE_PATH` line in that copied file so it points to this checkout's
   `tools/sketchup-plugin/src` folder. Use forward slashes in the Windows path.
4. Start SketchUp. Edit the plugin files in the checkout, then choose
   **Extensions > Berkah Studio > Reload Plugin**. There is no need to rebuild or reinstall the `.rbz`.
5. Keep **Window > Ruby Console** open while developing. A reload error and its file name appear there.

Restart SketchUp when changing the loader, menu items, toolbar buttons, or startup registration. Reload is enough
for ordinary logic and text changes in the files already named by `MaterialScheduler.reload`.

To switch back, close SketchUp, remove `berkahstudio_dev.rb` from the Plugins folder, install or enable the released
`.rbz`, then start SketchUp again.

## Test

With Ruby 3.2 installed:

```bash
ruby tools/sketchup-plugin/test/run_all.rb
```

Without Ruby, run the same suite from the repository root with Docker:

```bash
docker run --rm -v "$PWD:/work" -w /work ruby:3.2-slim ruby tools/sketchup-plugin/test/run_all.rb
```

The command checks Ruby syntax for every plugin, development-loader, support and test file, then runs every plugin
test. The fake StudioFlow responses use the public `ok`/`data` and `error` envelopes and never access the network.

## Rules

- Codes use the Product Schedule's format, at least two digits (PL-01). PL-1 and PL-01 are the
  same code. `PL-01-B` is option B of PL-01 when B is not final (WO-SKETCHUP-03).
- Keep each shipped plugin behavior change small and bump `VERSION`; tooling-only changes do not change the package
  version. Record either kind in `CHANGELOG.md` like any revision.
- Check a change with `ruby tools/sketchup-plugin/test/run_all.rb` (Ruby 3.2 like SketchUp 2026), then load it in
  SketchUp (Extensions > Berkah Studio > Reload Plugin, Ruby Console for errors).
