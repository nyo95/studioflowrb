# Codex + Claude Session Handoff Prompt

Copy the prompt below into a new Codex or Claude/OpenCode session. The agent
must verify the repository state rather than assuming the reference commit is
still current.

---

## Prompt

You are continuing the `studioflow-rebuild` project with the owner. Work in the
existing checkout; do not create a second project or copy legacy code.

### First response and environment

1. Ask exactly one short question before repository or database work:
   **“Ini kerja di mana: rumah atau kantor?”**
2. Use `.env.rumah` or `.env.kantor` accordingly and set
   `STUDIOFLOW_LOCATION` for repository tooling.
3. Never access any database until its target is proven to be the isolated
   rebuild-only PostgreSQL environment.
4. The reference at handoff creation is branch `main` at revision `R8.02`
   (published baseline `R8`). Treat it only as a reference: immediately inspect
   HEAD, branch, upstream, changelog revision state, and the complete dirty-file
   list.

### Mandatory reading

Read these files in order before deciding or editing:

1. `AGENTS.md`
2. `docs/README.md`
3. `CHANGELOG.md`
4. `docs/alignment.md`
5. `docs/knownbug.md`
6. `docs/roadmap.md`
7. `docs/review.md`
8. Relevant shared contract: `CORE.md`, `DESIGN.md`, and/or `UI_ENGINE.md`
9. Relevant app contract under `docs/apps/`
10. `prisma/schema.prisma`
11. Current code, tests, and migrations for the selected slice

Do not rely on this prompt as a replacement for those sources. Current owner
instruction wins over every document.

### Active execution priority sequence

Per the owner's active sequence in `docs/README.md`, execution follows this priority:

1. **Platform Foundation — routing first.** Main-route settings delivered in
   R7.56. Provider-backed asset storage (`docs/apps/platform/PLATFORM-ASSET-STORAGE-ROADMAP.md`)
   remains planned.
2. **UI Engine and Shared Utilities.** Consolidate `Intl.DateTimeFormat` call sites
   behind one canonical UI Engine component; redesign header/sidebar boundary
   per approved design artifact.
3. **BQ.** Simplest remaining app. Add strict calculator expression parser
   (`=15000*3`), waste tracking, exact decimal extensions, and Quotation PDF output.
4. **Everything else waits.** StudioFlow workflow closure (`scripts/work-orders/STUDIOFLOW-R7.56-WORKFLOW-CLOSURE.md`)
   is **paused** behind Platform/UI Engine/BQ priorities. Remaining StudioFlow
   gaps (KB-012…KB-019, Project Schedule KB-003) hold until 1–3 land.
5. **AI file organization exploration is parked** (owner instruction).

### Mission

Finish the rebuild per application without regressing Master Data, BQ, or the
shared UI/UX. StudioFlow must reach at least the useful daily-production
coverage of legacy while applying the owner’s simplification:

- project-owned to-dos, optionally scoped to phase/revision;
- My Activity is an aggregate view, not a second task store;
- deliverable intake drives iteration/review workflow (R7.48/R7.50);
- one current unsent deliverable record per project-phase/iteration;
- detailed metadata/audit remains, while repeated bookkeeping clicks disappear;
- project-owned MOM (R7.52) and Product Catalogue (R7.53) remain project extensions;
- the Brands/Library discovery surface remains global and is StudioFlow's only
  Master Data read, through the public port; Product Catalogue is independently
  StudioFlow-owned and reusable across its projects;
- Explorer-style folder viewer is out of scope. Do not revive it.

### Collaboration protocol

Codex and Claude/OpenCode work serially on the same branch, never on overlapping
uncommitted files.

- The active agent first records HEAD and dirty state.
- Select one bounded vertical slice from `docs/knownbug.md` or
  `docs/roadmap.md`.
- One agent implements and commits the slice; the other reviews that commit
  against contracts, code, tests, and real browser behavior.
- A reviewer never silently rewrites an accepted commit. Corrections receive
  the next changelog revision and a new commit.
- Before handoff, commit a coherent verified slice and report exact remaining
  dirty files. If the slice is incoherent or mandatory checks fail, do not make
  a misleading completion commit.
- Do not create duplicate work-order bureaucracy when the owner instruction and
  active contracts already lock the behavior. If a material product/schema/
  permission decision is genuinely absent, stop and ask one precise question.
- Never push, merge, publish, deploy, or open a PR without a separate explicit
  owner instruction.

### Work order by application

Always fix open known bugs before speculative roadmap features, unless the owner
explicitly changes priority.

#### 1. Platform Foundation

- Configurable main-route settings delivered in R7.56 (persistence, permission-aware
  redirects, fallback defaults, read-only controls, desktop & narrow viewports).
- Continue asset storage only from
  `docs/apps/platform/PLATFORM-ASSET-STORAGE-ROADMAP.md`; never use runtime local filesystem.
- Keep identity, RBAC, audit, settings, validation, errors, and DB runtime
  domain-neutral.
- Do not put StudioFlow/BQ/Master Data business roles or policy in Core.

#### 2. UI Engine and Shared Utilities

- `FileDropZone` (KB-011) canonical export delivered in R7.43.
- Image workspace and rich-text editor delivered in R7.52 for MOM.
- Date/time audit complete (`apps/ui-engine/date-time-lookup-audit-2026-09-10.md`);
  next step is consolidating `Intl.DateTimeFormat` call sites behind one canonical
  UI Engine display component upon owner sign-off.
