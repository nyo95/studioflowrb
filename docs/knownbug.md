# Known Bugs by Application

Status: active defect ledger, reconciled through R8.81 on 2026-09-16.

Planned features belong in [`roadmap.md`](roadmap.md). When a bug is fixed, move
it to Closed, name the revision, and record the fix in `CHANGELOG.md`.

## Platform Foundation

### KB-028 — Symlink escape protection is incomplete and unproven

- **Observed (R8.31 review):** The adapter's symlink test catches assertion
  failures together with platform symlink-creation errors, so it can pass even
  when a write escapes the root. The route handlers also resolve filesystem
  paths independently and do not apply the adapter's realpath boundary check.
- **Expected:** Public and private application reads, writes, and removals all
  reject symlink paths that resolve outside their configured root.
- **Required correction:** Centralize or duplicate a correct realpath-aware
  boundary check for every filesystem surface, and make the test skip only
  symlink creation permission errors—not failed security assertions.
- **Priority:** P1 — storage isolation.
- **Status:** Closed — corrected and reverified in R8.33. The resolver is now
  used by both asset routes and the adapter; symlink permission skips are
  narrowly classified and assertion failures are no longer swallowed.

### KB-027 — Local private asset signed URL expires immediately

- **Observed (R8.29 review):** `LocalFilesystemStorage.createSignedReadUrl`
  writes the `expires` query parameter as the requested duration (for example
  `600`), while the private asset route interprets it as an absolute Unix
  timestamp. A generated MOM URL is therefore rejected as expired immediately.
- **Expected:** The provider and private route agree on one expiry meaning;
  normal MOM reads remain valid for the requested duration and expire only
  afterward.
- **Required correction:** Make the signed URL expiry contract explicit and
  apply it consistently in the local adapter and route. Add an integration
  test covering a valid URL and an expired URL.
- **Priority:** P1 — private asset availability.
- **Status:** Closed — corrected and reverified in R8.31. The adapter and
  private route now use the same absolute Unix expiry timestamp contract.

### KB-026 — PF-0 does not identify the frozen StudioFlow RB reference

- **Observed (R8.18 review):**
  `docs/FOUNDATION-BASELINE-FREEZE.md` pins the general R8.12 rebuild baseline
  and freezes future StudioFlow continuation, but it never states that the
  current StudioFlow RB implementation is the frozen reference to preserve
  through Foundation work and use at the PF-8/Recovery boundary.
- **Expected:** Foundation Reference §30 PF-0 explicitly pins the current
  StudioFlow RB as a frozen reference, alongside the rebuild and legacy
  evidence baselines, Master Data behavior, and BQ behavior.
- **Why it matters:** A prohibition on new StudioFlow work does not identify
  the reference state against which Foundation compatibility and later recovery
  work must be judged. The gap permits later work to treat the generic R8.12
  baseline, an R8.16 documentation overlay, or a moving checkout as the
  StudioFlow reference.
- **Required correction:** Amend the canonical PF-0 record to name the exact
  frozen StudioFlow RB reference and its relationship to R8.12/R8.16, without
  changing StudioFlow behavior or widening the approved exception.
- **Acceptance condition:** The record expressly identifies the current
  StudioFlow RB as the frozen reference; it remains distinct from the R8.16
  documentation-only overlay and preserves the PF-8-only release condition.
- **Priority:** P1 — Foundation/Recovery gate ambiguity.
- **Status:** Closed — independently verified in R8.21. The canonical record
  now names R8.12 as the frozen StudioFlow RB reference, preserves R8.16 as a
  non-moving documentation-only overlay, and retains PF-8 as the sole release
  condition.

### KB-020 — Office rebuild migration history contains an untracked migration

- **Observed (R7.56):** `prisma migrate status` reports database-only migration
  `20260904153201_add_updated_by_label_vendor_brand` on the isolated office
  rebuild database. No matching file was found in repository history.
- **Expected:** Applied migration history is reproducible from committed files.
- **Mitigation:** The reviewed additive routing migration was applied with
  `migrate deploy`; all 35 repository migrations also deploy successfully to a
  fresh isolated test database. Do not reset the office database or fabricate
  the missing SQL/checksum. Recover the original migration and reconcile its
  provenance before using `migrate dev` against this existing database.
- **Status:** Open, pre-existing environment/history gap; not a routing failure.

## UI Engine and Shared Utilities

### KB-004 — Supabase image provider is not provisioned in kantor

