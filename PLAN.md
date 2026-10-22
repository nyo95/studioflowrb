# Active Plan

Plan ID: WO-SKETCHUP-02 (P0 link safety, full plan: `docs/apps/sketchup/WO-SKETCHUP-02.md`); next WO-SKETCHUP-03 (P1 option-aware links, DRAFT)
Scope: SketchUp plugin keeps links safe when codes are reused, materials are merged, requests are interrupted or links point to deleted items or other projects.
Module(s): plugin under `tools/sketchup-plugin/` only (P0). P1 adds an additive read field to module `sketchup`.
Target revision: plan R9.192; P0 (Lead) R9.193.
Risk: medium - renames and merges in real SketchUp models; every change asks first and is one undo step.
Status: P0 built in R9.193 (plugin 1.2.1); owner test in SketchUp owed (together with WO-SKETCHUP-01 Stage 1b). WO-SKETCHUP-03 becomes READY after that test.
Priority: P2
Owner: Product Owner (decisions 2026-10-22, second review: code = specification slot, reuse allowed; names PL-01 / PL-01-B; no auto option A; offline names unchanged; merge only by official entry and option id; http only for local/private addresses; alternatives from SketchUp deferred)
Last updated: 2026-10-22

Previous plan `WO-SKETCHUP-01` rev 2 (`docs/apps/sketchup/WO-SKETCHUP-01.md`): Stage 0, 1a, 1b built;
its decision 13 is narrowed by WO-SKETCHUP-02 decision 8.

`WO-SCHEDULE-ASSISTANT-04` (option photos and colour placeholders through the Assistant) is
DONE in R9.186 (owner checks one photo and one colour on the Schedule screen); plan in `docs/apps/schedule-assistant/WO-SCHEDULE-ASSISTANT-04.md`.

Plan reconciliation: `WO-SCHEDULE-ASSISTANT-03` is DONE in R9.178 (owner walk owed: the 42
"(old)" materials, HT-04 excluded).

## Locked Decisions

See `docs/apps/sketchup/WO-SKETCHUP-02.md` (semantics and decisions 1-8).

## Acceptance Criteria

As in WO-SKETCHUP-02 "Acceptance".

## Verification

`ruby -wc` on every plugin file, `ruby tools/sketchup-plugin/test/link_rules_test.rb`,
`node tools/sketchup-plugin/build.mjs`; owner test in SketchUp against the dev server.
No StudioFlow change in P0, so the high gate is not required.
