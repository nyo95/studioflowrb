# Active Plan

Plan ID: WO-MD-SAMPLE-01 (physical sample shelf in Master Data; a requested sample goes onto the shelf and StudioFlow learns it arrived)
Scope: Master Data backend for the office sample shelf (rack/box, quantity, status, holder, movement history), the "put on shelf" step from a sample request, and the StudioFlow public command that marks that request received. Minimal UI wiring only; the Lead designs the screens in the next revision.
Target revisions: R8.385 (this plan), R8.386 (Executor: backend + minimal wiring), R8.387 (Lead review), R8.388 (Executor correction pass), R8.389 (Lead review: PASS), R8.390 (Lead UI revision).
Status: READY — Lead UI revision (backend accepted at R8.388, see "Review of R8.388"). No Executor work remains.
Priority: P1
Owner: Product Owner. Decisions confirmed by the owner in chat on 2026-10-07 (kantor).
Last updated: 2026-10-07

## Outcome

Master Data staff can answer "where is that sample, and who has it": every
physical sample sits on a named rack and box, hangs off one SKU, and has a
status (on the shelf, borrowed, sent to a client, lost, discarded) with the
holder's name and, optionally, the StudioFlow project it went out for. Every
change leaves a movement row. When a sample a designer asked for arrives, staff
put it on the shelf straight from the sample request, and the designer's
Schedule shows "Sample received" without the designer touching it.

## Legacy evidence (read-only)

Checkout `D:\Misc\ProjectsHUB\studioflow` (kantor), `main` at
`c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27`, tracked tree clean, 17 untracked
files (uploads, `foldering/`, two `tmp/*.dump`; not read). Only committed files
were read, through `git show`. No legacy database was touched.

Live at that commit: `/masterdata/samples` (`src/app/masterdata/samples/page.tsx`,
`subapps/master-data/components/SampleLibraryClient.tsx`,
`subapps/master-data/actions/sample-actions.ts`,
`subapps/master-data/services/catalog-sample-service.ts`,
`subapps/master-data/lib/sample-location.ts`, `types/sample.ts`; models
`master_data.Sample`, `SampleMovement`, enums `SampleStatus`, `SampleAction`).
Not reachable from any screen at that commit: the request panel
(`SampleRequestPanel`, removed from the nav 2026-08-11), `ProductRequestTable`,
`SampleInventoryTable`, the schedule's `sku_product_requests` read, and
`createProjectProductRequestAction` (no caller).

| Legacy behavior | Verdict | Rebuild destination |
|---|---|---|
| Sample = one row per SKU on a rack/box with location note, quantity, notes; brand/category/price only through the SKU | **KEEP** | `master_data.Sample` |
| Rack/box normalised: trim, collapse spaces, upper case (`normaliseLocation`) | **KEEP** | Sample service |
| Five statuses AVAILABLE / BORROWED / SENT_TO_CLIENT / LOST / DISCARDED, shown as stored (no mapping) | **KEEP** | `SampleStatus` |
| Holder name required for BORROWED and SENT_TO_CLIENT only; LOST/DISCARDED need none | **KEEP** | `setSampleStatus` |
| Holder is free text | **FIX** (owner 2026-10-07: name **plus an optional StudioFlow project**) | `holder_project_id` + `holder_project_name` snapshot |
| Movement log on every change, never shown on screen | **KEEP** log, **FIX** show it (per-sample history read) | `SampleMovement`, `getSampleHistory` |
| Soft delete refused while the sample is out | **KEEP** | `deleteSample` |
| Delete logged as an `OUT` movement and audited as actor "system" | **FIX** | `REMOVED` movement, real actor |
| A status change to the same status still wrote a movement | **FIX** | no-op when nothing changes |
| Rack/box move logged as ADJUST with "from → to" text | **KEEP** as kind `MOVED` with from/to | `updateSampleLocation` |
| Header counts: total, available, borrowed, sent to client, lost+discarded, rack count | **KEEP** | `getSampleSummary` |
| Two different receive-sample paths (`library-service.receiveProjectProductRequest` only trims rack/box; `sample-request-actions.receiveSampleAction` normalises) | **MERGE** into one path | coordinator `shelve` → Master Data `shelveSampleFromIntake` |
| Receiving created a DRAFT SKU from a typed code + name | **FIX** (owner: SKU required): staff pick an existing SKU; the Lead adds a quick "New SKU" in the UI through the existing `createSku` | not in this backend |
| Receiving set the request RECEIVED | **KEEP** (owner 2026-10-07) through a StudioFlow public command | `markSampleReceivedFromShelf` |
| `due_at` column (never written) | **PURGE** | — |
| `ProjectProductRequest`, its vendor-follow-up/UNAVAILABLE/reopen states | **PURGE** here; already replaced by `SfScheduleSampleRequest` + `SampleRequestIntake` (R8.183) | — |
| Status applies to the whole row (cannot lend 1 of 3 pieces) | **KEEP** as known limit | — |

