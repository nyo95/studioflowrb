# Active Plan

Plan ID: WO-MD-HARDEN-01 (correction pass 1)
Scope: Master Data hardening — one consolidated correction of revision R8.266 (`f907b84`). No new scope.
Target revision: R8.268
Status: READY
Priority: P1
Owner: owner (Product Owner). Lead review of R8.266 on 2026-10-01: **CORRECTION REQUIRED**.
Last updated: 2026-10-01

## Review result

Independently re-run by the Lead: `npm test` 718/718 pass, `npm run check` pass. Code read against the plan: MD-AUD-001 (a malformed contacts payload now errors and an absent field leaves contacts alone; the edit and create forms always send the field), 003 (Category deactivation guard covers SKU, Brand, Supplier and work prices; merge still works), 004 (Vendor Type archive guard), 005 (archived roots reject updates), 006 (sample-request quote relation check), 010/009/014 (constraints, indexes, duplicate-index drops with pre-checks), 011 and 013 are accepted. Four things must still be corrected.

## Corrections (all required)

**C1 — migration order is wrong (blocking).** `prisma/migrations/20261001090000_masterdata_harden_constraints` has the same timestamp prefix as `20261001090000_merge_supplier_categories_into_categories`, so it sorts and runs *before* the merge migration on any database that has neither (for example the home computer). The harden migration's pre-checks and CHECK constraints reject `supplier_category` rows in `DeletionRequest` and `ArchiveCause`, which the merge migration is the one to close or delete. A database holding such a row would stop at the harden migration. Rename the harden migration to a later unique timestamp (after the merge one and before `…091000_masterdata_drop_duplicate_indexes`, which must also stay last, or renumber both), update the matching `_prisma_migrations.migration_name` rows in the office development and disposable test databases so `prisma migrate status` stays clean, and prove the order on an empty database: reset the **disposable test database only** and apply every migration from scratch. Also prove the case that was at risk: seed one `supplier_category` pending `DeletionRequest` and one matching `ArchiveCause` row before the merge migration on a scratch run (test database), and show the final state applies cleanly.

**C2 — build artifact committed.** `next-env.d.ts` changed from `.next/dev/types/…` to `.next/types/…` because `npm run build` rewrote it. Restore the committed version (`git checkout f907b84~1 -- next-env.d.ts`) and keep it out of the commit. After any future `npm run build`, restore this file before staging.

**C3 — Locked Decision 3 is only half delivered.** Existing-entity updates now keep their per-entity audit events, but a SKU created with initial prices (the normal SKU form and every workbook-created SKU) still writes prices with a bulk insert and only the single `sku.created` event, so no `price-material.created` event exists for those prices. Write one `price-material.created` event per initial price (same metadata shape as `createPriceMaterial`) inside the same transaction, without changing the `sku.created` event. Extend the existing workbook audit test to assert a workbook-created SKU plus price shows `sku.created` and `price-material.created` for their own entity ids, and add a direct `createSku` test for the same.

**C4 — registry test is one-directional.** `regression-migrations.integration.test.ts` only proves each registry value appears in the CHECK text, so an extra or stale value in the database constraint would pass. Make it exact: parse the allowed values out of the three constraint definitions and assert they equal the registry sets.

## Verification

`npm test`, `npm run check`, `npm run lint`, `git diff --check`. Report the from-scratch migration run on the test database and the seeded-row run. Do not run `npm run build` in this pass; if you must, restore `next-env.d.ts` before staging. `git diff --cached --stat` must show no `next-env.d.ts`.

## Reviewer Acceptance

The Lead re-checks C1–C4, then runs the browser bad-input pass queued in `docs/agent/BROWSER-ACCEPTANCE-BACKLOG.md` (contacts, Category and Vendor Type guards) and records PASS. The next plan after PASS is WO-MD-CHAIN-01 (the brand → supplier → price rule).

## Executor Prompt

You are the BACKEND EXECUTOR for this checkout (D:\Misc\ProjectsHUB\studioflowrb, office computer, `STUDIOFLOW_LOCATION=kantor`). Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, and the root `PLAN.md` (WO-MD-HARDEN-01 correction pass 1). Implement corrections C1–C4 only, verify as listed (including the from-scratch migration run on the disposable test database and the seeded `supplier_category` run), add the changelog entry, and make one local commit `R8.268 | fix(masterdata): correct the hardening migration order, audit events, and registry test`. Use only the rebuild databases (verify the target first); never the legacy database. Stop with a `BLOCKED / CONFLICT` report if a correction cannot be met. Finish with a Planner/Reviewer prompt (outcome, commit, checks, limitations, dirty files).