- **Observed:** R7.52 provides the canonical UI Engine ImageWorkspace, Core
  storage port, fake seam, and server-only Supabase adapter, but `.env.kantor`
  has no Supabase provider credentials and no production bucket has been
  provisioned.
- **Expected (superseded 2026-09-14):** The final deployment target is now
  self-hosted/local, so Supabase provisioning is no longer an acceptance
  requirement. The shared UI Engine capability and consumer-owned policy remain
  valid.
- **Replacement:** The active PF-1 plan implements and verifies
  `LocalFilesystemStorage` with a configuration-driven root, public Brand mark
  surface, and authenticated/private MOM endpoint.
- **Status:** Superseded by owner decision; do not provision Supabase for
  Foundation. The replacement local-provider work remains open in `PLAN.md`.

## Master Data

Deferred media, Samples, and import/export capabilities are roadmap items, not
defects.

### KB-024 — Promotion mapping still contains avoidable `any` types

- **Observed:** `src/apps/masterdata/service.ts` still uses several `(p: any)`
  parameters in promotion mapping.
- **Expected:** Promotion mapping uses the narrow persisted/domain type instead
  of opting out of type checking.
- **Mitigation:** No current functional impact or blocker; keep the mapping
  behavior unchanged until the focused typing cleanup is scheduled.
- **Priority:** P2 — cleanup, non-blocking.
- **Status:** Closed in R8.85 — promotion reference mapping now uses narrow
  Prisma payload types instead of `(p: any)` parameters, with behavior
  unchanged.

### KB-025 — Master Data services barrel exposes internal helpers too broadly

- **Observed:** `src/apps/masterdata/services/index.ts` exports many helpers
  that are internal implementation details. No external consumer of
  `@/apps/masterdata/services` was found during the audit.
- **Expected:** The barrel exposes only the intended public service contract;
  internal helpers remain private to the Master Data implementation.
- **Mitigation:** There is no current coupling problem; preserve the existing
  exports until consumers and the public boundary are reviewed together.
- **Priority:** P2 — cleanup, non-blocking.
- **Status:** Open; deferred cleanup.

## BQ

No open BQ bug is currently recorded.

## StudioFlow

The R7.55 audit read the whole StudioFlow surface against
[`docs/archive/studioflow-rb/studioflow-project-contract.md`](archive/studioflow-rb/studioflow-project-contract.md) and
opened KB-012 … KB-018 below (KB-019 was closed in R8.05; KB-021 … KB-023 were added by the owner audit).
KB-013, KB-014 and KB-015 are one gap seen from
three sides: the client answer is persisted as a single immutable `SfResponse`
with no state, no replacement link and no reason, so the contract's whole §6.5
/ §6.6 correction and draft behaviour has nowhere to live. They are listed apart
because each has its own observable symptom, but they must be fixed by one
migration and one slice.

> **StudioFlow Rework note (R8.70/R8.71, 2026-09-15).** The rebuild
> StudioFlow was archived (tag `archive/studioflow-rb-r8.69`) and replaced by
> the legacy rework (`apps/studioflow/STUDIOFLOW-REWORK-CONTRACT.md`).
> **KB-013 … KB-018 and KB-023 are closed in R8.71 as superseded**: the code
> they describe no longer exists, and SF-R1 implements the legacy behavior
> instead (client answers → feedback/reject revisions; archive/restore;
> fixed phases; general to-dos on Today). KB-012/KB-022 were closed with SF-R2
> (MOM, R8.72); KB-003/KB-021 close with SF-R3 (Schedule).

### KB-012 — A MOM correction is issued instantly and cannot correct anything

- **Observed:** `supersedeMom` copies the issued document's content into a new
  document and issues it inside the same transaction. The new record is
  immutable from the moment it exists, so the only thing a "correction" can
  change is the header the caller retypes.
- **Expected:** MOM contract §3 and §10.1 — a correction enters the ordinary
  `DRAFT → ISSUED` path: it opens as an editable draft carrying a copy of the
  source content, and the source becomes `SUPERSEDED` when that draft is issued.
- **Mitigation:** Discard-and-recreate is the only way to change issued content
  today, which loses the supersede link.
- **Status:** Closed in R8.72 as superseded — SF-R2 ported the legacy MOM,
  which has no issue/supersede lifecycle; every MOM stays editable.

### KB-013 — A recorded client answer cannot be corrected

