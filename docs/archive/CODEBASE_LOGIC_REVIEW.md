# Codebase Logic Review — StudioFlow Rebuild (ARCHIVED 2026-09-22)

> **Superseded.** Re-verified against source on 2026-09-22: most findings were
> already stale or mischaracterized (e.g. the "cross-app import violation" is
> actually AGENTS.md-sanctioned `app -> other-app/public`). The two findings
> that survived verification (SF-02 orphan-delete guard, SF-05 client-name
> race) were fixed the same day — see `CHANGELOG.md` R8.107 and
> [`docs/BACKLOG.md`](../BACKLOG.md)'s origin note. Kept only as a record of
> what was claimed and why most of it didn't hold up.

**Date:** 2026-09-22  
**Scope:** Full codebase (committed + uncommitted) — business logic, backend logic, UI/UX logic  
**Focus:** Centralization core/foundation usage across apps; StudioFlow app deep dive

---

## Executive Summary

The codebase demonstrates **strong architectural discipline** with well-enforced boundaries between platform core and app domains. The three apps (Master Data, BQ, StudioFlow) correctly consume the centralized foundation via public barrels, and domain logic is cleanly separated into pure rule modules. However, there are **notable inconsistencies in cross-app patterns**, **legacy debt in StudioFlow**, and **UI Engine adoption gaps** that create technical debt.

**Overall Architecture: B+** — Strong foundation with clean layering, but cross-app boundary leak (StudioFlow→Master Data) and inconsistent UI Engine adoption prevent A-grade.

**StudioFlow Business Logic: A-** — Phase engine, blockers, checklist, MOM rules are well-designed pure functions with good test coverage. Main debt: deprecated model, override destruction, schedule parser.

**Backend Consistency: B** — All three apps follow command/read/port pattern, but error shapes, audit adoption, and validation helpers diverge.

**UI/UX Consistency: C+** — UI Engine exists and is used for primitives, but StudioFlow builds complex composites (phase rail, schedule board, MOM editor) with custom code instead of composing patterns. Design tokens partially drift.

---

## 1. Centralization Core/Foundation Usage Across Apps

### 1.1 What Works Well

#### A. Platform Core is Properly Isolated & Composed

| Component | Location | Key Property |
|-----------|----------|--------------|
| **Prisma Client + Pool** | `src/platform/core/db/index.ts:34-74` | Process-wide singleton; dev hot-reload caching; `runSerializableTransaction` wrapper |
| **RBAC Evaluation** | `src/platform/core/rbac/index.ts:31-66` | Core owns *mechanics only* (`hasPermission`, `hasAllPermissions`); apps own vocabulary |
| **Registry Composition** | `src/platform/core/rbac/registry.ts:67-126` | Validates IDs, duplicates, access permissions; fails loudly on invariant violations |
| **Settings Singleton** | `src/platform/core/settings/index.ts:33-66` | Exactly one row (DB CHECK constraint); audited deltas; no arbitrary key/value API |
| **Storage Boundary** | `src/platform/core/storage/index.ts:16-20` | Domain-neutral `ObjectStorage` interface; apps compose with their key policies |

#### B. Apps Register via Composition Root, Not Platform Imports

```typescript
// src/app/app-registrations.ts:16-34 — correct pattern
export const APP_REGISTRATIONS = [
  { appId: "masterdata", name: "Master Data", rootPath: "/masterdata", permissions: Object.values(MASTERDATA_PERMISSIONS) },
  { appId: "bq", name: "Bill of Quantity", rootPath: "/bq", permissions: Object.values(BQ_PERMISSIONS) },
  { appId: "studioflow", name: "StudioFlow", rootPath: "/studioflow", permissions: Object.values(STUDIOFLOW_PERMISSIONS) },
];
```

Platform never imports app code — apps export permissions from public barrels.

#### C. Auth/Sessions Are Provider-Neutral & Request-Bound