## Locked Decisions

1. **Scope (owner):** the physical sample shelf in Master Data. The existing
   request flow (take, quote, priced, declined, price sync) is unchanged except
   for the new "put on shelf" step.
2. **SKU required (owner):** every Sample has `sku_id` (FK to `Sku`,
   `onDelete: Restrict`). Creating or shelving onto an archived SKU
   (`deleted_at` set) is refused (`SAMPLE_SKU_NOT_FOUND`). Archiving a SKU later
   does not touch its samples (masterdata.md §2: Sample relations stay
   independent); reads still show them, with the SKU marked archived.
3. **Holder (owner):** `holder_name` (free text, required for BORROWED and
   SENT_TO_CLIENT, cleared otherwise) and optional `holder_project_id` +
   `holder_project_name` (plain id and a name snapshot, **no** foreign key into
   StudioFlow). The project picker lists StudioFlow projects that are not
   archived, read through a new StudioFlow public read; Master Data never imports
   StudioFlow. A project may only be set together with a held status.
4. **Out since:** `out_since` is set when a sample enters a held status from a
   non-held one, kept when moving between BORROWED and SENT_TO_CLIENT or
   changing the holder, and cleared otherwise.
5. **Statuses and movements.** Movement kinds: `IN` (racked: created or
   shelved), `OUT` (to BORROWED or SENT_TO_CLIENT, or a holder change while
   out), `RETURN` (back to AVAILABLE from a held status), `STATUS` (to LOST or
   DISCARDED, or back to AVAILABLE from them), `MOVED` (rack or box changed;
   stores from/to), `REMOVED` (soft delete). Each movement stores the status
   after it, holder name and project name (snapshots), a note, and the actor id
   and label. A change that alters nothing (same status, holder and project; or
   same rack, box, note, quantity and notes) writes nothing and returns the row.
6. **Delete:** soft delete (`deleted_at`), refused while BORROWED or
   SENT_TO_CLIENT (`SAMPLE_OUT`). Deleted samples leave every list and count;
   their history stays.
7. **Shelving a requested sample (owner):** staff choose "put on shelf" on a
   sample request row that is NEW, IN_PROGRESS or PRICED (not DECLINED). A NEW
   row is taken first with the existing `take` rules (so a request the designer
   already marked received, or one in an archived project, is refused there and
   can still be racked by hand from the Samples page). One request gives at most
   one sample: `Sample.source_intake_id` is unique; a second attempt is
   `SAMPLE_ALREADY_SHELVED`. Shelving fills `intake.sku_id` when it is empty and
   never changes the intake's status (shelved and priced stay two facts).
8. **StudioFlow learns the arrival (owner; replaces the 2026-09-29 Lead default
   that Master Data never writes back).** After the sample is committed, the
   coordinator calls a new StudioFlow public command
   `markSampleReceivedFromShelf({ actor, requestId, rack, box })`: REQUESTED →
   RECEIVED with `received_by` = the Master Data staff member and
   `received_note` = "On the shelf: <RACK> / <BOX> (Master Data)"; audit
   `studioflow.schedule.sample-received` with `metadata.via = "masterdata"`.
   Already RECEIVED, a cancelled (deleted) request, or an archived project:
   no write, returns `{ updated: false, reason }`. It is a trusted command
   without a StudioFlow permission check; the coordinator authorizes it with
   Master Data permissions (decision 9). "Priced" still never flips RECEIVED.
9. **Permissions:** new `masterdata.sample.read` (lists, counts, history, rack
   list) and `masterdata.sample.manage` (create, edit location, status, delete),
   registered and labelled like the existing Master Data pairs. Shelving needs
   `masterdata.sample-request.manage` **and** `masterdata.sample.manage`. The
   project picker read needs `masterdata.sample.manage`.
10. **No cross-app transaction.** Order: Master Data commit first, then the
    StudioFlow command. If the second step fails, the sample stays on the shelf
    and the coordinator returns `studioFlowUpdated: false`; a separate
    coordinator command `retryStudioFlowReceived(sourceRequestId)` (only for an
    intake that has a shelved sample) repeats it. The queue row exposes the
    shelved sample (id, rack, box) so the screen can offer that retry when the
    source is still REQUESTED.
11. **Requester notification:** shelving notifies the requester through the
    existing Master Data notifier ("Your sample is on the shelf" with product,
    project, rack and box), the same way priced/declined do.
12. **Limits:** rack and box 1–40 characters after normalising; location note
    ≤ 200; notes ≤ 1000; holder name ≤ 120; quantity integer 1–999. Only rack
    and box are upper-cased; the holder name is trimmed and keeps its case.

## Backend Contract

Master Data (additive migration in `master_data`; apply to the rebuild dev and
test databases only):