- **Observed:** `SfResponse` has no `state`, `replaces_response_id` or
  `correction_reason`, and no service command replaces an effective answer.
  Project contract §6.5, access matrix §12 ("Correct client answer"), UX spec
  §3.8 and acceptance rows L1a–L1c all describe this behaviour; none of it
  exists. An answer recorded against the wrong round, or as approval when the
  client asked for revision, is permanent.
- **Expected:** §6.1/§6.5 — one root response and a linear replacement chain per
  reviewed round; the terminal entry is effective, older entries stay readable
  and marked corrected; a mistaken approval reopens the phase and opens the next
  draft atomically; later rounds are never rolled back.
- **Mitigation:** Stop the round and start a new one. This leaves a truthful but
  clumsy history and cannot undo a phase closed on a mistaken approval.
- **Status:** Closed in R8.71 — superseded. SF-R1 removes the round/response model entirely; the code this described no longer exists.

### KB-014 — A client answer cannot be collected as a draft

- **Observed:** `recordResponse` commits every consequence immediately. Contract
  §6.6 and decision D32 require an answer that can be assembled over several
  days while the round stays `SENT` and its age keeps counting.
- **Expected:** At most one `DRAFT` answer per round; it changes no state,
  satisfies no phase closure, and fires §6.2's consequences only on commit.
  Stopping the round discards it silently and unaudited.
- **Mitigation:** Record the answer once, when the client has finished
  answering; earlier remarks are kept outside the application until then.
- **Status:** Closed in R8.71 — superseded. SF-R1 removes the round/response model; this gap no longer applies.

### KB-015 — Withdraw send has no command behind it

- **Observed:** Contract §6.2 and §12 define **Withdraw send** (`SENT → DRAFT`,
  no successor, reason required, send history retained). No service command
  exists. Until R7.55 the round menu rendered a permanently disabled "Withdraw
  send" row, which the UX spec §3.6 forbids; R7.55 removed the dead row rather
  than leaving a control nobody can use.
- **Expected:** The command exists, is audited, and the menu entry returns with it.
- **Mitigation:** Stop the round and start a new one, accepting a consumed
  round number.
- **Status:** Closed in R8.71 — superseded. SF-R1 removes the send/withdraw surface; this gap no longer applies.

### KB-016 — A project cannot be archived or restored

- **Observed:** `SfProject.deleted_at` exists and every read filters on it, but
  no service command sets or clears it. Contract §12 lists "Archive Project
  (`deleted_at`) | `project.manage` | Reversible" and makes restoration explicit.
  `archiveClient` refuses while live projects remain, so a finished client can
  never be archived either — the two rules are locked together.
- **Expected:** Audited archive and restore for a project, archived projects
  read-only until restored, and a client that becomes archivable once its
  projects are.
- **Status:** Closed in R8.71 — SF-R1 implements project archive/restore with read-only guard and client block-while-running.

### KB-017 — The phase template and a project's phases cannot be administered

- **Observed:** `listPhaseTemplates` is read-only and there is no command to
  edit the studio phase template or to add/remove a phase on one project.
  Contract §4.1 makes data-driven phases the reason the enum was purged, and
  §12 grants both operations to `project.manage`; alignment §1 names it as one
  of the rebuild's purposes ("adding a phase does not require a code change").
  Today it still requires a seed change.
- **Expected:** Template CRUD with an immutable `key` once any project snapshot
  uses it, plus per-project add and remove-while-empty, none of which rewrites a
  running project.
- **Mitigation:** Edit the seed and reseed the rebuild database.
- **Status:** Closed in R8.71 — superseded. SF-R1 uses a fixed phase set seeded from a Studio Settings template; phase add/remove per-project is deferred to roadmap.

### KB-018 — Redirected phase and iteration routes still carry unreachable controls

- **Observed:** `src/app/(platform)/studioflow/[id]/phases/[phaseId]/page.tsx`
  redirects to the project page, yet `phase-controls.tsx` and `actions.ts` in
  that folder are still present, and the same holds under
  `phases/[phaseId]/iterations/[iterationId]/`. The unreachable
  `PhaseControls` offers "Finish phase" with none of §4.3's preconditions, and
  `RecordFileForm` is a second copy of the form in `files/file-controls.tsx`.
- **Expected:** No unreachable route surface. Dead code that contradicts the
  contract is worse than absent code: the next agent reads it as intent.
- **Mitigation:** None needed at runtime — nothing renders it.
- **Status:** Closed in R8.71 — superseded. The old `studioflow/[id]` route tree was removed entirely; SF-R1 routes under `studioflow/projects/[id]`.


