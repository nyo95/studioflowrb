# 09 — Execution Plan

Status: ACTIVE
Updated: 2026-08-23
Owner: PM / Technical Lead

## Gate 0 — Reproducible baseline — TECHNICAL CHECKS COMPLETE

Execute and review WO-001 plus its PM hardening follow-up WO-001A. No implementation lane starts until install, typecheck, Prisma validation/generation, security baseline, and baseline checks are reproducible.

WO-001/001A/001B passed PM review. WO-001C establishes the first reviewed Git checkpoint so subsequent executor work can run in isolated worktrees and produce reviewable diffs.

## Gate 1 — Core contract lock (manager-owned) — COMPLETE

Locked in `CORE.md` for:

- Prisma/DB access and transaction boundary;
- auth/session identity boundary;
- app-entry RBAC and permission evaluation;
- audit envelope versus app-owned action vocabulary;
- shared errors and validation convention;
- decimal, money, unit, and date conventions.

This gate decides contracts only. Deterministic implementation is issued as explicit executor work orders.

## Parallel implementation window

After Gate 1 is locked and WO-001 passes, run independent executor lanes in parallel:

### Lane A — Core

Implement approved Core contracts through narrow work orders. Executors may not change roles, permissions, audit meaning, transaction policy, or numeric semantics.

### Lane B — UI Engine

Execute WO-004 against locked `DESIGN.md` and `UI_ENGINE.md`. AppShell is a domain-neutral frame; auth, permission decisions, navigation content, and app routes remain outside UI Engine.

### Lane C — Safe extraction/enforcement

- WO-002: pure Category slug/path/input rules only.
- WO-003: dependency and legacy-runtime enforcement.

These lanes may run concurrently because they have separate target files. If an executor discovers overlap or a contract discrepancy, it must stop and report rather than adapt silently.

## Convergence gate (manager review)

Before Master Data implementation begins, PM/TL reviews:

- every executor diff against its work order;
- Core/UI dependency direction;
- UI Engine public exports and absence of domain vocabulary;
- single-source tokens and absence of feature-specific globals;
- test, typecheck, boundary, Prisma, and production-build results.

After the reviewed UI foundation is stable, create/update the executor-facing UI skill so it references `DESIGN.md`, `UI_ENGINE.md`, and manager work orders rather than duplicating their rules.

## Product implementation sequence

1. Master Data domain contracts and full schema.
2. Master Data deterministic schema/application/UI work orders.
3. Master Data public contract.
4. BQ readiness, provenance, snapshot, refresh, duplicate, library, and calculation contract lock.
5. BQ schema/domain/application/UI work orders.
6. Cross-app boundary, migration, and smoke verification.

StudioFlow remains out of active implementation scope except for shared-boundary verification.