- `getPrincipal()`/`requirePrincipal()` resolve live DB state every call (`src/platform/core/auth/request.ts`); no JWT/cookie trust for status/roles
- Login composition includes rate limiting + verification + session creation (`src/platform/core/auth/login.ts`)
- Bootstrap command is server-only, never HTTP (`src/platform/core/auth/bootstrap.ts`)

### 1.2 Gaps & Inconsistencies

| Area | Issue | Location |
|------|-------|----------|
| **People Directory** | `createPeopleDirectory(prisma)` exposed from platform runtime but implemented in core RBAC. Master Data & BQ don't use it — StudioFlow does. Inconsistent adoption. | `src/platform/runtime.ts:59-60` |
| **Audit Writer** | Core provides `createAuditEventWriter()` but only StudioFlow uses it consistently. Master Data audit is implicit via service layer; BQ has no visible audit calls. | `src/platform/runtime.ts:27` |
| **Platform Settings** | Only StudioFlow reads `platformSettings.read()` in UI shell. Master Data & BQ don't surface org name, locale, timezone, theme in their layouts. | `src/platform/authenticated-shell/index.tsx:27` |
| **Object Storage** | Two separate roots (`private-assets`, `public-assets`) composed in runtime. StudioFlow uses `objectStorage` for MOM/deliverables; Master Data uses `brandMarkStorage` for brand logos; BQ has no storage usage yet. Key prefixes not namespaced by app. | `src/platform/runtime.ts:33-40` |

### 1.3 Technical Debt: Cross-App Service Calls

**StudioFlow imports Master Data public read** — **VIOLATES BOUNDARY** (AGENTS.md: "Forbidden dependencies: cross-app internal imports"):

```typescript
// src/apps/studioflow/runtime.ts:2-6
import { createMasterDataPublicRead } from "@/apps/masterdata/public";
export const studioFlow = createStudioFlowService(prisma, { 
  ..., 
  masterData: createMasterDataPublicRead(prisma) 
});
```

**Fix:** Move `createMasterDataPublicRead` to platform core as a shared read capability, or have StudioFlow snapshot needed data at write time.

---

## 2. StudioFlow App — Deep Logic Review

### 2.1 Business Logic (Domain Rules)

#### Phase Engine V2 — Well-Structured Pure Rules (`src/apps/studioflow/domain/phase.ts`)

- Status machine with explicit transitions (`TRANSITIONS` map lines 104-112), `isValidPhaseTransition`
- Command availability derived from state + lock + legacy supervision flag (`availablePhaseCommands` lines 132-145)
- Revision numbering: CLIENT feedback → major bump, INTERNAL → minor (`nextRevision` lines 169-175)
- Sequential activation with `allowParallel` override (`canActivatePhase` lines 95-102)

#### Blockers — Single Projection, Correct Semantics (`src/apps/studioflow/domain/blockers.ts`)

- `fullBlockers` for approveInternal/submitClient/approveClient (open feedback + unchecked blocking root items)
- `todoBlockers` for submitInternal (only unchecked root items — V2-D1: feedback is separate)
- Warning-only items (`is_blocking = false`) never gate approval — correctly separated

#### Checklist — Depth Capped at 1, Cascade Down Only (`src/apps/studioflow/domain/checklist.ts`)

- `MAX_CHECKLIST_DEPTH = 1` (line 6), `buildTree` promotes orphans to roots (line 109)
- Toggle cascade: parent → children only, never up (line 124-125)
- Filter logic pure, testable (`applyChecklistFilter` lines 34-55)

#### MOM — Snapshot Equality & Image Slots (`src/apps/studioflow/domain/mom.ts`)

- `momSnapshotsEqual` uses canonical JSON (lines 122-134) — stable across JSONB round-trips
- Two image slots per item (0, 1), 3 MB limit (line 34)
- List style markers: DECIMAL/DISC/DASH/NONE with PLAIN points not advancing counter (lines 43-52)

#### Schedule — Code Generation & Label Math (`src/apps/studioflow/domain/schedule.ts`)