### KB-021 — Product Catalogue is a global reuse pool; legacy was per-project

- **Observed (owner audit, 2026-09-10):** `/studioflow/catalogue` is a single
  studio-wide pool. `studioflow-project-contract.md §11` and the roadmap both
  describe it as "a StudioFlow-wide reuse pool shared across StudioFlow
  projects." The implemented route has no `project_id` binding; products are
  studio-global.
- **Expected (owner):** The legacy Catalogue was scoped per project. That
  behavior was correct and should have been preserved. The "reuse pool" framing
  in the contract was a mis-specification; the owner had not signed off on
  making the catalogue global. The rebuild should have carried the per-project
  scoping onto the new foundation, with the UIUX redesigned but the ownership
  model kept.
- **Impact:** Every existing catalogue record is unowned by a project, and the
  Schedule slice (`KB-003`) was designed on top of the wrong ownership model.
  No catalogue work should continue until the per-project scoping is restored.
- **Mitigation:** Use the current global list as a reference only.
- **Status:** Closed in R8.73 — SF-R3 replaces the wrong global catalogue
  surface with project-owned Product Schedule entries and typed option
  snapshots. Reuse is explicit cross-project snapshot copy, not a mutable
  studio-wide catalogue pool.

### KB-022 — MOM implementation does not match owner's required behavior

- **Observed (owner audit, 2026-09-10):** MOM was rebuilt with a formal
  `DRAFT → ISSUED → SUPERSEDED` document lifecycle, a rich-text block editor,
  and image blocks. This matches `studioflow-mom-contract.md` but the owner
  states the result does not match their actual operational need. The existing
  contract was written without confirming the required meeting-notes behavior
  with the owner first.
- **Expected (owner):** MOM should match the legacy behavior the owner used
  day-to-day. What that behavior is must be re-confirmed by the owner before
  any further MOM implementation — including KB-012 (correction draft fix) —
  resumes. Legacy MOM artifacts should be audited as the reference, not the
  current contract.
- **Mitigation:** Avoid issuing or superseding MOM documents in the current
  implementation until the correct shape is confirmed. KB-012 is blocked by
  this.
- **Status:** Closed in R8.72 — the owner re-anchored MOM on legacy (contract
  §10); SF-R2 implements the legacy document/section/note/photo model with
  print.

### KB-023 — General project todos not surfaced on StudioFlow home page

- **Observed (owner audit, 2026-09-10):** `/studioflow` (My Activity) shows
  open rounds and tasks only through the "waiting on me" lens: items filtered
  by assignee or flagged as needing assignment. In the legacy, general
  project-level todos were prominently visible on the home page regardless of
  the waiting-queue framing. The owner confirms todos are absent from where
  they expect them ("halaman muka").
- **Expected:** General to-dos (project-owned tasks, including those surfaced
  via `GeneralTaskBlock` on the project page) should be visible from the main
  StudioFlow page in a form matching legacy behavior. The exact surface — a
  standalone todo list, a combined view, or a project-grouped list — needs
  owner confirmation.
- **Mitigation:** Navigate to the individual project to see its `GeneralTaskBlock`.
- **Status:** Closed in R8.71 — SF-R1 implements the Today view (`/studioflow`) showing general to-dos grouped by project, with filters, quick-add, and saved filter views. Confirmed parity with owner expectation.

### KB-002 — Stored-file retention policy is not finalized

- **Observed (updated R8.74):** SF-R2 implements legacy MOM (editable document/section/note/photo model, no DRAFT→ISSUED lifecycle). MOM section photos are stored via `LocalFilesystemStorage`. There is no approved policy for cleaning up photos removed from a MOM document, or for purging documents from archived projects.
- **Expected:** A per-project retention window is approved and enforced: photos removed from a section are reaped after the window; archived-project files are purged or preserved under a documented policy.
- **Mitigation:** No automatic cleanup runs today; files accumulate. The storage root is bounded by the kantor rebuild root and does not affect legacy data.
- **Status:** Open; deferred by owner decision (2026-09-15). Google Drive activation deferred; local-only storage in use. Retention policy TBD when Google Drive is activated.

### KB-003 — Project Schedule/FFNI remains absent from project detail

- **Observed:** MOM and Product Catalogue are implemented in R7.52/R7.53;
  Project Schedule/FFNI remains unimplemented.
