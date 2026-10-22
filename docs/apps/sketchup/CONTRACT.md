# SketchUp contract (v1.1)

Status: ACTIVE (R9.188, `WO-SKETCHUP-01` rev 2 Stage 1a; options in the schedule read since module 1.1.0, `WO-SKETCHUP-03`). Owner decisions 2026-10-22 in that
Work Order (the Schedule allocates every code; materials link to the schedule item; the model
never overwrites the Schedule).

## Module

- `sketchup` 1.1.0, `kind: "optional"`, parent and requires `studioflow`,
  `initialState: "DISABLED"` (only the Developer switches it on).
- Permission `studioflow.sketchup.use` (declared beside `scheduleAssistantUse` in StudioFlow's
  permissions, in no built-in role profile; the Platform Owner holds it while the module is on).
- Stores no data: the link between a SketchUp material and its schedule item (project id +
  entry id) lives in the SketchUp model. Integration-only: no screen, listed in
  `INTEGRATION_ONLY_APPS`.
- Reaches StudioFlow only through the server-only composer door
  `src/apps/studioflow/public/schedule-composer.ts` (its audit rows say `via: "sketchup"`).

## Tokens and access

| Scope | Allows |
|---|---|
| `sketchup:read` | projects, schedule, resolve |
| `sketchup:write` | create an item |

Both map to `studioflow.sketchup.use`. Reads also need project detail access (assigned
Designer/Drafter or StudioFlow Manager). Creating an item needs the Schedule screen's write
rule: `studioflow.schedule.manage`, assigned PIC or override holder, project not archived and
not completed.

## Routes (`/api/integrations/v1/sketchup/…`)

| Method + path | Scope | Body | Result |
|---|---|---|---|
| `GET projects` | read | — | `[{ id, name, status, canApply }]` |
| `GET projects/{id}/schedule` | read | — | `{ project, entries: [{ id, code, section, category, prefix, title, options: [{ id, label, isFinal, status, title }] }], categoryChoices }`; entry `title` = Brand + product of the final option, else of the first option, else `""`; option `title` = its Brand + product; `options` is `[]` for an item without options (1.1.0, additive) |
| `POST projects/{id}/resolve` | read | `{ entryIds: uuid[] }` (1–500) | `[{ entryId, code \| null }]`, duplicates removed; `null` = not an item of this project (deleted, or another project's) |
| `POST projects/{id}/entries` | write | `{ section: "MATERIAL" \| "FIXTURE", category, confirmNewCategory? }` | `{ entryId, code, category, prefix }`; needs `Idempotency-Key`; an exact retry replays |

Every response uses the integration kit envelope `{ ok, data | error: { kind, code,
safeMessage } }`. Bodies are limited to 64 KiB.

`entries` runs the composer's dry run (codes, look-alike check), then applies that exact batch
in the kit's transaction. A new category that looks like a studio one is refused with
`SKETCHUP_CATEGORY_SIMILAR` (the message names the studio categories and prefixes) unless
`confirmNewCategory: true`. Other refusals are the Schedule's (`PROJECT_ARCHIVED`,
`PROJECT_COMPLETED`, `PERMISSION_DENIED`, `SCHEDULE_CATEGORY_REQUIRED`, …) and the kit's
(`INTEGRATION_*`, `IDEMPOTENCY_*`).

## Plugin side (Stage 1b)

A code is a label StudioFlow may give to another item after a deletion (lowest free number); the
plugin identifies an item only by project id + entry id (+ option id since plugin 1.3.0) stored on the
material (`WO-SKETCHUP-02`, `WO-SKETCHUP-03`). Codes are compared with the prefix case-insensitive and
leading zeros ignored (SO-1 = SO-001 = SO-01) only to offer a link, never to decide one. Names:
`PL-01` for the final or only option (or an item without options), `PL-01-B` for a non-final
alternative. The plugin asks before linking, renaming, creating or merging; a merge needs the same
entry and option id.
