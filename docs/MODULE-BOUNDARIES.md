# Module Boundaries

Status: ACTIVE — describes the enforced architecture. Evidence: `scripts/check-boundaries.mjs`
(fixtures in `scripts/test-boundaries-checker.mjs`), `prisma/schema/*.prisma`, `CORE.md` "Layer access".

## Decision

StudioFlowRB is **intentionally a modular monolith**: one repository, one Next.js deployment, one
PostgreSQL database with one Prisma client. Independent deployment of each app is **not** a
requirement. There are no microservices, no per-app repositories or databases, no internal REST
APIs, and no message broker. Modules are separated by *import rules and data ownership*, and those
rules are checked mechanically.

The rule that matters: **an app may know another app's capability, never its implementation.**

## Ownership

| Module | Owns | Code | Postgres schema |
|---|---|---|---|
| Platform | identity, RBAC, audit, settings, storage, runtime, UI Engine, utilities | `src/platform/**` | `platform` |
| MasterData | brands, vendors, SKUs, units, categories, pricing, deletion requests | `src/apps/masterdata/**`, `src/app/(platform)/masterdata/**`, `src/app/(platform)/settings/general/masterdata/**` | `master_data` |
| StudioFlow | projects, phases, schedule, MOM, tasks, today | `src/apps/studioflow/**`, `src/app/(platform)/studioflow/**`, `src/app/(document)/studioflow/**` | `studioflow` |
| BQ | bills of quantity, library, templates, promotion requests | `src/apps/bq/**`, `src/app/(platform)/bq/**` | `bq` |
| Shell | composition only: app registration, layout, cross-app wiring | `src/app/*.ts(x)`, `src/app/(platform)/{layout,page,…}`, `src/application/**` | — |

Owning an app means owning its business rules **and every mutation of its schema**. A migration for
one app must not casually alter another app's schema.

## Dependency direction

```
                 Shell (src/app, src/application)
                  │ public · runtime · route lane only
        ┌─────────┼───────────┐
        ▼         ▼           ▼
   MasterData  StudioFlow     BQ        each app: private internals + public/
        ▲   ▲                 │
        │   └─────────────────┘   app → app: only through the other app's public/
        │
   ─────┴───────────── apps → platform (never the reverse) ───────────
                          PLATFORM
```

- `apps → platform` is always allowed. `platform → apps` is forbidden.
- `app A → app B` is allowed **only** through `src/apps/B/public/`.
- App internals — `domain/`, `services/`, `repositories/`, `components/`, `internal/`, `lib/`, and
  root files such as `service.ts` — are private. `runtime.ts` is the app's server composition
  entry: only the Shell may import it, and only to wire use cases.
- Do not reshape a folder to match this list. The rule is about who may import what, not names.

## Public contract rule

A cross-app consumer imports another app **only** from its `public/` folder:

```ts
import { createMasterDataPublicRead, type UnitRead } from "@/apps/masterdata/public"; // allowed
import { … } from "@/apps/masterdata/services/…";                                       // forbidden
```

A public contract exposes the minimum capability as typed DTOs and small functions
(`createMasterDataPublicRead(db)`, `createBqPublicRead(db)`, `*_PERMISSIONS`, `*_ROUTES`). It never
exposes a repository, a Prisma model type, or a Prisma client. `public/nav.ts` is client-safe and
import-free.

## Database ownership rule

- Each Prisma `@@schema` belongs to exactly one module (table above).
- Code reaches a model — `prisma.x`, `tx.x`, `Prisma.XWhereInput` — or names a schema in raw SQL only
  when that schema belongs to the file's own module. Cross-app **reads** are equally forbidden;
  use the owner's public read contract.
- The Shell counts as Platform for this rule. Tests are exempt (they seed across ownership).
- No `@relation` may join models of two different schemas. Cross-app references are plain ids
  (`masterdata_ref_id` in BQ) and actor history is a label snapshot, never a foreign key.
