# WO-SKETCHUP-01 — SketchUp plugin sync (DEFERRED, not READY)

Status: DEFERRED by the owner on 2026-10-09. Written so it can be picked up later;
nothing here is built. Do not hand to the Executor until Status is READY and the
Lead has done "Step 0".
Parts: 01 (this file, Executor), 02 merge queue (Executor), 03 token page + screens (Lead).
Harness: `docs/agent/EXTENSIONS.md`. Foundation: `docs/apps/platform/INTEGRATIONS.md`.

## Locked decisions (owner, 2026-10-09)

1. **Product Schedule is the source of truth, including the code** (PT-01, GL-2 …).
   The plugin owns technical identity and geometry (uuid, area, counts, layers,
   instance counts). A push reporting a code that differs from the linked entry is a
   *divergence*, never an instruction; the server queues rename orders back to the
   plugin (`merge_actions`). Legacy evidence (read-only, legacy `c4b0c46`):
   `src/extensions/sketchup/lib/catalog-ownership.ts`,
   `actions/sketchup-actions.ts` (`autoLinkSyncedMaterial`, `autoLinkSyncedFixture`,
   `planCodeConvergence`). Ignore the stale "SketchUp is source of truth" comment in
   the legacy sync route.
2. A material the plugin pushes that has no Schedule entry creates one with the
   pushed code; it fills quantity/unit/location only where the Schedule has none.
3. Project is chosen **in the URL** (`/api/integrations/v1/sketchup/projects/{projectId}/sync`);
   one token serves many projects. The legacy per-project key is purged.
4. Safeguards kept from legacy: (a) **hard stop before any write** on invalid code,
   missing uuid, duplicate uuid or duplicate code within one payload (HTTP 422 with
   the offending lists); (b) **anti-wipe**: pruning staging rows needs
   `full_snapshot: true` and at least one material, and never deletes a linked
   Schedule entry or a reserved row; (c) rename reconciliation when one stale
   same-code row carries work; ambiguous cases are skipped; (d) the response
   acknowledges rows actually persisted, not the request echo.
5. A pushed code that collides with another Schedule entry, or a slot held by an
   unclaimed template item, does **not** stop the sync: skip the link, return it in
   `sync_errors`/warnings. Only the in-payload duplicates (4a) stop it.
6. The wire shape of legacy is kept: GET returns `{success, projectId, merge_actions:[{id,source,target}]}`;
   POST takes `{materials[], ffes[]|ffe[], full_snapshot}`; confirm takes `{actionIds[]|action_ids[]}`.
   Confirm only marks actions done; verification happens at the next push.
   Body limit raised per route for the snapshot (`bodyLimitBytes`), value in the contract.

## Step 0 — Lead (before the Executor)

StudioFlow's `public/` has no Schedule door today. The Lead adds, in
`src/apps/studioflow/public/` (protected core, so a Lead change): a narrow
`schedule-sync` contract the extension may call — read an entry by project+code,
create an entry with a code, update qty/unit/location only when empty, list all
codes of a project in one call (for convergence). Executor must not import
StudioFlow services or Prisma models. Record the contract in this file when done.

## Part 01 scope (Executor)

- `prisma/schema/sketchup.prisma`, schema `sketchup`: staging tables for materials
  and fixtures keyed by (project id as plain string, uuid) and (project id, code);
  merge-action queue table (source code, target code, queue order, executed_at).
  No relation to another schema; project and entry ids are plain strings.
- `src/apps/sketchup/` per the harness template: `contract.ts` (zod), `domain/`
  (code normalisation `PREFIX-n` ignoring leading zeros and case, duplicate
  detection, rename reconciliation, convergence planner including temporary-code
  hops for swaps and cycles), `services/` (sync, pending actions, confirm), tests.
- Routes via the Platform integration kit, scope `sketchup:sync`, grants as the
  Lead assigns; write routes are idempotent.
- Audit every write; new permissions only if the Lead names them.

## Acceptance

Harness definition of done, plus: payload with a duplicate code writes nothing and
returns 422; empty or non-`full_snapshot` push never prunes; a swap of two codes
between model and Schedule resolves in one planned batch; confirm is idempotent;
re-push after confirm queues nothing when codes agree.

## Open items before READY

- Exact permission ids and which role gets them (Lead).
- Whether a collision (decision 5) should also appear as a visible list in the UI (Part 03).
- The Ruby plugin lives outside this repository; its URL change (project in the path,
  Bearer token from the token page) is a separate owner task.