- **Expected:** Project-owned MOM and Schedule surfaces plus a StudioFlow-owned
  Product Catalogue reuse pool shared across StudioFlow projects. MOM remains
  independent from phase/iteration/Task; Product Catalogue never reads Master
  Data SKU, unit, or pricing.
- **Mitigation:** Continue using existing operational surfaces for Schedule/FFNI.
- **Status:** Closed in R8.73 — SF-R3 adds the project Schedule page,
  per-project entries, typed options, final approval, templates, CSV import,
  and reuse from past projects.

### KB-005 — Add Project regresses legacy client/modal behavior

- **Observed:** Client creation is not available in context and some project
  creation interactions navigate away instead of opening a modal.
- **Expected:** Restore useful legacy behavior using UI Engine dialogs and the
  current project/client service boundary.
- **Mitigation:** Create the client first, then create the project.
- **Status:** Closed in R7.44. Project creation now supports selecting an
  existing client or creating a new client in context, atomically with the
  project and its seeded phases, with audit coverage.

### KB-006 — StudioFlow UI language remains mixed

- **Closed:** R7.46 completes the R7.44 correction. User-facing StudioFlow
  route, validation, service-error, nested iteration, client, file, and state
  copy is English. Remaining Indonesian matches are technical comments,
  sample proper names, or internal anchor ids.

### KB-007 — Settings structure does not match useful legacy behavior

- **Observed:** Rebuild Settings remains narrower than legacy.
- **Expected:** Reproduce useful legacy structure with current permissions and
  rebuilt UI Engine components.
- **Mitigation:** Use current General Settings.
- **Status:** Closed in R7.44. Studio Settings now links the existing functional
  Clients and Account/Profile surfaces alongside phase and naming settings.
  Database Settings remains intentionally deferred because its backend contract
  does not exist.

### KB-031 — Users and Roles & Access are split out of the General Settings canvas

- **Observed (owner UI review, 2026-09-16):** The account dropdown exposes
  **General Settings**, **Users**, and **Roles & Access** as separate destinations.
  The StudioFlow settings page also labels the active area as **Studio
  Settings**, which makes the foundation/general settings boundary feel split
  instead of centralized.
- **Expected:** Users and Roles & Access are part of Foundation/General
  Settings. The default settings experience should keep one central settings
  canvas with one shared sidebar, where Users and Roles & Access are sections
  within the general settings structure rather than sibling account-menu
  entries.
- **Required correction:** Rework the settings information architecture so the
  account menu points to the centralized General/Foundation Settings surface.
  Move Users and Roles & Access into that settings shell/sidebar, preserve the
  existing access checks, and keep StudioFlow-specific settings scoped inside
  the same coherent settings experience instead of presenting a competing
  standalone settings label.
- **Priority:** P2 — settings IA and ownership clarity.
- **Status:** Open; needs a focused Foundation Settings plan before execution.

### KB-032 — Product Schedule settings form does not show its dictionaries as tables

- **Observed (owner UI review, 2026-09-16):** On `/studioflow/settings`, the
  Product Schedule area renders prefix dictionary, default categories, and
  template items as stacked form sections. The visual grouping makes the
  difference between schedule section, default category, and default row/item
  unclear.
- **Expected:** Product Schedule settings should read like configuration data,
  not a long free-form editor. Prefixes, default categories, and template items
  should each use a table/grid presentation with explicit columns, visible
  existing rows, inline row actions, and compact add-row controls.
- **Required correction:** Redesign the Product Schedule settings surface into
  clear tables:
  **Prefix dictionary** (`Section`, `Category`, `Prefix`, actions),
  **Default categories** (`Section`, `Category`, `Create empty entry`, order,
  actions), and **Template items** (`Section`, `Category`, `Brand`, `Product`,
  `SKU`, `Qty`, `Unit`, `Location`, active/order, actions). Preserve existing
  permissions and behavior; the change is mainly information architecture and
  table ergonomics.
- **Priority:** P2 — settings usability and configuration clarity.
- **Status:** Corrected in R8.81 — the three dictionaries are tables with
  inline add rows and row actions; template items gained an edit dialog and
  the schedule page links to the settings. Awaiting browser acceptance
  (`review.md`); close after it passes. The centralized settings canvas
  remains KB-031.

### KB-033 — Product Schedule add-option flow hides photo upload

- **Observed (browser comment, 2026-09-16):** On a reserved Schedule row,
  opening `Add option` shows product fields only. There is no photo control in
  the dialog, and the option-level overflow menu that contains `Add photo`
  does not exist until after the option has already been created.
