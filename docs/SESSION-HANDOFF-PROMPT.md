# Codex + Claude Session Handoff Prompt

Copy the prompt below into a new Codex or Claude/OpenCode session. The agent
must verify the repository state rather than assuming the reference commit is
still current.

---

## Prompt

You are continuing the `studioflowrb` rebuild with the owner. Work in the
existing checkout; do not create a second project or copy legacy code.

### First response and environment

1. Ask exactly one short question before repository or database work:
   **“Ini kerja di mana: rumah atau kantor?”**
2. Use `.env.rumah` or `.env.kantor` accordingly and set
   `STUDIOFLOW_LOCATION` for repository tooling.
3. Never access any database until its target is proven to be the isolated
   rebuild-only PostgreSQL environment.
4. The reference at handoff creation is branch `studioflow/contracts`, commit
   `07ecbea` (`R7.41`). Treat it only as a reference: immediately inspect HEAD,
   branch, upstream, changelog revision state, and the complete dirty-file list.

### Mandatory reading

Read these files in order before deciding or editing:

1. `AGENTS.md`
2. `docs/README.md`
3. `CHANGELOG.md`
4. `docs/alignment.md`
5. `docs/knownbug.md`
6. `docs/roadmap.md`
7. Relevant shared contract: `CORE.md`, `DESIGN.md`, and/or `UI_ENGINE.md`
8. Relevant app contract under `docs/apps/`
9. `prisma/schema.prisma`
10. Current code, tests, and migrations for the selected slice

Do not rely on this prompt as a replacement for those sources. Current owner
instruction wins over every document.

### Active executor order

Claude/OpenCode must execute only
[`STUDIOFLOW-R7.48-PHASE-DELIVERABLE.md`](../scripts/work-orders/STUDIOFLOW-R7.48-PHASE-DELIVERABLE.md),
then stop and hand its local commit back to Codex for review. Do not start MOM,
Product Catalogue/Schedule, or the combined Task/deliverable redesign in the
same change set.

### Mission

Finish the rebuild per application without regressing Master Data, BQ, or the
shared UI/UX. StudioFlow must reach at least the useful daily-production
coverage of legacy while applying the owner’s simplification:

- project-owned to-dos, optionally scoped to phase/revision;
- My Activity is an aggregate view, not a second task store;
- deliverable intake drives iteration/review workflow;
- one current unsent deliverable record per project-phase/iteration;
- detailed metadata/audit remains, while repeated bookkeeping clicks disappear;
- MOM and Product Catalogue/FFNI remain project extensions;
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

- Add configurable main-route settings only after defining the persisted
  setting, safe fallback, permission-aware redirect order, loop prevention, and
  tests for users with different grants.
- Continue asset storage only from
  `docs/PLATFORM-ASSET-STORAGE-ROADMAP.md`; never use runtime local filesystem.
- Keep identity, RBAC, audit, settings, validation, errors, and DB runtime
  domain-neutral.
- Do not put StudioFlow/BQ/Master Data business roles or policy in Core.

#### 2. UI Engine and Shared Utilities

- Fix KB-011 first: activate one canonical `FileDropZone`, export it publicly,
  migrate StudioFlow to consume it, and add behavior/accessibility/boundary
  tests. Do not leave a local wrapper that duplicates drop semantics.
- Redesign the header/sidebar boundary only from the approved Claude artifact.
  Use its layout direction and retain approved semantic colors; verify Master
  Data, BQ, StudioFlow, desktop, collapsed rail, and narrow viewport.
- Add image workspace, rich-text, date/time, or lookup capabilities only when a
  named approved consumer requires them. One canonical export, no private copy.

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
- Preserve the R7.40 price-override Revert and Updated-date behavior.
- For calculator/waste work, first decide the smallest exact-decimal capability
  placement. Generic arithmetic may live in shared Utilities; BQ formulas and
  rounding remain app-owned.
- Calculator expressions must be parsed from a strict grammar; never use
  `eval`, `Function`, or arbitrary code execution.
- Deferred BQ features remain listed in `docs/roadmap.md`; do not claim them
  complete before end-to-end verification.

#### 5. StudioFlow

Work through these in order unless the owner reprioritizes:

1. KB-011 canonical FileDropZone migration.
2. KB-006 English-only UI sweep, including actions, validation, empty/error,
   permission, archived, and responsive states.
3. KB-005 Add Project parity. Inspect legacy read-only end-to-end first:
   route/navigation, modal state, action/API, service, persistence, permission,
   audit, errors, and tests. Restore in-context client creation using the rebuilt
   UI Engine; do not copy legacy implementation.
4. KB-007 Settings parity using the same legacy evidence workflow.
5. Put current deliverable/intake inside the phase work surface and make
   Start Round/internal approval/send contextual rather than the main path.
6. Integrate project-owned MOM at every phase. MOM has no Task/To-do, phase, or
   iteration linkage; “Write today's MOM” is only an ordinary independent
   To-do. Preserve legacy ordered blocks, points, and images, and reuse
   canonical rich-text and image tools.
7. Integrate the StudioFlow-owned Product Catalogue reuse pool shared across
   StudioFlow projects, then project FFNI/Schedule snapshots. Never read Master
   Data SKU or pricing; StudioFlow's only Master Data read is Brands through
   the public boundary.
8. SketchUp integration is last and must be authenticated, idempotent,
   observable, retryable, and reconcilable.

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
6. Update `docs/knownbug.md`, `docs/roadmap.md`, `docs/alignment.md`, and
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

## Current handoff snapshot (R7.44)

The rebuild checkout is on branch `studioflow/contracts` at commit
`2348d0f14a13e4fe85ffe4938b9beef7025b1a30`. R7.43 closed UI Engine KB-011;
R7.44 closed StudioFlow KB-005 (in-context client creation), KB-006 (English
user-facing copy), and KB-007 (Settings navigation to functional Clients and
Account/Profile surfaces). Database Settings is intentionally not a placeholder:
it remains deferred until a backend contract exists.

The next StudioFlow gaps are the project work surface (current deliverable and
intake inside each phase), coherent tasks plus deliverables, and contextualizing
Start Round/internal approval/send. MOM and Product Catalogue/FFNI/Schedule are
still unactivated project extensions. The next agent must inspect current code,
roadmap, known bugs, and contracts before editing; do not assume R7.44 proves
browser or database integration.

## Recommended first slice

Start with **StudioFlow phase work surface**: put current deliverable summary
and intake directly inside each phase, then reconcile project-owned tasks with
deliverables without adding a second task entity. This is the next application
slice after R7.44. MOM and Product Catalogue/FFNI/Schedule must remain deferred
until their documented decisions are locked.
