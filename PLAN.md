# Active Plan

Plan ID: D-SF-LEGACY-RECOVERY-DISCOVERY
Scope: Read-only StudioFlow legacy extraction and recovery contract
Status: BLOCKED
Priority: P1
Owner: Repository owner
Last updated: 2026-09-14

## Outcome

Produce the D-SF recovery discovery package: end-to-end evidence and a
ratified contract for the legacy StudioFlow workflow, including the canonical
project hierarchy, routes, permissions, persistence ownership, settings,
cross-app reads, and shared UI/utility pressure. Every meaningful legacy
behavior must be classified as KEEP, MERGE, ALREADY_REPLACED, REDESIGN, PURGE,
or DECISION_REQUIRED. This is read-only discovery; it creates no app code,
schema, route, dependency, or legacy change.

## Context and Evidence

- R8.45 closed KB-030; the full kantor suite is now 347/347 passing.
- `docs/roadmap.md` sequences D-SF before F-C/F-D because the shared layers
  need mature StudioFlow recovery evidence.
- The roadmap pins the legacy evidence commit to
  `c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27`.

## Blocker

The owner has not supplied the exact path of the legacy checkout on this kantor
computer. The repository must not scan drives, assume a path, or access any
legacy database. Once the path is supplied, record its path, pinned commit,
branch, and dirty state through read-only Git commands before inspection.

## Locked Decisions

- Legacy source is evidence only and remains completely read-only.
- StudioFlow legacy PostgreSQL and every associated server, schema, role,
  connection, volume, backup, and service are forbidden.
- Inspect route/navigation, UI state, server boundary, domain rules,
  persistence/transactions, permissions/audit, downstream reads, and tests.
- Do not begin StudioFlow implementation before F-E Foundation acceptance.

## Owner Decision Prompt

Provide the exact absolute path of the legacy StudioFlow checkout on this
kantor computer. I will inspect only its pinned committed source at
`c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27`, record its branch and dirty state
read-only, and will not access any legacy database or alter the checkout.
