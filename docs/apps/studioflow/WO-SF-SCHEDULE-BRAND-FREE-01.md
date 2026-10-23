# WO-SF-SCHEDULE-BRAND-FREE-01 — Product Schedule Brands do not depend on Master Data

Modules: `studioflow` (Product Schedule service) and `schedule-assistant` (composer door, MCP bridge, contract).
Target revision: plan R9.216; backend (Codex) R9.217.
Risk: medium — changes a locked Schedule Assistant rule (owner decision 2026-10-22) and three create paths.
Owner decision: 2026-10-23.

## Why

The owner: the Product Schedule stands on its own. It may take a Brand from Master Data when one exists, but a
Brand that is not in Master Data must still be usable. The client often names a shop or brand nobody has entered yet
(for example "Lalapis" for GL-03).

Two findings (Lead review, 2026-10-23):

1. **Defect in the app.** The Brand field already offers `Use "X" (not in Master Data)`, and `updateOption` /
   `updateTemplateItem` keep that typed name. But `createEntry`, `createOption` and `createTemplateItem` call
   `brandSnapshot(ports, brandId)`, which returns `{ brandId: null, brandName: null }` when no id is sent and is then
   spread over the snapshot: a typed Brand is silently dropped whenever an item, an option or a template item is
   created. Only editing keeps it.
2. **Locked rule in the Assistant.** `schedule-composer.ts` `brandIssue` turns any `brandName` without a `brandId`
   into the blocking issue `SCHEDULE_BRAND_NOT_FOUND`; `CONTRACT.md` and the MCP server instructions say a Brand
   must be chosen from Master Data. This is the rule the owner has now reversed.

## Locked decisions

1. A schedule option's Brand is a snapshot: either a Master Data Brand (`brandId` + its name at that moment) or a
   typed name (`brandName`, `brandId` null). Both are first-class; neither needs Master Data to exist. No Master Data
   record is created from the Schedule, and nothing writes into Master Data.
2. Every create and edit path follows one rule (single helper in the schedule service, replacing the id-only
   `brandSnapshot`): a `brandId` is resolved from Master Data and must be an active Brand (`SCHEDULE_BRAND_NOT_FOUND`
   otherwise, as today); without a `brandId`, the typed `brandName` is kept as written (trimmed, ≤160, empty = none).
   The edit paths keep today's "same id keeps the stored snapshot" behaviour.
3. Schedule Assistant, `brandName` without `brandId`:
   - when exactly one active Master Data Brand has the same name (trimmed, case-insensitive), preview resolves it to
     that Brand's id and says so in the result;
   - otherwise the typed name is kept and preview returns a **warning** (not an issue)
     `SCHEDULE_BRAND_NOT_IN_MASTER_DATA` with up to five suggestions; apply proceeds with the typed name.
   - An unknown or inactive `brandId` stays a blocking `SCHEDULE_BRAND_NOT_FOUND`.
4. The MCP server instructions (bridge.mjs) change step 3: for that warning the assistant asks the user whether to use
   one of the suggestions or keep the typed name, then previews again with the choice. The `brandId` description no
   longer says a Brand must come from Master Data. `CONTRACT.md` and the bridge README follow.
5. Versions: `schedule-assistant` module 1.3.0 → 1.4.0 (behaviour widened, nothing removed); bridge version as the
   bridge already does for instruction changes.
6. Out of scope: Master Data, the Brand picker UI (it already allows typed names), BQ, SketchUp.

## Executor scope (R9.217)

- Schedule service: the single Brand helper per decision 2; `createEntry`, `createOption`, `createTemplateItem`,
  `updateOption`, `updateTemplateItem` and any other caller of the old helper use it.
- Schedule composer: decision 3 in preview and apply (issue vs warning, exact-name resolution, result wording).
- Bridge instructions, tool descriptions, `CONTRACT.md`, README, module manifest version per decisions 4-5.
- Tests: typed Brand kept on create entry / create option / create template item / edit; `brandId` still validated;
  composer preview with an exact Master Data match (resolved), with no match (warning + suggestions, apply stores the
  typed name), with an inactive `brandId` (blocking); bridge instruction text check if one exists.
- Changelog R9.217. No migration.

## Acceptance

- Adding a new item with Brand "Lalapis" typed in the app keeps "Lalapis" after saving.
- Asking the Assistant to set GL-03's Brand to "Lalapis" shows a warning with any suggestions, asks, and after the
  user keeps the typed name, applies it.
- "Jotun" typed in the Assistant resolves to the Master Data Brand Jotun.