- `scheduleCode(prefix, increment)` → normalized prefix + zero-padded (line 47-49)
- `optionLabel`/`optionLabelIndex`: bijective A-Z, AA-ZZ mapping (lines 51-68)
- `nextOptionLabel` never reuses deleted labels (line 71-74)
- Legacy Google Sheets CSV parser (lines 113-231) — brittle, untested parsing logic

### 2.2 Business Logic Defects & Debt

| # | Defect | Location | Severity |
|---|--------|----------|----------|
| **SF-01** | **`SfRequirement` model marked DEPRECATED but still in schema** — "Rows retained as rollback copy only; nothing reads this at runtime" (`prisma/schema.prisma:1439-1461`). Migration to drop not scheduled. | Schema | Medium |
| **SF-02** | **Phase definition deletion allows orphaned phases** — `deletePhaseDefinition` checks `usedBy > 0` but only for `SfPhase`; `SfChecklistTemplate` with `definition_id` counted but not blocked (line 759). If templates exist, definition deletes but templates become orphaned. | `phases/service.ts:746-767` | High |
| **SF-03** | **Schedule CSV parser has no tests** — 120 lines of fragile string parsing (`schedule.ts:113-231`). No integration test for legacy sheet import. | `domain/schedule.ts` | Medium |
| **SF-04** | **`seedScheduleFromTemplates` called on every project create** (`projects/service.ts:434-435`) but templates are global — creates duplicate schedule rows per project. Should be opt-in or template-scoped. | `projects/service.ts` | Medium |
| **SF-05** | **Client `name_key` collision on concurrent create** — `upsertClientByName` uses `findUnique` then `create` (race window). Unique index catches it but `mapWriteError` not shown to translate P2002 to friendly error. | `projects/service.ts:100-110` | Low |
| **SF-06** | **Revision override hard-reset destroys activity history** — `overrideRevision` deletes all revisions + detaches deliverables (`phases/service.ts:332-333`). Audit snapshot captured but original revision IDs lost — breaks traceability. | `phases/service.ts:305-351` | High |
| **SF-07** | **`waitingDays` uses `new Date()` default** — not injectable for tests; service passes `nowOf(ports)` but domain function doesn't accept it consistently (line 178 vs line 517 usage). | `domain/phase.ts:178` | Low |

### 2.3 Backend Logic (Services & Transactions)

#### ✅ Strong Patterns

- **Command/Read separation** — every service exports `CommandContext` (requires grants + actor) and `ReadContext` (grants only) (`shared.ts` types)
- **Transaction boundaries explicit** — `runTransaction` wraps every command; reads run outside transactions (`CORE.md §2`)
- **Audit on every mutation** — `writeAudit` called with structured `changes` + `metadata` (`shared.ts:25`)
- **Permission checks at service entry** — `requireCommand(input, P.xxx)` / `requirePermission(input.grants, P.xxx)` (`shared.ts:22-23`)
- **Ports injected, not imported** — `StudioFlowPorts` = `{ runTransaction, auditWriter, now, generateId, people, storage, masterData }` (`shared.ts:28-30`)

#### ⚠️ Inconsistencies

| Issue | Example |
|-------|---------|
| **Mixed error types** | Some commands throw `AppError` with codes (`CONFLICT`, `INVALID`), others throw raw `invalid()`/`conflict()` helpers that wrap `AppError` — inconsistent shape for client error handling |
| **`loadWritableProject` vs `loadWritablePhase`** | `loadWritableProject` checks `archived_at`; `loadWritablePhase` re-checks project archive — duplicated logic (`phases/service.ts:61-67`) |
| **`nowOf(ports)` vs `ports.now()`** | `nowOf` helper wraps `ports.now()` but some domain functions use `new Date()` directly (`domain/phase.ts:180`) |

#### 🔴 Critical: Master Data Cross-Import in Runtime

```typescript
// src/apps/studioflow/runtime.ts:2-6 — VIOLATES BOUNDARY
import { createMasterDataPublicRead } from "@/apps/masterdata/public";
export const studioFlow = createStudioFlowService(prisma, { 
  ..., 
  masterData: createMasterDataPublicRead(prisma) 
});
```