- `Sample` and `SampleMovement` per the decisions above, enums `SampleStatus`
  and `SampleMovementKind`, indexes for `(rack, box)`, `status`, `sku_id`,
  `deleted_at`, `(sample_id, created_at)`; `source_intake_id` unique nullable.
- Service: `listSamples({ grants, search?, status?, rack? })` ordered by rack,
  box, SKU name, each row with SKU id/code/name/brand name/archived flag;
  `getSampleSummary`; `listSampleRacks` (distinct racks for the rack picker);
  `getSampleHistory({ sampleId })` newest first; `createSample`,
  `updateSampleLocation`, `setSampleStatus`, `deleteSample`;
  `shelveSampleFromIntake({ intakeId, skuId, rack, box, quantity?, locationNote? })`.
  Every write audits (`masterdata.sample.*`) and writes its movement in the
  same transaction.
- `listSampleRequestIntakes` / the intake read expose the shelved sample
  (`{ id, rack, box } | null`).
- Public commands for the coordinator: the shelve command and the intake read
  changes, exported the same way as the existing sample-request commands.

StudioFlow public contract:

- `listProjectChoices()` (id, name; not archived; name order) in the public
  read surface.
- `markSampleReceivedFromShelf({ actor, requestId, rack, box })` per decision 8.

Coordinator (`src/application/sample-request-coordinator.ts`, shell wiring in
`src/app/sample-request-runtime.ts`): `shelve`, `retryStudioFlowReceived`,
`listProjectChoices` (authorized per decision 9), and the shelved sample on
each queue row.

## UI Contract (minimal wiring only; the Lead owns the design)

- A plain `/masterdata/samples` page (nav entry "Samples", shown with
  `masterdata.sample.read`) that lists samples and offers create, edit location,
  change status (with holder and optional project) and delete, enough to
  exercise every command. No visual design work.
- On the Sample requests screen, a plain "Put on shelf" form per eligible row
  (SKU picker from the existing SKU choices, rack, box, quantity, note) and the
  retry action when StudioFlow was not updated.
- Server actions validate input with the existing action helpers and return
  safe errors.

## Boundaries and Non-goals

- No SKU creation in this work order (the Lead adds quick "New SKU" in the UI
  through the existing `createSku`).
- No partial lending of a multi-piece row, no due dates, no reminders.
- StudioFlow screens are unchanged; the designer only sees the existing
  "Sample received" state and note.
- No cross-schema foreign keys; Master Data does not import StudioFlow and
  StudioFlow does not import Master Data.
- No change to the request lifecycle beyond decisions 7, 8, 10 and 11.

## Acceptance Criteria (Executor)

1. Create, edit location (rack/box normalised; a move writes `MOVED` with from
   and to), status changes and delete behave per decisions 4–6 and 12, with the
   exact movement kinds; no-op changes write nothing.
2. BORROWED or SENT_TO_CLIENT without a holder is refused; LOST/DISCARDED
   clear holder and project; a project without a held status is refused.
3. Delete is refused while out; a deleted sample leaves lists and counts and
   keeps its history.
4. Archived SKU: refused for create and shelving; existing samples still listed
   with the archived flag.
5. Shelving: works from NEW (takes first), IN_PROGRESS and PRICED; refused for
   DECLINED and for a second time on the same request; fills an empty
   `intake.sku_id`; leaves the intake status as it was; notifies the requester;
   marks the StudioFlow request RECEIVED with the note and actor; a request
   already RECEIVED or in an archived project is left untouched.
6. A failing StudioFlow step leaves the sample on the shelf, returns
   `studioFlowUpdated: false`, and `retryStudioFlowReceived` then succeeds.
7. Permissions per decision 9, including refusals for read-only staff.
8. Summary counts each status separately (LOST + DISCARDED together as
   off-shelf) and counts racks.

## Verification

`npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run check:boundaries`,
`npm run check:legacy-runtime`, `npm test` (all, nothing skipped), and
`npm run build`, which must pass (Next 16 builds beside a running dev server).
New integration tests in the Master Data and StudioFlow suites and coordinator
unit tests for the criteria above. Migration applied to the rebuild dev and
test databases only, after confirming both targets.

## Reviewer Acceptance

The Lead, after the UI revision: walk the Samples page (add, move, lend with a
project, send to client, mark lost, return, delete refusal while out, history),
then put a requested sample on the shelf and see "Sample received" with the
shelf note in that project's Schedule and the requester's notification.

## Regression Risks and Recovery

Risk: the Master Data → StudioFlow write reopens the coupling the request flow
avoided; mitigated by a single trusted public command with idempotent
semantics and no cross-schema keys. Risk: permissions not granted to existing
roles hide the page; the migration or role defaults must give Master Data staff
roles the new pair the same way `masterdata.sample-request.manage` was granted.
Recovery: revert R8.386; the migration is additive (drop the two tables and two
enums).

