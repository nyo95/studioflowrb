# StudioFlow R7.56 — Workflow Closure

## Status

**PAUSED WORK ORDER.** Owner priority is Platform routing, UI Engine, then BQ.
The filename retains its original planning label for stable links; R7.56 is
consumed by the routing review corrections. Before reactivation, the manager
must rebase the instructions on current contracts and assign the next unused
local revision. Revision/commit examples below are historical, not executable.

Manager: Codex. Executor: Claude/OpenCode.

Required starting point: a `studioflow/contracts` checkout whose changelog state
reads `R7.55`, with the R7.55 audit-correction commit in its history.

## 1. Objective

Close the gaps the R7.55 audit opened against
[`docs/apps/studioflow/studioflow-project-contract.md`](../../docs/apps/studioflow/studioflow-project-contract.md).
All of them are places where the rebuild sits **below** the legacy StudioFlow
floor while not being one of the three approved deviations (phase flow,
deliverables, one to-do collection). In priority order:

1. the client answer — correction chain, draft answers, withdraw send
   (KB-013, KB-014, KB-015);
2. project archive and restore (KB-016);
3. studio phase-template administration and per-project phase add/remove
   (KB-017);
4. MOM correction opens as a draft (KB-012);
5. removal of the unreachable phase/iteration route modules (KB-018).

Project Schedule/FFNI (KB-003) is **not** in this order. `listWaitingOnMe`
query shape (KB-019) is not in this order.

## 2. Slice order — do not merge these into one commit

Each numbered item below is its own review point. Item 1 carries the only
migration that is allowed to change `SfResponse`; do not start item 2 before
item 1 is accepted.

### Slice 1 — the client answer (KB-013, KB-014, KB-015)

Locked persisted shape, from project contract §6.1. Extend `SfResponse`; do not
create a second answer table:

| Field | Rule |
|---|---|
| `state` | `DRAFT` or `EFFECTIVE`. At most one `DRAFT` per iteration |
| `replaces_response_id` | Null for the root answer; otherwise the immediately preceding **effective** answer of the same iteration. Self-referencing, `onDelete: Restrict` |
| `correction_reason` | Required and non-blank for a correction at commit time, null otherwise |

Locked behaviour:

- a `DRAFT` answer changes nothing: the round stays `SENT`, the phase stays
  `WAITING_CLIENT`, its age keeps counting, no round opens, no point is copied,
  and no phase closure is satisfied (§6.6);
- committing a draft fires every §6.2 consequence, unchanged, in one
  transaction;
- discarding a draft is permitted and **unaudited** — it recorded nothing (§9);
- stopping a round discards any draft answer on it silently (§6.6);
- **Correct answer** appends a replacement with a reason and applies §6.5 in
  full: previous responses and every later round are retained; a corrected
  latest round reopens phase closure even when the replacement is approval; a
  historical correction with later non-voided rounds neither creates a round nor
  retargets existing points, and its confirmation must say so;
- points from a replaced response stay on an immediate `DRAFT` successor marked
  **source corrected** and are excluded from open-point warnings (§6.5);
- guard concurrent replacement against the expected effective response id: one
  wins, the other reloads (§6.1);
- **Withdraw send** (`SENT → DRAFT`) requires `iteration.review`, a reason, no
  successor round and no response on the round; it clears `sent_at`, preserves
  the send in audit, and recomputes phase state (§6.2). Restore the round menu
  entry that R7.55 removed — as a real action, never a disabled row.

Surfaces: the response dialog gains **Save as draft** and a draft indicator on
the round row (`menyusun jawaban · N poin` in UX spec §3.8b, in English);
the round menu gains **Correct answer** and **Withdraw send**.

### Slice 2 — project archive and restore (KB-016)

- `archiveProject` and `restoreProject` under `project.manage`, audited, setting
  and clearing `SfProject.deleted_at` (§12).
- An archived project is read-only: every StudioFlow mutation that resolves a
  project must refuse it with the existing `studioflow.project.archived` error.
  Several task commands already do; make the rule uniform.
- Restore requires a live client (§2); it never cascades a client restore.
- With this in place `archiveClient`'s live-project guard becomes reachable in
  practice — cover it.