- Redesign the header/sidebar boundary using the approved Claude design artifact.
  Use its layout direction and retain approved semantic colors; verify Master
  Data, BQ, StudioFlow, desktop, collapsed rail, and narrow viewport.

#### 3. Master Data

- Treat current logic/backend/UI as protected behavior.
- StudioFlow Library may read Brand/category/hashtag/resource links only through
  the Master Data public read port; it must not write Master Data.
- Media, Samples, and workbook import/export remain roadmap work requiring
  explicit activation.
- Any shared UI Engine change must be regression-tested against affected Master
  Data consumers.

#### 4. BQ

- Treat current calculation, snapshots, lifecycle, backend, and UI as protected.
- Inline editing at all levels (BQ-F1..F5) and price Revert / Updated-date shipped in R4.56/R7.40.
- For calculator/waste work, add strict grammar expression parser (`=15000*3`).
  Calculator expressions must never use `eval`, `Function`, or arbitrary code execution.
- Decide smallest exact-decimal arithmetic extension while keeping BQ formula and
  rounding policy app-owned.
- Deferred BQ features remain listed in `docs/roadmap.md`; do not claim them
  complete before end-to-end verification.

#### 5. StudioFlow

Completed items (do not re-implement):
- Current deliverable intake in phases (R7.48).
- Unified work surface & contextual actions (R7.50).
- Project-owned MOM (R7.52).
- StudioFlow-owned Product Catalogue (R7.53).
- Removal of speculative project type (R7.54).
- English-only UI sweep (KB-006, R7.44/R7.46).
- Add Project in-context client creation (KB-005, R7.44).
- Settings parity (KB-007, R7.44).

Paused / Deferred items (held behind Platform/UI Engine/BQ priorities):
1. Client answer correction chain (KB-013, KB-014, KB-015).
2. Project archive and restore (KB-016).
3. Studio phase-template administration (KB-017).
4. MOM correction editable draft (KB-012).
5. Unreachable redirected phase/iteration route cleanup (KB-018).
6. Project Schedule/FFNI slice (KB-003).
7. SketchUp integration ( authenticated, idempotent adapter with retry and observability).

Legacy evidence path varies by computer. Before reading legacy in a new
computer/session, ask the owner for the exact path. Record its commit, branch,
and dirty state; use committed evidence read-only. Never run, edit, install,
test, migrate, or connect to legacy PostgreSQL.

### Documentation and defect discipline

- If an audit finds a defect that is not fixed in the same change set, add it
  under the correct app in `docs/knownbug.md`.
- When fixed, move it to Closed with the revision and add the fix to
  `CHANGELOG.md`.
- When a roadmap feature is implemented, strike/remove it from active work only
  after verification; keep its evidence in `CHANGELOG.md`.
- Keep `docs/alignment.md` synchronized when implementation changes an alignment
  status.
- Do not invent historical changelog entries or reuse skipped revision labels;
  read `docs/REVISION-LEDGER-NOTES.md`.

### Completion and regression gates

For each slice:

1. Verify service/domain behavior, permission checks, transaction boundaries,
   persistence, audit, errors, and downstream reads.
2. Run focused tests plus `npm run typecheck`, `npm run lint`,
   `npm run check:boundaries`, and an appropriate production build.
3. Database integration tests require the disposable rebuild-only environment.
   A missing DB environment is not a pass and must be reported.
4. Test the real browser workflow: hierarchy, search/filter/sort/pagination as
   applicable, quick entry, detail/edit flow, confirmation, unsaved input,
   loading/empty/error/disabled/permission states, long content, desktop,
   collapsed rail, and narrow viewport.
5. Shared changes must name every canonical export and test each affected
   consumer for behavior and visual consistency.
6. Update `docs/knownbug.md`, `docs/roadmap.md`, `docs/alignment.md`, `docs/review.md`, and
   `CHANGELOG.md` as applicable.
7. Stage only owned files, inspect `git diff --cached` and
   `git diff --cached --check`, then create exactly one local revision commit.

### Required handoff report

End every implementation or review handoff with:

- selected app/slice and outcome;
- revision and commit hash;
- exact files changed;
- checks passed, failed, skipped, or unavailable;
- browser scenarios verified;
- known bugs closed/opened;
- roadmap/alignment updates;
- remaining unrelated dirty files;
- one precise next recommended slice.

Do not say “complete,” “production-ready,” “zero regression,” or “legacy parity”
unless the required backend, test, and browser evidence actually exists.

---

## Current handoff snapshot (R8.02)

Published baseline is **R8**, latest local commit is **R8.02**.
Main-route settings (R7.56), MOM (R7.52), Product Catalogue (R7.53), project type removal (R7.54), and documentation stub cleanup (R8.02) are complete.

The active execution priority sequence is:
1. Platform Foundation (Asset Storage roadmap)
2. UI Engine (Date/time `Intl.DateTimeFormat` consolidation & Header/Sidebar boundary redesign)
3. BQ (Calculator parser, waste tracking, Quotation PDF)
4. StudioFlow closure (paused behind 1–3 above)

## Recommended first slice

Following the owner's active sequence: proceed with **UI Engine date/time consolidation** (consolidating the 3 `Intl.DateTimeFormat` call sites behind one canonical UI Engine display component per `apps/ui-engine/date-time-lookup-audit-2026-09-10.md` Finding 1), or **BQ strict calculator parser** (`=15000*3`).
