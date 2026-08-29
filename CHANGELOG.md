# Changelog

This file is the authoritative revision ledger. Revision/commit rules are in `AGENTS.md`.

## Revision state

- Published baseline: **R1** — `c8e473702801510aa314bbed45242a71b600f733` on `origin/main`
- Current local revision after this entry is committed: **R1.01**
- Next local revision: **R1.02**
- Remote publication: **not authorized**

## R1.01 — 2026-08-29 — Foundation contract and executor governance

Status: **local contract handoff**

### Changed

- Consolidated the documentation surface to the shared Core, Design, UI Engine contracts and the deferred Master Data intake; removed obsolete, duplicate, and conflicting PRDs/audits/handoffs/work orders.
- Locked Foundation F0 as the reusable shell/platform phase: real login, hash-only revocable database sessions, persisted multi-Role RBAC with live grants, Platform General Settings, shared Core/Utilities, and UI-F0.
- Locked identity mechanics and exact versions for Argon2id password hashing and an atomic PostgreSQL login limiter; UI-F1 and all speculative capabilities remain deferred.
- Preserved the owner rule that future generic mechanisms belong centrally in Core, Utilities, or UI Engine when their domain-neutral need is proven; apps may not create private substitutes.
- Kept Master Data as the first deferred consumer, including the approved one-SKU/many-vendor-price direction, while withholding app implementation authority until its code-derived contract is complete.
- Added deterministic navigator/OpenCode executor boundaries, changelog requirements, local revision naming, local-commit workflow, and an explicit prohibition on remote publication without owner authority.
- Added the locked one-run Foundation work order and a copy-ready OpenCode prompt targeting `R1.02`.
- Updated source comments that referred to deleted documents; these edits do not change runtime behavior or persisted schema.

### Removed

- Deleted legacy duplicate Markdown and superseded work orders from active repository documentation. Their history remains recoverable through Git.

### Dependencies and migrations

- No dependency or persisted-schema change in this revision.
- The Foundation work order authorizes only `@node-rs/argon2@2.1.0` and `rate-limiter-flexible@11.2.0` for the next revision.

### Verification

- Markdown active-link scan: passed for all 11 retained Markdown files.
- `git diff --check`: passed (line-ending conversion warnings only).
- `npm run check`: passed (`typecheck`, architecture boundaries, and no legacy runtime dependency).
- `npm run build`: passed with Next.js 16.3.2 production compilation.
- `npm run lint`: baseline failure because the repository has ESLint 9 but no flat `eslint.config.*`; Foundation F0 explicitly owns the repair.
- `npm test`: 191 tests passed with zero assertion failures; 52 database tests were cancelled because the required matching disposable `DATABASE_URL` and `MASTERDATA_TEST_DATABASE_URL` were not configured. This is not recorded as a passing suite and remains mandatory for Foundation execution.

### Reserved state

- Existing money/decimal formatting and two Master Data pricing-page changes are intentionally excluded from this revision and remain owner working-tree state.

## R1 — published baseline

- Commit: `c8e473702801510aa314bbed45242a71b600f733`
- This is the initial published baseline for the new revision protocol; earlier history retains its original commit subjects.