### Slice 3 — phase administration (KB-017)

- Studio phase template CRUD under `project.manage` (§4.1, §12): `key` is
  immutable once any project snapshot uses it; `name`, `sort_order`,
  `has_rounds`, `round_prefix`, `folder_key` and `requires_internal_approval`
  are editable. Editing the template **never** rewrites a running project.
- Per-project: add a phase, and remove one that holds no rounds (§12). A phase
  holding rounds is closed by exception, never deleted (§4.1).
- Surface it in Studio Settings beside the naming template.

### Slice 4 — MOM correction as a draft (KB-012)

- `supersedeMom` creates the correction as a `DRAFT` carrying a copy of the
  source content, leaving the source `ISSUED`.
- `issueMom` marks the superseded source `SUPERSEDED` in the same transaction
  that assigns the correction its sequence.
- A source that already has a live correction draft refuses a second one.
- Update the existing integration assertion, which currently expects a sequence
  on the correction immediately.

### Slice 5 — remove unreachable route modules (KB-018)

- Confirm nothing imports them, then delete every non-`page.tsx` file under
  `src/app/(platform)/studioflow/[id]/phases/[phaseId]/` and under
  `.../iterations/[iterationId]/`. The two `page.tsx` redirects stay.
- Do not "fix" the dead `PhaseControls`; it is superseded by the phase section.

## 3. Locked rules for the whole order

- `SfTask` remains the only task collection; no second task entity.
- MOM keeps no phase, iteration, task or client-response relation.
- No cross-schema foreign key; StudioFlow reads Master Data only for Brands.
- No Master Data or BQ file is edited. If a slice requires it, stop and report.
- Migrations are additive and touch only the `studioflow` schema.
- One canonical round label: consume `src/apps/studioflow/labels.ts`; do not
  reintroduce a local format.
- Controls a user cannot perform are absent, not disabled (UX spec §3.6).
- Every command audits per §9; toggles, reordering and draft-answer
  save/discard stay unaudited.

## 4. Required tests

Add focused coverage proving, at minimum:

1. a draft answer leaves round, phase and points untouched, and phase closure is
   refused while it exists;
2. committing a draft opens exactly one next draft and carries its points;
3. stopping a round discards a draft answer and writes no audit row for it;
4. correcting an approval to revision reopens the phase and opens one next draft;
5. correcting a revision to approval retains the successor, its files and its
   points, marked source corrected;
6. two simultaneous corrections: exactly one wins;
7. withdraw send is refused with a successor, refused with a response, and
   otherwise returns the round to `DRAFT` with `sent_at` cleared;
8. an archived project refuses every mutation and reads back as archived;
9. editing the phase template does not change any existing project snapshot;
10. a MOM correction starts as a draft and only supersedes its source on issue;
11. Master Data and BQ tests and boundary checks are unchanged.

Do not weaken an existing assertion to make an implementation pass.

## 5. Gates and database safety

Set `STUDIOFLOW_LOCATION` from the owner's answer before any command. Prove the
database target is the isolated rebuild-only instance; never point the test
harness at the development database and never touch legacy.

```text
npx prisma validate
npm run typecheck
npm run lint
npm run check:boundaries
npm run check:legacy-runtime
npm test
npm run build
```

Database-backed suites require an explicitly disposable
`PLATFORM_TEST_DATABASE_URL`. A missing target is **not a pass**; name it as a
limitation and stop. Browser acceptance on a populated project is mandatory
before any roadmap, alignment or known-bug line is closed: desktop, collapsed
rail and narrow viewport, plus empty, loading, error, permission-denied,
archived and DONE states.

## 6. Completion and handback

- Record HEAD, branch and the complete dirty-file list before editing, and
  preserve unrelated owner changes.
- One local commit per slice, using the next unused revision from
  `CHANGELOG.md` and the subject form in `AGENTS.md`. Slice 1's subject is:

```text
R7.56 | feat(studioflow): complete the client answer lifecycle
```

- Update `CHANGELOG.md`, `docs/knownbug.md`, `docs/roadmap.md` and
  `docs/alignment.md` per slice, only after the behaviour is verified.
- Never push, publish, deploy, amend or squash.
