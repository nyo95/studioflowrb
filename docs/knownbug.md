# Known Bugs by Application

Status: active defect ledger, reconciled through R8.13 on 2026-09-12.

Planned features belong in [`roadmap.md`](roadmap.md). When a bug is fixed, move
it to Closed, name the revision, and record the fix in `CHANGELOG.md`.

## Platform Foundation

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
- **Status:** Corrected in R8.20; awaiting independent review before closure.

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

### KB-004 — Shared image provider is not provisioned in kantor

- **Observed:** R7.52 provides the canonical UI Engine ImageWorkspace, Core
  storage port, fake seam, and server-only Supabase adapter, but `.env.kantor`
  has no Supabase provider credentials and no production bucket has been
  provisioned.
- **Expected:** One public UI Engine capability with consumer-owned policy and
  cross-consumer regression evidence.
- **Mitigation:** MOM image persistence fails safely until the provider is
  configured; tests use the fake adapter and no local filesystem fallback.
- **Status:** Open; implementation complete, environment provisioning remains.

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
- **Status:** Open; deferred cleanup.

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
[`apps/studioflow/studioflow-project-contract.md`](apps/studioflow/studioflow-project-contract.md) and
opened KB-012 … KB-018 below (KB-019 was closed in R8.05; KB-021 … KB-023 were added by the owner audit).
KB-013, KB-014 and KB-015 are one gap seen from
three sides: the client answer is persisted as a single immutable `SfResponse`
with no state, no replacement link and no reason, so the contract's whole §6.5
/ §6.6 correction and draft behaviour has nowhere to live. They are listed apart
because each has its own observable symptom, but they must be fixed by one
migration and one slice.

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
- **Status:** Open; carried by the active R7.56 work order.

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
- **Status:** Open; carried by the active R7.56 work order.

### KB-014 — A client answer cannot be collected as a draft

- **Observed:** `recordResponse` commits every consequence immediately. Contract
  §6.6 and decision D32 require an answer that can be assembled over several
  days while the round stays `SENT` and its age keeps counting.
- **Expected:** At most one `DRAFT` answer per round; it changes no state,
  satisfies no phase closure, and fires §6.2's consequences only on commit.
  Stopping the round discards it silently and unaudited.
- **Mitigation:** Record the answer once, when the client has finished
  answering; earlier remarks are kept outside the application until then.
- **Status:** Open; carried by the active R7.56 work order.

### KB-015 — Withdraw send has no command behind it

- **Observed:** Contract §6.2 and §12 define **Withdraw send** (`SENT → DRAFT`,
  no successor, reason required, send history retained). No service command
  exists. Until R7.55 the round menu rendered a permanently disabled "Withdraw
  send" row, which the UX spec §3.6 forbids; R7.55 removed the dead row rather
  than leaving a control nobody can use.
- **Expected:** The command exists, is audited, and the menu entry returns with it.
- **Mitigation:** Stop the round and start a new one, accepting a consumed
  round number.
- **Status:** Open; carried by the active R7.56 work order.

### KB-016 — A project cannot be archived or restored

- **Observed:** `SfProject.deleted_at` exists and every read filters on it, but
  no service command sets or clears it. Contract §12 lists "Archive Project
  (`deleted_at`) | `project.manage` | Reversible" and makes restoration explicit.
  `archiveClient` refuses while live projects remain, so a finished client can
  never be archived either — the two rules are locked together.
- **Expected:** Audited archive and restore for a project, archived projects
  read-only until restored, and a client that becomes archivable once its
  projects are.
- **Status:** Open; carried by the active R7.56 work order.

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
- **Status:** Open; carried by the active R7.56 work order.

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
- **Status:** Open; deletion only. Not fixed in R7.55 because that session could
  not delete files on the owner's machine. Codex should confirm nothing imports
  these modules and remove the two route folders' non-`page.tsx` files.


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
- **Status:** Open; owner-directed. Requires a migration, a schema change
  (`project_id` FK on `SfProductCatalogue`), a contract correction, and route
  restructuring to `/studioflow/[id]/catalogue`. Block all further catalogue
  and Schedule development until resolved.

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
- **Status:** Open; awaiting owner re-specification of MOM. Do not extend the
  current implementation or fix KB-012 until the requirements are re-anchored.

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
- **Status:** Open; requires owner clarification of which page is "halaman
  muka" (application home `/studioflow` vs. project home `/studioflow/[id]`)
  and what the legacy presentation looked like before implementing.

### KB-002 — Storage-byte retention policy is not finalized

- **Observed:** MOM removes unreferenced draft image objects best-effort, while
  long-term retention and reconciliation for superseded records is not approved.
- **Expected:** Retain metadata/audit and release bytes under approved retention.
- **Mitigation:** Keep immutable MOM metadata and audit rows; do not claim byte
  cleanup is complete until provider provisioning and retention policy exist.
- **Status:** Open; blocked by retention policy/provider provisioning.

### KB-003 — Project Schedule/FFNI remains absent from project detail

- **Observed:** MOM and Product Catalogue are implemented in R7.52/R7.53;
  Project Schedule/FFNI remains unimplemented.
- **Expected:** Project-owned MOM and Schedule surfaces plus a StudioFlow-owned
  Product Catalogue reuse pool shared across StudioFlow projects. MOM remains
  independent from phase/iteration/Task; Product Catalogue never reads Master
  Data SKU, unit, or pricing.
- **Mitigation:** Continue using existing operational surfaces for Schedule/FFNI.
- **Status:** Open; intentionally deferred to its own executable work order.

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

## Closed

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