## Review of R8.386 (Lead, 2026-10-07) — CORRECTION REQUIRED

Commit `187102b`. What holds: the migration and models match the plan; the
permission pair is registered (through `Object.values(MASTERDATA_PERMISSIONS)`
in `app-registrations.ts`); normalising, limits, out-since, no-op detection,
delete refusal, the StudioFlow receipt command's idempotent outcomes, the
coordinator's order and retry are as locked. Shelving keeps the intake status.

Corrections, one consolidated pass (R8.388):

1. **Production build broken by R8.386 (not pre-existing).**
   `src/apps/studioflow/public/index.ts` now re-exports
   `createStudioFlowSampleRequestCommand`, which imports `../shared` (runtime
   `Prisma` from the generated client). Client components import
   `@/apps/studioflow/public` (the MOM pages, the schedule board), so the
   generated client lands in a browser chunk: Turbopack fails on
   `node:module` at `/(platform)/studioflow/projects/[projectId]/mom/page`.
   Proven by the Lead: with those two export lines removed, `npm run build`
   passes; with them, it fails. Keep the command out of the barrel that client
   code imports (the runtime already imports the file directly), and make
   `npm run build` part of the checks again. The R8.386 changelog's
   "pre-existing unrelated" wording is corrected in the R8.388 entry, not by
   amending R8.386.
2. **No tests were added** (878 before and after). Add the integration and
   coordinator tests for every Acceptance Criterion 1–8 above, including the
   StudioFlow side of shelving (RECEIVED, note, actor, `metadata.via`) and its
   three no-write outcomes, and the retry path with a failing StudioFlow step.
3. **Requester notification on shelving missing** (decision 11). Notify the
   requester through the existing Master Data sample-request notifier, in the
   shelving transaction, with product, project, rack and box.
4. **The holder project is trusted from the browser** (decision 3 requires a
   snapshot of a real, non-archived StudioFlow project). The client sends
   `holderProjectName` and any id. Route a status change that names a project
   through the coordinator: it resolves the id through StudioFlow's public read
   (unknown or archived → `SAMPLE_PROJECT_NOT_FOUND`) and passes the resolved
   name to Master Data; the Master Data action no longer accepts a project name
   from the client.
5. **Read shape.** `listSamples` returns raw Prisma rows. Return a mapped read
   (rack, box, quantity, notes, status, holder, project name, out since, SKU id,
   code, name, brand name and an explicit `skuArchived`), and let search also
   match brand name, holder name and project name (legacy searched borrower and
   brand).
6. **Small fixes.** The StudioFlow receipt command uses the app clock
   (`nowOf(ports)`) like the existing receive; the coordinator's new
   dependencies are required instead of optional-with-runtime-throw.

Waived: the minimal Samples and "Put on shelf" screen wiring (decision: the
Lead builds those screens in the next revision, so throw-away forms are not
needed). Leave the current minimal page as is.

## Review of R8.388 (Lead, 2026-10-07) — PASS

Commit `09e78f2`. All six corrections are in the code. The Lead re-ran every
gate independently: `tsc --noEmit`, lint, `check:boundaries`,
`check:legacy-runtime`, `npm test` 904/904 (none failed, skipped or
cancelled; 26 new: Master Data shelf suite 10, StudioFlow receipt command 5,
coordinator 11, covering Acceptance Criteria 1–8), and `npm run build` passes.
The extra fix (a project sent with a non-held status is now refused instead of
dropped) matches criterion 2. A failed shelving notice rolls the shelving back,
the same transaction rule as the priced/declined notices. Reviewer browser
acceptance waits for the UI revision below.

## Next: Lead UI revision (R8.390)

UI-only, no Executor. Built on the accepted backend; legacy
`SampleLibraryClient` is the parity floor.

- **Samples page** (`/masterdata/samples`): header counts; "By rack" (one card
  per rack, boxes in order) and "List" views; search and status filter; add a
  sample (SKU picker with a quick "New SKU" through the existing `createSku`,
  rack combobox from `listSampleRacks`, box, quantity, location note, notes);
  edit location; change status with holder name and an optional project picker
  (`listProjectChoices`); per-sample history (`getSampleHistory`); delete
  (refusal shown when out); archived SKUs flagged. Read-only staff see no
  write controls; staff without `masterdata.sample.read` get a proper
  no-access state instead of an error.
- **Sample requests screen:** "Put on shelf" on NEW, IN_PROGRESS and PRICED
  rows (same SKU picker and rack combobox), the shelved location on the row,
  and "Tell StudioFlow again" when the source is still REQUESTED after
  shelving.
- Browser acceptance per "Reviewer Acceptance" above, then close this plan.

## Executor Prompt

None: the remaining work is the Lead's UI revision.
