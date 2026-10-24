# WO-SKETCHUP-DEV-01 — Plugin test tooling (queued)

Status: QUEUED (owner approved 2026-10-24). Runs after WO-SF-BOOK-02 (Codex R9.245, Lead R9.246); the Lead moves it
into `PLAN.md` and gives the revision then.
Branch: `feat/project-book`.
Module(s): `sketchup` companion plugin, tooling only (`tools/sketchup-plugin/`). No server, schema or app change.
Risk: low - nothing ships to users; the guard is that the built `.rbz` stays byte-identical, so the plugin people
install cannot change. Escalate (BLOCKED) if a test needs a behaviour change in `src/`.
Owner: Product Owner (2026-10-24: "testing Ruby means closing and opening SketchUp again and again").

## Why

Each plugin change today is build → install `.rbz` → restart SketchUp → click through. WO-SKETCHUP-04 (material
tries from SketchUp) is coming; it should be developed mostly outside SketchUp, with SketchUp opened once at the end.

## Locked Decisions

1. **Dev loader:** `tools/sketchup-plugin/dev/berkahstudio_dev.rb`, copied once into SketchUp's Plugins folder, with
   one line to edit: the path to the checkout's `tools/sketchup-plugin/src`. It registers the same extension from
   that source folder, so `Extensions > Berkah Studio > Reload Plugin` reloads the edited files with no reinstall and
   no restart. If the installed `.rbz` is also present it refuses to load and says which one to remove (never two
   copies at once). `dev/` is not packed by `build.mjs`.
2. **Reload covers every file:** the reload list in `init.rb` stays explicit, and a plain-Ruby test fails when a file
   under `src/berkahstudio/` is neither in that list nor deliberately excluded (so a new file cannot silently miss a
   reload). Changing that list is the only edit allowed in `src/`, and only if the test finds a gap.
3. **Fake SketchUp:** `test/support/fake_sketchup.rb`, the smallest stand-in for what the plugin touches: `Sketchup`
   (active model, `register_extension`, `file_loaded`), model, materials with names and attribute dictionaries,
   faces with a material, selection, `UI.messagebox` / `UI.inputbox` / dialogs recorded instead of shown, `UI::Toolbar`
   and `UI::Command` as no-ops. Grow it only as far as the tests below need.
4. **Fake StudioFlow:** a stub of `StudioflowClient.request` that records each call (method, path, body, idempotency
   key) and answers from fixtures shaped exactly as `docs/apps/sketchup/CONTRACT.md` (`ok`/`data` and error
   envelopes). No network.
5. **First tests on that harness:** the Schedule link flows in `core/schedule_link.rb` that the plugin uses today —
   connect to a project, pick an existing item, create a new item (one idempotency key, a retry replays), refresh
   names, a stale or other-project link, a server error shown to the user. They assert today's behaviour; a test
   that would need different behaviour is reported, not "fixed".
6. **One command:** `ruby tools/sketchup-plugin/test/run_all.rb` runs every plugin test, plus `ruby -wc` on every
   source file. Ruby 3.2 as in SketchUp 2026; README gives the Docker one-liner (`ruby:3.2-slim`) for machines
   without Ruby. Not added to `npm test` (the office machines have no Ruby); `README.md` documents both.
7. **README "Develop without restarting SketchUp"** section in plain steps for the owner: install the dev loader
   once, edit, Reload Plugin, read errors in the Ruby Console, when a restart is still needed (toolbar or menu
   changes), and how to switch back to the installed `.rbz`.

## Non-goals

No plugin behaviour change, no version bump, no WO-SKETCHUP-02/03/04 work, no change to the server or its contract.

## Acceptance Criteria

1. `run_all.rb` passes and covers the flows in decision 5; deleting a line of a flow makes a test fail.
2. `node tools/sketchup-plugin/build.mjs` produces a byte-identical `.rbz` before and after (same SHA-256).
3. The reload-coverage test fails if a new `src/` file is added without updating the reload list.
4. The dev loader refuses to run alongside an installed copy (unit-tested with the fake SketchUp).
5. README steps are complete enough for the owner to switch to and from the dev loader without help.

## Verification (Executor, before commit)

`ruby -wc` on every file, `ruby tools/sketchup-plugin/test/run_all.rb`, the `.rbz` SHA-256 comparison, and the
repository's `npm run lint` and `check:boundaries` (unchanged). Per-command timeout 10 min.

## Reviewer Acceptance

Lead re-runs the tests and the hash check. Owner, once, in SketchUp: install the dev loader, edit one visible
string, Reload Plugin, see the change without restarting, then switch back to the `.rbz`.