- **Legacy evidence:** `D:\Projects\studioflow` commit `102ff85`,
  `src/extensions/sketchup/components/CatalogBoard.tsx` exposed photo editing
  as a visible card action (`+ Add photo` / `Change photo`) with a 4:5 cropper.
- **Expected:** Adding or editing a schedule option should allow adding the
  catalog photo in the same flow, and existing options should expose the photo
  action visibly instead of requiring hidden overflow discovery.
- **Priority:** P1 — owner-observed workflow regression.
- **Status:** Corrected in R8.86 — `Add option` / `Edit option` include the
  4:5 image workspace and existing option cards show visible photo actions.
  Awaiting browser acceptance of the upload/crop/save path.

## Closed

### KB-030 — Valid local private storage keys fail signed-read verification on Windows

- **Closed in R8.45:** `resolveSafePath` now derives canonical paths from the
  deepest existing realpath ancestor for both the configured root and target.
  This compares Windows short/long path representations consistently while
  retaining lexical traversal rejection and canonical symlink/junction escape
  rejection. The focused kantor test and the full disposable-database suite
  pass.

### KB-029 — F-B app registry duplicate cross-app permission

- **Closed in R8.40:** BQ no longer registers Master Data's
  `masterdata.promotion.approve`; BQ's retained authorization checks consume
  the public Master Data permission export. The full registration set is now
  exercised by a regression test and the development server boots successfully.

### KB-019 — `listWaitingOnMe` reads every open round and task in the database

- **Closed in R8.05.** `listWaitingOnMe` now bounds the database reads by assignee
  at the query level and retains null or unavailable assignees in the
  `NEEDS_ASSIGNMENT` bucket.

### R7.55 audit corrections closed in the same change set

These were found by the R7.55 audit and fixed immediately; they never needed an
open ledger entry, and are listed so the fixes are traceable from here.

- **Standard filenames were dated in the server's timezone.** `{date}` was read
  off the `Date` parts, so on the UTC production runtime an evening drop in
  Asia/Jakarta filed under the previous day. It now formats in the platform's
  configured timezone, as project contract §8.5 always required.
- **The round label existed in three formats.** The service produced `D 1`, the
  project page produced `D1` falling back to the phase *key*, and the phase
  section produced a third copy. One exported helper now owns the rule and §5.2
  was amended to the separator-free form its own §8.5 example already used.
- **A sent or answered round could still have its checklist edited.** Ticking
  and withdrawing points were allowed in `SENT`, rewriting the snapshot a
  delivered round was sent with (§6.3). Both are now `DRAFT`-only.
- **`approveIteration` closed a round without a response row.** A second
  approval path set `APPROVED` with no `SfResponse`, so a phase could be
  finished on an approval with no readable answer behind it (§6.1/§6.2). It now
  delegates to `recordResponse`, leaving one write path.
- **The project page queried Prisma directly** for user display names, the
  pattern project contract §11 marks PURGE. It reads through a service command.
- **MOM meeting dates were formatted with the viewer's own locale**, ignoring
  the platform display settings and mismatching between server and client
  render. The label is now formatted on the server (CORE §10).

### KB-001 — Deliverable intake did not drive iteration lifecycle

- **Closed:** R7.40. Intake opens/reuses the draft, replaces the prior unsent
  current file, and attaches it to the iteration when sent.

### KB-008 — BQ overridden prices had no Revert action

- **Closed:** R7.40. The permission-checked action restores the immutable source
  price snapshot.

### KB-009 — BQ Updated date was missing or inconsistently placed

- **Closed:** R7.40. BQ directories display persisted update values.

### KB-010 — Library redirected instead of exposing resource links

- **Closed:** R7.40. A read-only UI Engine dialog exposes Master Data resources.

### KB-011 — StudioFlow implements drag/drop outside the UI Engine

- **Closed:** R7.43. UI Engine now exports the canonical metadata-only
  `FileDropZone`; StudioFlow consumes it and no longer owns drag/drop handlers.
  Focused UI Engine behavior/accessibility tests and the app boundary guard pass.
- **Limitation:** Full integration tests and live browser verification remain
  unavailable until the disposable office test database and browser workflow
  are available.

## Audit protocol

1. Record route, action, expected/actual behavior, boundary, and reproduction.
2. Fix immediately only when safe, scoped, and verified.
3. Otherwise add/update the relevant app section with mitigation and status.
4. On fix, move the item to Closed and update `CHANGELOG.md` and the roadmap.
