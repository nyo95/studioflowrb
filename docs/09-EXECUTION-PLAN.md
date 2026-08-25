# 09 — Execution Plan

Status: FOUNDATION + UI ENGINE + MD-00 COMPLETE — MASTER DATA EXECUTION NEXT
Updated: 2026-08-25
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
- Codex may use internal subagents for bounded manager-owned, read-only audit/evidence/risk analysis; their findings are advisory and the PM/TL remains the decision owner.
- Deterministic work is executed by owner-operated external OpenCode agents.
- Codex does not create executor tasks, agents, or worktrees.
- Every external executor reads `scripts/work-orders/00-EXTERNAL-EXECUTOR-CONTEXT.md` before its assigned WO.
- Every executor reads its complete work order and stops on ambiguity or repository/contract mismatch.
- Work remains unapproved until PM/TL reviews its diff/commit and acceptance evidence.
- Do not create one executor per tiny task; retain context within each approved product slice.

UI-01 was completed directly by Codex under an explicit one-time owner takeover instruction. This does not authorize Codex to replace external OpenCode executors for later deterministic Master Data work.

## Foundation execution — COMPLETE

### Lane A — Infrastructure / Core

Execute sequentially:

1. WO-003 + WO-003A — COMPLETE; commits `d55c62d` and `3ad33e6` passed PM/TL review.
2. WO-003 enforcement is the accepted dependency/legacy-runtime baseline.
3. WO-005 — Core DB / Prisma Runtime — COMPLETE; commit `4cbdf43` passed PM/TL review.
4. PM/TL review of WO-005 — COMPLETE.
5. WO-006 through WO-009 — COMPLETE and PM/TL-approved.
6. Convergence correction `10d3881` — COMPLETE.

### Lane B — Domain / UI Foundation

Execute sequentially:

1. WO-002 — COMPLETE; commit `d72b72a`.
2. PM/TL review of WO-002 — COMPLETE.
3. WO-004 — COMPLETE; commit `4ff3353`.
4. PM/TL review of WO-004 — COMPLETE.

## Convergence gate — COMPLETE

After both lanes complete, do not begin further deterministic implementation. PM/TL reviews:

- every diff against its work order;
- forbidden-file and scope compliance;
- Core/UI dependency direction;
- absence of runtime coupling to `../studioflow`;
- UI Engine public exports and absence of domain vocabulary;
- single-source design tokens and absence of feature-specific globals;
- Category pure-rule compliance and absence of retired PRODUCT hierarchy inference;
- tests, typecheck, boundary checks, Prisma checks, and production build.

The review passed. Core + UI Engine are locked for product implementation. Do not add Foundation work without a concrete product blocker.

PM/TL revalidated Core on 2026-08-25 against canonical legacy evidence from GitHub commit `548fbd6bd00ef9fd7d53df66a3561a32fbb56944`. The contract and implementation remain locked; the snapshot changes evidence provenance, not Core responsibilities.

## Product implementation sequence after Core convergence

1. UI-01 UI-A through UI-D — COMPLETE; commits `628a77c`, `ad8d564`, `27becfa`, and `4354c4f`.
2. PM/TL diff, test, accessibility, responsive, interaction, and `/ui-engine` review — COMPLETE.
3. Independent Claude design review and owner-directed design pass — COMPLETE; commit `1ab1a82` reviewed through `docs/14-UI-ENGINE-DESIGN-PASS-HANDOVER.md`.
4. PM/TL convergence correction and contract ratification — COMPLETE; commit `8f1ca0b`, 117 tests, full repository acceptance, responsive/keyboard/sort/selection review, and owner visual approval passed.
5. Master Data starting ref `masterdata-full-build-start-ui-approved` issued; `scripts/work-orders/MASTER-DATA-FULL-BUILD.md` is ACTIVE.
6. Execute MD-01 through MD-09 sequentially and review at Gate 1, Gate 2, Gate 3, and Final Gate.
7. Lock and implement the Master Data public contract.
8. Lock BQ readiness, provenance, snapshot, refresh, duplicate, library, and calculation contracts.
9. Issue BQ schema/domain/application/UI work orders.
10. Run cross-app boundary, migration, and smoke verification.

StudioFlow remains outside active implementation scope except for shared-boundary verification.

The MD-01 through MD-09 dependency plan remains canonical in `MASTER_DATA.md`. Its executor package is active only from `masterdata-full-build-start-ui-approved`; all older Master Data start tags are superseded. UI-01 and its convergence pass introduced no Master Data schema, CRUD, or domain implementation.
