# 11 — Platform Core Contract Audit

Status: COMPLETE
Decision date: 2026-08-23
Owner: PM / Technical Lead

## Decision

`CORE.md` is locked as the minimum cross-app Platform Core contract. The contract deliberately defines stable boundaries without importing legacy StudioFlow product policy.

## Evidence reviewed

- rebuild Software SSOT, Core PRD, Data Ownership contract, Engineering Conventions, package/toolchain, schema, and current Platform scaffold;
- legacy Prisma client/pool and schema-preflight implementation;
- legacy Auth.js credentials/JWT/session helpers;
- legacy app-access matrix, permission constants, role matrix, guards, and project-PIC policies;
- legacy global audit types/read models/undo executor and Master Data transactional audit service;
- legacy action wrapper, error/result mapping, validation collection, date utilities, and shared types;
- legacy BQ decimal conversion and calculation evidence already audited in the prior pass.

## Retained patterns

- one shared Prisma client and adapter;
- development hot-reload singleton and bounded PostgreSQL pool;
- fail-closed auth and defense-in-depth server authorization;
- pure base permission checks;
- mutation and audit in the same transaction;
- no-op updates produce no audit event;
- Decimal-to-string and Date-to-ISO audit serialization;
- centralized mapping of known Prisma failures;
- Zod boundary validation;
- explicit omitted-versus-null semantics.

## Rejected legacy coupling

- schema delegate signatures and hardcoded database preflight table lists;
- fallback role for missing/malformed session claims;
- permissions stored in JWT/client session;
- implicit admin bypass and StudioFlow PIC/phase logic inside the Core evaluator;
- app route/landing policy inside Core RBAC;
- StudioFlow audit action vocabulary, project/phase read models, and undo executor in Core;
- one global validation file importing app enums;
- raw unexpected error messages returned to clients;
- fixed 2026 holiday data in shared date utilities;
- JavaScript-number decimal conversion as a new shared convention.

## Deferred intentionally

- authentication provider and user persistence schema;
- canonical rebuild roles and role grants;
- audit persistence model and read/query policy;
- BQ calculation/numeric migration;
- Master Data unit dictionary contents.

These are not missing Core abstractions. They require identity, product, schema, or domain decisions outside the minimum cross-app contract.