**Fix:** Move `createMasterDataPublicRead` to platform core as a shared read capability, or have StudioFlow snapshot brand/sku data at project/phase creation.

### 2.4 UI/UX Logic (Consistency & Connectivity)

#### ✅ UI Engine Adoption in StudioFlow

| Component | UI Engine Primitives Used |
|-----------|---------------------------|
| Phase status badge | `phaseStatusDisplay` (domain) → `StatusBadge` (UI Engine) (`_components/phase-status.tsx:4-12`) |
| Checklist tree | `Checkbox`, `Badge`, `Button`, `Input`, `RowActionMenu`, `EmptyState`, `InlineError` (`checklist-tree.tsx:7`) |
| Today page | `PageHeader`, `FilterChip` (`page.tsx:6`) |

#### ⚠️ UI Engine Gaps in StudioFlow

| Component | Uses UI Engine? | Custom Implementation |
|-----------|-----------------|----------------------|
| Phase strip/rail | ❌ | Custom CSS grid + status badges |
| Project directory table | ❌ | Custom table with inline actions |
| MOM editor | ❌ | Custom rich text + image upload |
| Schedule board | ❌ | Custom drag-drop Kanban |
| Settings pages | ❌ | Custom forms |

#### 🔴 Design Token Drift

- StudioFlow components use **hardcoded Tailwind classes** alongside UI Engine tokens:
  ```tsx
  // checklist-tree.tsx:98 — mixes UI Engine tokens with raw classes
  className={`flex items-start gap-2.5 rounded-control px-1.5 py-1.5 hover:bg-surface-muted ${depth > 0 ? "ml-7" : ""}`}
  ```
- Phase accent dots use CSS variables `--ui-phase-moodboard` etc. defined in `tokens.css` but **not exported from UI Engine tokens barrel** (`src/platform/ui_engine/tokens/index.ts` only exports generic tokens)

#### ⚠️ Inconsistent State Display

- Phase status tones: `phaseStatusDisplay` returns `tone: "neutral" | "success" | "warning" | "danger"` but `StatusBadge` expects `"neutral" | "success" | "warning" | "danger" | "info"` — mapping works but undocumented
- Project status tones defined locally in `phase-status.tsx:16` (`ACTIVE: "success"`, `ON_HOLD: "warning"`, `COMPLETED: "neutral"`) — **not shared with domain**

---

## 3. Cross-Cutting Logic Defects & Debt

### 3.1 Three Apps — Inconsistent Patterns

