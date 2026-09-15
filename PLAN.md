# Active Plan

Plan ID: SF-R3-LEGACY-PRODUCT-SCHEDULE
Scope: Port the legacy Product Schedule onto the StudioFlow legacy rework foundation
Status: READY — implemented locally in R8.73; awaiting wave-1 owner acceptance
Priority: P1
Owner: Repository owner
Last updated: 2026-09-15

## Outcome

Inside each project, the studio can manage the legacy Product Schedule:
Material and Fixture entries receive gapless project-owned codes, carry typed
quantity/location and option snapshots, support A/B/C-style alternatives, and
mark exactly one option final. Settings maintain the prefix dictionary and
default schedule templates. Existing project options can be reused by snapshot,
and legacy CSV rows can be imported without touching the legacy database.

## Context and Evidence

- Authority: `docs/apps/studioflow/STUDIOFLOW-REWORK-CONTRACT.md` §11, plus
  §3 permissions, §4.4 archive read-only, §12 centralization, and §13 UI.
- Legacy evidence (`c4b0c466`, committed files only):
  `src/extensions/schedule/types.ts`,
  `src/extensions/schedule/services/schedule-service.ts`, and
  `src/extensions/schedule/services/schedule-option-writer.ts`.
- Depends on R8.71 (SF-R1) and R8.72 (SF-R2) being committed.

## Locked Decisions

- **Schema:** additive migration `20260915150000_sf_r3_schedule` with
  `sf_schedule_entry`, `sf_schedule_option`, `sf_schedule_prefix`,
  `sf_schedule_template_category`, and `sf_schedule_template_item`.
  Entry code uniqueness is enforced per project/section/prefix/increment.
- **Service:** `src/apps/studioflow/schedule/service.ts` composed as
  `studioFlow.schedule`. Behavior includes gapless renumbering, final-option
  promotion, template application, CSV import, and snapshot reuse.
- **Master Data:** StudioFlow may read Brand names through the public Master
  Data port only. Schedule snapshots remain StudioFlow-owned and do not read
  Master Data SKU, Unit, pricing, or supplier internals.
- **Navigation:** project workspace gets **Schedule** under Records; StudioFlow
  settings gets prefix/default/template maintenance.

## Boundaries and Non-goals

No legacy database access, no global mutable Product Catalogue, no Master Data
write port, no SKU/unit/pricing coupling, no vendor follow-up workflow, no
file deliverables, no push/PR/deploy.

## Acceptance Criteria

- Integration tests prove gapless code creation and renumbering, final option
  rules, template idempotency, Brand snapshot reads through the public port,
  cross-project reuse, CSV import, permission denial, project scoping, and
  archived-project read-only behavior.
- Unit tests cover category/prefix/code/option label/search-key normalization
  and CSV parsing.
- Browser acceptance at SF-RF walks entries/options/finalization, template
  application, CSV import, cross-project reuse, settings maintenance, drafter
  read-only behavior, archived-project read-only behavior, and 375 px layout.

## Verification

Completed locally on the kantor rebuild databases: `npm test` (366 passed,
0 failed), typecheck, lint, production build, boundary fixtures,
legacy-runtime fixtures, `npx prisma migrate deploy` on rebuild test and
kantor DBs, and clean `npx prisma migrate diff` against the rebuild shadow DB.
Owner browser acceptance remains deferred to the SF-RF wave-1 parity gate.
