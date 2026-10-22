# Active Plan

Plan ID: WO-SKETCHUP-01 rev 2 (full plan: `docs/apps/sketchup/WO-SKETCHUP-01.md`)
Scope: SketchUp plugin takes its material codes from the Product Schedule and links each material to its schedule item; plugin source moves into this repository.
Module(s): new optional module `sketchup` (integration-only); StudioFlow permissions (one permission id); plugin under `tools/sketchup-plugin/`. No schema in Stage 1.
Target revision: Stage 0 R9.180 (Lead), Stage 1a next free revision after it (Executor), Stage 1b after review (Lead). This plan is R9.179.
Risk: medium - a new outside door that writes schedule items; reuses the composer door and the integration kit, so access, audit, idempotency and look-alike checks are already proven.
Status: Stage 0 DONE in R9.180 (owner tries 1.1.7 in SketchUp); Stage 1a READY for the Executor.
Priority: P2
Owner: Product Owner (decisions 2026-10-22: proposal accepted except "wall labels read the Schedule")
Last updated: 2026-10-22

Plan reconciliation: `WO-SCHEDULE-ASSISTANT-03` is DONE in R9.178 (owner walk owed: the 42
"(old)" materials, HT-04 excluded).

## Locked Decisions

See the full plan, decisions 1–10. In short: only the Schedule allocates codes; link by
schedule entry id; the model never overwrites the Schedule (area display only, fixture
counts as suggestions in Stage 2); Wall Finish Labels stay independent; plugin source in
`tools/sketchup-plugin/`; token + project picked from a list; module `sketchup` off by
default with permission `studioflow.sketchup.use`; codes in Schedule format (PL-01),
compared with leading zeros ignored; nothing of the legacy sync design is built.

## Acceptance Criteria

As in the full plan ("Acceptance (Stage 1)") plus the harness definition of done for 1a.

## Verification

Stage 0: Ruby syntax check (`ruby -c`) of every plugin file, packaging script produces the
`.rbz`, owner tries it in SketchUp. Stage 1a: high gate (`scripts/verify.mjs --tier high`
with `NEXT_DIST_DIR=.next-e2e`), route tests listed in the plan. Stage 1b: Lead plus owner
in SketchUp against the dev server.

## Executor Prompt (Stage 1a — send only after the Lead's Stage 0 commit)

Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, `docs/agent/EXTENSIONS.md`,
`docs/apps/platform/INTEGRATIONS.md`, `docs/apps/schedule-assistant/CONTRACT.md` and
`docs/apps/sketchup/WO-SKETCHUP-01.md` (rev 2). Implement Stage 1a only: optional module
`sketchup` 1.0.0 (manifest, scope-grants, runtime, contract, four routes via the integration
kit, `docs/apps/sketchup/CONTRACT.md`), the permission id `studioflow.sketchup.use` beside
`scheduleAssistantUse`, the token page composition, boundary listing as integration-only,
and the tests the plan lists. Reach StudioFlow only through
`src/apps/studioflow/public/schedule-composer.ts`; no Prisma schema, no plugin (Ruby) change,
no screen. If the composer door cannot do something the plan needs, stop with BLOCKED.
Run the high gate, update `CHANGELOG.md`, one local commit, no push. Reply only with a
Planner/Reviewer prompt: outcome, commit, checks, limitations, dirty files, verdict request.
