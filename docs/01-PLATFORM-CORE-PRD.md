# 01 — Platform Core PRD

## Purpose
Provide infrastructure and behavior required by multiple apps without owning app-specific business rules.

Core is the stable platform spine. Apps depend on it; Core never depends on an app.

## In scope
- authentication/session abstraction
- RBAC foundation and permission evaluation
- audit logging
- DB transaction conventions
- error mapping
- validation conventions
- file/media abstraction
- event/contracts infrastructure
- shared dictionary/vocabulary
- common identifiers/codes
- money/date/unit/slug/normalization/pagination utilities
- dependency enforcement

## Runtime flow

```text
request -> authenticated principal -> permission evaluation -> validation
        -> app use case -> shared transaction boundary -> persistence
        -> audit event in the same transaction -> safe result/error mapping
```

Core provides the mechanisms in this flow. Each app owns the permission vocabulary, business preconditions, state transition, aggregate mutation, and audit action name.

## Placement test

A capability belongs in Core/Utilities only when it is used by at least two apps, has identical meaning, and contains no app policy. Money parsing may be shared; “BQ line total” is BQ-owned. Transaction plumbing may be shared; “SKU may activate” is Master Data-owned.

Cross-app DTOs are not Core domain models. They live in the owning app's `public` surface. `src/shared` remains quarantine rather than a destination.

## Rule
A capability moves into Core only when it is domain-independent and genuinely reusable. Core must not become a second dumping ground.

## Success criteria
- no duplicated technical utility across apps
- app internals can be reasoned about without hidden global helpers
- dependency violations fail in CI
- audit and business mutation cannot commit independently
- app tests can replace infrastructure through explicit ports
- common failures have stable safe codes without leaking database/runtime errors
