# Active Plan

Plan ID: WO-AUDIT-FIX-01 (Schedule gap-filling codes, work-price identity, supplier import honesty)
Scope: StudioFlow Product Schedule numbering; Master Data price-database import
Target revision: R8.490 (slice A), R8.491 (slice B), R8.492 (slice C), one local commit each
Status: READY
Priority: P1
Owner: owner decisions 2026-10-09 (this plan, R8.489)
Last updated: 2026-10-09 (Lead)

The previous plan DISCUSS-STORAGE-TUNNEL-01 is answered by
`docs/agent/reports/STORAGE-TUNNEL-DISCUSSION.md` (R8.485) and waits for the
Lead's verdict (BACKLOG, Platform Foundation). It is not part of this plan.

## Outcome

- **A. Schedule:** a new row in a code group takes the **lowest empty number
  from 1**. HT-01 deleted, HT-02 live → the next HT row is HT-01. Existing rows
  never change code by themselves. The "Add HT-xx" button shows the same
  number the server will give.
- **B. Work prices (labor and material+labor) in the price-database import:**
  the identity stays **supplier + name**. A file row that matches an existing
  live price by supplier + name but has a **different unit or category** is
  refused for that row with a clear reason; it never overwrites the unit or
  category. Same unit and category → price/notes update as today.
- **C. Supplier sheet:** the import tells the person plainly which supplier
  rows were not changed because the supplier already exists, so nobody thinks
  an edited phone number in Excel was saved.

## Context and Evidence

- Contract: `docs/apps/studioflow/STUDIOFLOW-REWORK-CONTRACT.md` §11.2
  (updated in R8.489 to the new rule — read it first).
- Today (R8.464): `allocateIncrement` in
  `src/apps/studioflow/schedule/sync.ts:127` gives "highest ever + 1" using
  `SfScheduleCodeMark` (`prisma/schema/studioflow.prisma`, migration
  `20261009120000_sf_schedule_code_mark`); an imported own number is kept when
  no live sibling uses it. Callers: `createEntryWithOptionalOption`
  (sync.ts:153, used by quick add, Add item, template seed, import, Ideas →
  Schedule) and move-to-category (`schedule/service.ts:735`).
- `listSchedule` (`schedule/service.ts:~351`) computes `nextNumber` from the
  marks and live rows; the board's add button uses it (R8.480).
- Reorder `reassignCodes` (`schedule/service.ts:~239`) keeps the group's set of
  numbers — unchanged by this plan.
- Legacy evidence (functional spec, read-only, optional): legacy filled gaps
  for new schedule rows ("normalisasi"). The owner's example above is the
  requirement; legacy `schedule-service.ts` at commit
  `c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27` may be read for reference only if
  the owner gives its path. Its whole-group renumbering is **not** wanted.
- Price import: `src/apps/masterdata/services/price-database-workbook.service.ts`
  ~L276-296 matches existing by `vendor_id|key(name)` and then updates
  category and unit too. Template notes L327 say existing suppliers are left
  unchanged; the current-data export (L361) includes all suppliers, which makes
  the sheet look editable.
- Pricing service bulk paths already use supplier + name as identity
  (`PRICE_IDENTITY_CONFLICT`, `pricing.service.ts:299,327`).

## Locked Decisions

1. Schedule new-row number = smallest positive integer not used by a **live
   row** of the same (project, section, prefix). Deleted numbers may come back
   (owner accepted this, 2026-10-09). This replaces R8.464.
2. Existing rows are never renumbered by create, delete, move or import.
   Reorder/swap stays exactly as it is.
3. Import keeps the sheet's own number when the prefix matches and no live row
   uses it (even a formerly deleted number); otherwise lowest empty number.
4. `SfScheduleCodeMark` is removed: model, reads, writes, and a new migration
   that drops `studioflow.sf_schedule_code_mark`. Do not edit the old migration.
5. Concurrency: two creates in the same group at once must not both pick the
   same number. Serialize allocation inside the existing transaction by locking
   the project row (`SELECT id FROM studioflow.sf_project WHERE id = $1 FOR
   UPDATE`, same idiom as `phases/notes.ts:173`) before reading siblings. No
   retry loop, no new helper module.
6. Work-price identity = supplier + name (case/space-insensitive key as
   today). A mismatched unit or category on a match is a **row error** in the
   import (skipped and listed under the default `applyValidRows`, refuses the
   file under `applyValidRows: false`). No database unique index in this plan.
7. Supplier sheet behavior is unchanged (existing suppliers are not updated);
   only the reporting changes. The current-data export keeps its Suppliers
   sheet.

## Backend Contract

