# 01 — Platform Core PRD

## Purpose
Provide infrastructure and behavior required by multiple apps without owning app-specific business rules.

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

## Rule
A capability moves into Core only when it is domain-independent and genuinely reusable. Core must not become a second dumping ground.

## Success criteria
- no duplicated technical utility across apps
- app internals can be reasoned about without hidden global helpers
- dependency violations fail in CI