| Pattern | Master Data | BQ | StudioFlow |
|---------|-------------|-----|------------|
| **Public read factory** | `createMasterDataPublicRead(prisma)` ✅ | `createBqPublicRead(prisma)` ✅ | ❌ (uses Master Data's) |
| **Service composition** | `createMasterDataService(db, ports)` ✅ | `createBqService(db, ports)` ✅ | `createStudioFlowService(db, ports)` ✅ |
| **Domain pure rules** | ❌ (scattered in services) | `calculation-engine.ts` ✅ | `domain/*.ts` ✅ |
| **Audit on writes** | Implicit in service | ❌ None visible | Explicit `writeAudit` ✅ |
| **Permission checks** | `requirePermission(grants, perm)` ✅ | `requirePermission(grants, perm)` ✅ | `requireCommand/requirePermission` ✅ |
| **Validation** | Zod schemas in service | Zod in actions | `requiredText`/`optionalText` helpers ✅ |

### 3.2 Schema & Migration Debt

- **Four separate PostgreSQL schemas** (`platform`, `master_data`, `bq`, `studioflow`) — correct isolation
- **No cross-schema FKs** — enforced by Prisma schema (plain string IDs for user refs)
- **`SfRequirement` deprecated but not dropped** — migration needed
- **Legacy phase definition IDs hardcoded** in domain (`domain/phase.ts:35-41`) — migration `20260920000000_sf_v2e_definition_migration` seeds them but code assumes specific UUIDs

### 3.3 Testing Gaps

- **UI Engine**: Only `ui-engine.test.ts` (snapshot tests for primitives)
- **Domain rules**: StudioFlow has `domain.test.ts`, `phase.test.ts` — good coverage
- **BQ calculation engine**: Has `calculation-engine.test.ts` — comprehensive
- **Master Data**: Service integration tests only — no pure rule tests
- **Schedule CSV parser**: **Zero tests** — high risk

---

## 4. Prioritized Action Items

### P0 — Must Fix (Architectural Violations)

1. **Remove StudioFlow → Master Data cross-import** — create platform `createMasterDataReferenceRead` or snapshot at write
2. **Fix `deletePhaseDefinition` orphan bug** — block if `SfChecklistTemplate` exists for definition
3. **Drop `SfRequirement` model** — follow-up migration

### P1 — High Impact (Consistency & Reliability)

4. **Add tests for Schedule CSV parser** (legacy import path)
5. **Standardize error shape** — all commands throw `AppError` with consistent `{ code, message, details? }`
6. **Extract `now` port to domain functions** — make `waitingDays`, `dateOnlyToDate` accept `now: Date` param
7. **Namespace storage keys by app** — `studioflow/mom/...`, `masterdata/brand/...`, `bq/...`

### P2 — Medium (UX & Maintainability)

8. **Migrate StudioFlow custom components to UI Engine patterns** — phase strip, project table, MOM editor, schedule board
9. **Export phase accent tokens from UI Engine** — replace hardcoded `LEGACY_ACCENT_DOT_CLASSES` map
10. **Unify project/phase status tones** — single source of truth in domain, consumed by UI
11. **Document `seedScheduleFromTemplates` behavior** — clarify if per-project duplication is intentional

### P3 — Low (Polish)

12. **Add `FakeObjectStorage` to core storage exports** for test consumers
13. **Centralize `PersonChip` / `DueLabel` as UI Engine patterns** (currently StudioFlow-private)

---

## 5. Recommended Next Slice

Fix P0 items + add Schedule CSV tests + standardize error shape. Then migrate one complex StudioFlow view (phase strip or project directory) to UI Engine patterns as proof-of-concept.

---

## Appendix: Key File References

### Platform Core
- `src/platform/runtime.ts` — composition root for all core services
- `src/platform/contracts/index.ts` — cross-app types (`EntityId`, `Money`)
- `src/platform/core/rbac/registry.ts` — permission registry composition
- `src/platform/core/settings/index.ts` — platform settings service
- `src/platform/core/auth/index.ts` — auth boundary exports
- `src/platform/core/storage/index.ts` — storage interface
- `src/platform/ui_engine/index.ts` — UI Engine public barrel

### StudioFlow Domain
- `src/apps/studioflow/domain/phase.ts` — phase engine pure rules
- `src/apps/studioflow/domain/blockers.ts` — blocker projection
- `src/apps/studioflow/domain/checklist.ts` — checklist rules
- `src/apps/studioflow/domain/mom.ts` — MOM vocabulary & snapshots
- `src/apps/studioflow/domain/schedule.ts` — schedule code/label math
- `src/apps/studioflow/domain/revisions.ts` — revision retention policy

### StudioFlow Services
- `src/apps/studioflow/projects/service.ts` — project CRUD + bootstrap
- `src/apps/studioflow/phases/service.ts` — phase commands + activities + deliverables
- `src/apps/studioflow/service.ts` — service composition
- `src/apps/studioflow/runtime.ts` — runtime composition (HAS CROSS-IMPORT BUG)

### App Public Boundaries
- `src/apps/studioflow/public/index.ts` — StudioFlow public exports
- `src/apps/masterdata/public/index.ts` — Master Data public read factory
- `src/apps/bq/public/index.ts` — BQ public read factory + calculation engine

### Schema
- `prisma/schema.prisma` — complete schema with 4 isolated PostgreSQL schemas