- **A.** `allocateIncrement(tx, scope, wanted?)` returns the lowest free number
  (or `wanted` when valid and free) after taking the project row lock. Every
  existing caller goes through it; no caller computes a number itself.
  `listSchedule` returns `nextNumber` per entry = lowest free number of that
  entry's group (pure helper, unit-tested), with no read of the removed table.
- **B.** In the price-database apply (and its preview check, so the problem is
  shown before Save), a matched row whose unit or category differs from the
  live price produces an error on that row, message in plain English, e.g.
  `"Pasang Gypsum" already exists for this supplier with unit m² in Ceiling.
  Use that unit and category to update it, or give this row a more specific
  name.` The existing price is not touched.
- **C.** Preview and apply results carry an `info` message per supplier row
  whose supplier already exists: `Supplier "X" already exists; this row was
  not used. Edit suppliers on the Suppliers page.` and a total
  `suppliersUnchanged` (or extend the existing totals with that name). The
  template Notes wording may be sharpened to match; nothing else in the file
  shape changes.

## UI Contract

Executor wires nothing new for A (the board already reads `nextNumber`). For C,
the existing message list of `TemplateImport` must show the new info lines
(it already renders messages; confirm). No layout or visual work; the Lead owns
any UI polish afterwards.

## Boundaries and Non-goals

- No change to reorder/swap, move-between-categories rules, prefixes, option
  labels (A, B, C… still never reused), or the Google Sheets parser beyond the
  number rule.
- No supplier updating from the sheet, no unique index on price tables, no
  change to SKU price import.
- No new dependency, no new module, no cross-app import.

## Acceptance Criteria

Slice A (integration tests against the rebuild test database):
1. HT-01, HT-02 live; delete HT-01; create → HT-01.
2. HT-01..HT-03; delete HT-02; create → HT-02; create again → HT-04.
3. Delete the only/highest row HT-03 of HT-01..03; create → HT-03.
4. Move a row into a category with a gap → it takes the gap; the source group
   keeps its other codes unchanged.
5. Import a sheet row with own number 01 where 01 was deleted → keeps 01; own
   number used by a live row → gets the lowest empty number.
6. Two concurrent creates in one group → two different numbers, no unique
   error.
7. `nextNumber` on the list equals the number the next create returns (cases 1-3).
8. Migration drops the table; `prisma migrate` status clean; no code references
   `sfScheduleCodeMark`.
9. Existing tests that assert "never comes back" (`service.integration.test.ts`,
   `e2e/studioflow-acceptance.spec.ts`) are updated to the new rule, not deleted.

Slice B: same supplier + name with a different unit → row skipped with the
reason, live price unchanged; different category → same; same unit and
category with a new amount → updated; `applyValidRows: false` with one such row
→ nothing saved.

Slice C: a file whose Suppliers sheet has one existing and one new supplier →
new one created, existing one untouched, an info message names it, total
counts it; preview shows the same message before Save.

## Verification

`npm run typecheck`, eslint, `npm test`, the touched integration suites,
`npm run check:boundaries`, `npm run check:legacy-runtime`, `prisma migrate`
on the rebuild test database only, and the affected Playwright specs
(`e2e/studioflow-acceptance.spec.ts`, `e2e/masterdata-import.spec.ts`).
Report any skipped check as skipped.

## Reviewer Acceptance

Lead, after the commits: in the browser, delete HT-01 in a project and see the
add button offer HT-01 and create it; import a price file with a unit
mismatch and see the reason; import a Suppliers sheet with an existing
supplier and see the "not used" line.

## Regression Risks and Recovery

- A deleted code can now be reissued to a different item; this is the owner's
  choice. Recovery if reversed: restore "highest ever" from history; not
  planned.
- Lock scope is the project row for the length of one create; schedule writes
  in one project serialize. Acceptable at studio scale.

## Executor Prompt

You are the Backend Executor. Location: <rumah|kantor> (ask the owner if not
stated). Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, `PLAN.md`
(WO-AUDIT-FIX-01) and `docs/apps/studioflow/STUDIOFLOW-REWORK-CONTRACT.md`
§11.2, then implement slices A, B and C exactly as locked, one local revision
commit each (R8.490, R8.491, R8.492 — confirm they are the next unused numbers
in `CHANGELOG.md`; if not, use the next unused ones in order). Slice A replaces
"never reissue" with lowest-empty-number gap filling for new Schedule rows,
locks the project row during allocation, removes `SfScheduleCodeMark` with a
new drop migration, and updates `nextNumber` and the existing tests to the new
rule. Slice B refuses a price-import row that matches supplier + name but
differs in unit or category. Slice C reports existing suppliers in the
Suppliers sheet as not used. Run every database command only against the
verified rebuild-only test database. Do not touch reorder, option labels, or
supplier updating. Run the checks in Verification, then reply with only a
Planner/Reviewer prompt: commits, checks with results, limitations, dirty
files, and a request for verdict.
