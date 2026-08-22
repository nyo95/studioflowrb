# 09 — Execution Plan

Status: ACTIVE
Updated: 2026-08-23
Owner: PM / Technical Lead

## Gate 0 — Reproducible baseline — COMPLETE

WO-001, WO-001A, WO-001B, WO-001C, and WO-001D passed PM/TL review.

Approved implementation baseline:

`eb58f5ef7995aad22c4170d234ca84bc830eef08`

All external executors start from the clean approved `main` implementation state plus current manager documentation/work orders. The quarantine branch `codex/quarantine-unapproved-20260823` is comparison evidence only and is never an implementation base.

## Gate 1 — Contract lock — COMPLETE

Manager-owned contracts are locked in:

- `CORE.md`;
- `DESIGN.md`;
- `UI_ENGINE.md`;
- the Software SSOT, Data Ownership contract, and app PRDs.

Deterministic implementation may follow these contracts but may not change them.

## External executor policy

- Codex acts only as PM/TL.
- Deterministic work is executed by owner-operated external OpenCode agents.
- Codex does not create executor tasks, agents, or worktrees.
- Every executor reads its complete work order and stops on ambiguity or repository/contract mismatch.
- Work remains unapproved until PM/TL reviews its diff/commit and acceptance evidence.
- Do not create one executor per tiny task; retain context within the two approved lanes.

## Current two-lane execution

### Lane A — Infrastructure / Core

Execute sequentially:

1. WO-003 — Dependency and Legacy-Runtime Enforcement.
2. PM/TL review of WO-003.
3. WO-005 — Core DB / Prisma Runtime.
4. PM/TL review of WO-005.
5. WO-006 — Shared Errors and Validation.
6. PM/TL review of WO-006.

### Lane B — Domain / UI Foundation

Execute sequentially:

1. WO-002 — Category Pure Rules.
2. PM/TL review of WO-002.
3. WO-004 — UI Engine Foundation.
4. PM/TL review of WO-004.

Lane A and Lane B may run concurrently in separate owner-managed external executor checkouts. Work inside each lane remains sequential.

## Convergence gate — REQUIRED STOP

After both lanes complete, do not begin further deterministic implementation. PM/TL reviews:

- every diff against its work order;
- forbidden-file and scope compliance;
- Core/UI dependency direction;
- absence of runtime coupling to `../studioflow`;
- UI Engine public exports and absence of domain vocabulary;
- single-source design tokens and absence of feature-specific globals;
- Category pure-rule compliance and absence of retired PRODUCT hierarchy inference;
- tests, typecheck, boundary checks, Prisma checks, and production build.

Only this review may unlock the next work.

## Dependency-locked work

- WO-007 — after WO-006 approval.
- WO-008 — after WO-006 approval.
- WO-009 — after WO-005 and WO-006 approval.

WO-007 and WO-008 may run in parallel after being unlocked. WO-009 may run when both of its dependencies are approved. A further PM/TL review is required before full Master Data implementation.

## Product implementation sequence after Core convergence

1. Complete Master Data domain contracts and full schema decisions.
2. Issue deterministic Master Data schema/application/UI work orders.
3. Lock and implement the Master Data public contract.
4. Lock BQ readiness, provenance, snapshot, refresh, duplicate, library, and calculation contracts.
5. Issue BQ schema/domain/application/UI work orders.
6. Run cross-app boundary, migration, and smoke verification.

StudioFlow remains outside active implementation scope except for shared-boundary verification.
