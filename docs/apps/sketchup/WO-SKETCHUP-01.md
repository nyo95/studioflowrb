# WO-SKETCHUP-01 — SketchUp plugin: schedule-owned codes (rev 2)

Status: Stage 0 DONE in R9.180 (plugin 1.1.7 in `tools/sketchup-plugin/`); Stage 1a READY for the Executor;
Stage 1b (Lead) follows 1a; Stage 2 is an outline, not READY.
Supersedes rev 1 (2026-10-09, legacy-style push sync with merge queue, convergence planner
and anti-wipe staging). Owner decisions 2026-10-22.
Harness: `docs/agent/EXTENSIONS.md`. Foundation: `docs/apps/platform/INTEGRATIONS.md`.
Plugin under review: Berkah Studio 1.1.6 (Codex cleanup, 2026-10-22).

## Why rev 1 is replaced

Rev 1 let the plugin invent codes from the model (PL-1 = "next number among material
names") and then reconciled them against the Schedule with rename orders, a merge queue,
swap/cycle planning and anti-wipe rules. Two parties allocating codes is the root cause of
that complexity and of collisions such as PL-1 in the model vs PL-01…07 in the Schedule.

## Locked decisions

1. (Owner) **Only the Product Schedule allocates codes.** The plugin asks StudioFlow:
   pick an existing schedule item, or "new item in category X", for which StudioFlow
   returns the code (e.g. PL-08). A manual rename without a connection stays possible
   offline, but such a material is shown as "not linked".
2. (Owner) **Link by schedule item, not by code.** The plugin stores on the SketchUp
   material the StudioFlow project id and the schedule entry id. "Refresh codes" renames
   linked materials to the item's current code, so a code change in the Schedule
   (category move, renumber) reaches the model without a merge queue.
3. (Owner) **The model never overwrites the Schedule.** Material area is shown only
   (Material lines have no quantity). Fixture instance counts become suggestions the user
   accepts or ignores (Stage 2).
4. (Owner) **Wall Finish Labels stay independent of the Schedule.** They exist to check
   the working drawings, so they keep their own data; no Schedule read for labels.
5. (Owner) **The plugin source moves into this repository** at `tools/sketchup-plugin/`
   (like the MCP bridge), with its build producing the `.rbz`.
6. (Lead) Connection like the Schedule Assistant: personal token `sfk_…`, project chosen
   from a list (never typed by name), module switched on by the Developer.
7. (Lead) New optional module `sketchup` 1.0.0: `kind: "optional"`, parent/requires
   `studioflow`, `initialState: "DISABLED"`, permission `studioflow.sketchup.use` (in no
   built-in role profile; the Platform Owner holds it while the module is on), scopes
   `sketchup:read` and `sketchup:write`, integration-only (no screen in Stage 1).
8. (Lead) It reaches StudioFlow only through the existing server-only composer door
   `src/apps/studioflow/public/schedule-composer.ts`; Stage 1 needs no StudioFlow service
   change. The permission id is declared next to `scheduleAssistantUse` in StudioFlow's
   permissions (a one-line protected-core change named here).
9. (Lead) Codes keep StudioFlow's format (PL-01). The plugin compares codes with leading
   zeros ignored (PL-1 = PL-01) so existing models are recognized.
10. (Lead) Legacy per-project key, project-by-name binding, `/api/sketchup/*`, `/api/health`,
    merge queue and staging tables are not built.
11. (Owner, 2026-10-22) **Clicking a material always asks before linking.** The plugin never
    links, renames or creates a schedule item without the user's answer (flow in Stage 1b).
12. (Owner) **Same code, any spelling.** SO-1, SO-001, so-01 and SO-01 are one code (prefix
    case-insensitive, leading zeros ignored); the plugin offers the matching schedule item and
    asks "Ini SO-01 · <brand product>?" instead of treating the spelling as a new code.
13. (Owner) **Merge only inside the model, only on confirmation.** When two SketchUp materials
    are linked to the same schedule item (or carry the same code in two spellings), the plugin
    offers to merge them into one material named with the schedule code, showing face counts
    and warning when textures or colours differ; one undo step. The Schedule is never changed
    by a merge.
14. (Owner) **No AI in Stage 1.** The flow is rule-based (deterministic matching). A later
    stage may add AI suggestions (e.g. from a texture picture, or tidying many messy names) that
    are always proposals the user accepts, like the Schedule Assistant rules.

## Stage 0 — Lead (plugin hygiene, no StudioFlow change)

- Copy the 1.1.6 package into `tools/sketchup-plugin/src/` (loader `berkahstudio.rb` +
  `berkahstudio/`), plus a small packaging script that zips it to
  `tools/sketchup-plugin/dist/BerkahStudio_<version>.rbz` (dist ignored by git).
- Fixes: the category picker starts empty and requires a choice (today it defaults to
  "ACR - Acrylic"); hide "Open Web Schedule", "Sync from Web", auto-sync and the API-key
  menus until Stage 1b (they call routes that do not exist); remove the false
  "Purged unused materials" text and the `cd berkahstudio_web` hint; codes it creates
  offline use two digits (PL-01) to match the Schedule.
- Version 1.1.7. README in `tools/sketchup-plugin/`. Ruby syntax check of every file.

## Stage 1a — Executor (backend)

Module `src/apps/sketchup/` per the harness template, no Prisma schema (nothing stored:
the link lives in the SketchUp model). Routes under `/api/integrations/v1/sketchup/`:

| Method + path | Scope | Result |
|---|---|---|
| `GET projects` | read | composer `listProjects` (id, name, status, canApply) |
| `GET projects/{id}/schedule` | read | `{ project, entries: [{ id, code, section, category, prefix, title }], categoryChoices }` where `title` = final option, else option A: brand + product (no images, no storage keys) |
| `POST projects/{id}/entries` | write | body `{ section, category, confirmNewCategory? }`; creates one schedule item through the composer (`previewBatch` then `applyBatch` with that digest, same transaction as the kit) and returns `{ entryId, code, category, prefix }`; needs `Idempotency-Key` |
| `POST projects/{id}/resolve` | read | body `{ entryIds: uuid[] (1–500) }` → `[{ entryId, code \| null }]` (`null` = the item no longer exists) for "Refresh codes" |

Rules: same access as the Schedule Assistant (reads need project detail access; create needs
the Schedule write rule, project not archived/completed). A category that is new and looks
like a studio category (`SCHEDULE_CATEGORY_SIMILAR`) is refused with its suggestions unless
`confirmNewCategory: true`. Audit rows from the composer carry `via = "sketchup"`.
Scope/grant pairs are composed beside the Schedule Assistant's on the token page.
Contract: `docs/apps/sketchup/CONTRACT.md`. Tests: auth, scope, module off, validation,
idempotent replay, happy path for each route, look-alike refusal, read-only scope cannot
create, another project's entry id resolves to `null`.

## Stage 1b — Lead (plugin client)

- "Connect to StudioFlow": server URL + token (stored in SketchUp preferences, never in the
  package), project picked from `GET projects`, project id saved on the model.
- Auto-Rename becomes "Kode dari jadwal". Click a surface, then by the material's state:
  1. **Linked** to an item of this project → show "SO-01 · <brand product>", offer "Ganti item".
  2. **Name reads as a code** (decision 12) and the project has that item → ask
     "Ini SO-01 · <brand product>?". Yes → rename to the schedule code and link. No → the
     picker below.
  3. **Otherwise** → picker: choose a category, see its items (code · brand product), names
     most similar to the material name first (same rule family as the Schedule's look-alike
     check: initials, edit distance, shared long word), plus "Item baru di kategori…" →
     StudioFlow returns the code → material renamed, entry id stored.
  4. After linking, if another material in the model is linked to the same item or carries
     the same code in another spelling → offer the merge of decision 13.
  Nothing is renamed, linked, created or merged without the user's answer (decision 11).
- "Refresh codes": resolve all linked entry ids; rename changed ones in one undo step
  (temporary names for swaps); a removed item leaves the material "not linked" with a notice.
- Status in the dialog: linked / not linked / linked to another project.

## Stage 2 — outline (not READY)

Model check report in StudioFlow: schedule items not found in the model, model materials
without a schedule link, area per item (display only), Fixture components linked the same
way with instance counts offered as quantity suggestions. Needs a stored snapshot (own
`sketchup` schema) and a Lead screen; planned after Stage 1 is in use.

## Acceptance (Stage 1)

1. A model connected to a project assigns PL-08 from "new item in High Pressure Laminate"
   and PL-03 from picking an existing item; the Schedule shows the new item once, audited.
2. After the Schedule moves an item (HP-01 → PL-01), "Refresh codes" renames the material
   in the model; undo restores it.
3. Without a token or with the module off, the plugin still renames offline and says the
   material is not linked; nothing is sent.
4. Wall Finish Labels and Component Tracker behave as in 1.1.6.
5. A material named SO-1 in a project whose Schedule has SO-01 is offered as SO-01; "Ya"
   renames it to SO-01 and links it; "Bukan" opens the picker; nothing changes on cancel.
6. Two materials SO-1 and SO-001 linked to SO-01: the plugin offers one merge, shows both face
   counts and a texture-difference warning when they differ; after merge every face uses SO-01;
   one undo restores both materials; the Schedule is unchanged.