- Platform-owned data is read through Platform functions, not by naming its tables. For the audit
  store that is `@platform/core/audit/persistence`: `listAuditEvents` (an app's own history) and
  `latestAuditActorLabels`. Both are scoped to one `appId` and know nothing about entity meaning.

## Platform rule

Platform provides infrastructure and stays unaware of app business logic. It must not import an app;
`core` must not import `ui_engine` or `infrastructure`; the UI Engine holds no app vocabulary or
app-specific components (`VendorQuickCreateDialog` lives in the MasterData route lane for that
reason). A missing generic mechanism is added to Platform once and tested there.

## Cross-app interactions (current register)

| From → To | Kind | Mechanism |
|---|---|---|
| StudioFlow → MasterData | READ | `createMasterDataPublicRead(prisma)` injected in `studioflow/runtime.ts` |
| BQ → MasterData | READ | `masterDataRead` in `bq/runtime.ts`; DTO types in `bq/lib/snapshot.ts` and the BQ editor |
| BQ ⇄ MasterData: library promotion | COMMAND | `src/application/promotion-coordinator.ts`, ports injected by `src/app/promotion-runtime.ts`; neither app imports the other's runtime |
| StudioFlow → Master Data staff: sample requests | READ + COMMAND | StudioFlow exposes `createStudioFlowSampleRequestRead` (`studioflow/public`); Master Data keeps its own `SampleRequestIntake` (plain ids, no foreign keys); `src/application/sample-request-coordinator.ts` joins them, wired in `src/app/sample-request-runtime.ts`. Master Data never changes StudioFlow's request |
| StudioFlow / Master Data → people: notifications | SHARED INFRASTRUCTURE | each app calls the Platform `NotificationWriter` inside its own transaction through a small notifier (`studioflow/sample-request-notifier.ts` finds staff by Master Data's public permission; `masterdata/sample-request-notifier.ts` tells the requester and links to StudioFlow's public route) |
| every app → Platform | SHARED INFRASTRUCTURE | audit writer/reader, notifications, RBAC, DB runtime, storage, UI Engine |
| — | EVENT | none. Add one only when a consumer proves the need; a plain TypeScript contract comes first |

A new interaction is classified READ / COMMAND / EVENT / INFRA and added here in the same change.
Prefer a read contract to a command; put a use case that needs *two* apps in `src/application/`
with injected ports, as promotion does.

## What is enforced (`npm run check:boundaries`, `npm test`)

| Rule | Catches |
|---|---|
| `app -> other-app/<internal>` | any app or app route lane importing another app's non-`public` code, including `src/app/(document)/<app>` |
| `shell -> app/<internal>` | a Shell file importing an app layer other than `public`, `runtime`, or its route lane |
| `platform -> app` | platform importing any app |
| `core -> ui_engine`, `core -> infrastructure` | core reaching UI or persistence adapters |
| `app -> ui_engine/<internal>` | apps bypassing the UI Engine barrel |
| `app domain -> persistence` | `apps/<app>/domain/**` importing Prisma, `src/generated`, or infrastructure |
| `database ownership` | foreign model/type/raw-SQL schema access; cross-schema `@relation` |
| permission SSOT, route ownership, duplicate primitives | as before (`CORE.md`, `UTILITY-INVENTORY.md`) |

The fixtures fail closed: each rule has at least one rejection and one legal case.

## Accepted, recorded residuals (not defects)

- `MasterData` route lane renders BQ's `BqPromotionRequest` type from `bq/public`, and BQ reads
  MasterData: an app-level cycle at the **type** level only, mediated at runtime by the coordinator.
- `AUDIT_APP_IDS` in `platform/core/audit` is a closed list of app ids. Adding an app touches Platform
  data, not Platform logic.
- `bq/public/index.ts` and `masterdata/public/index.ts` hold their read queries inline rather than
  delegating to `services/`. The surface is correct; the file is just large.
- `src/app/(platform)/account/actions.ts` reads the platform `session` model directly. It is
  Platform-owned data in a Platform route, so it is not a boundary violation.
- Shell files still import each app's lane nav in `(platform)/layout.tsx` (allowed layer `route`);
  whether the layout should instead receive nav slots is the open decision in `BACKLOG.md` KB-037b.
