# Active Plan

Plan ID: PF-1-CORE-PURITY-STORAGE-R8
Scope: Project Rebuild Foundation Core storage purity and Platform Brand mark migration
Status: READY
Priority: P1
Owner: Repository owner
Last updated: 2026-09-13

## Owner Intent

Execute the next Foundation critical path after accepted PF-0: make the storage boundary provider-neutral, remove StudioFlow MOM policy from Core, and move Platform Brand mark bytes off the runtime filesystem without changing Master Data, BQ, or StudioFlow business behavior.

## Problem

PF-0 is accepted after its R8.20 correction passed independent review in R8.21. The active PLAN and two governance ledgers still described PF-0 as awaiting review. The next open dependency, PF-1, has three verified violations of the Foundation boundary: Core exports MOM validation/policy, the Supabase adapter lives in Core, and Brand marks are written to `public/uploads` via Node filesystem APIs.

## Current Evidence

- `CHANGELOG.md` R8.21 records the independent PASS for the PF-0 correction; `docs/review.md` no longer contains a PF-0 entry and `docs/knownbug.md` records KB-026 Closed in R8.21. This accepted state overrides the stale READY/awaiting-review text.
- `docs/PROJECT-REBUILD-FOUNDATION-REFERENCE.md` §§6–8 and §30 define PF-1: Core owns only the `ObjectStorage` port; adapters are infrastructure-owned; MOM policy is StudioFlow-owned; Brand mark persistence uses the canonical storage mechanism.
- `docs/apps/platform/PLATFORM-ASSET-STORAGE-ROADMAP.md` locks the provider bucket (`platform-assets`), public-read Brand mark path, server-only writes, generated `brand-marks/<UUID>.png` keys, PNG/2 MB policy, replacement ordering, and cleanup/recovery behavior.
- `src/platform/core/storage/index.ts` exports `MOM_IMAGE_TYPES`, `MOM_IMAGE_MAX_BYTES`, and `validateMomImage()` including `studioflow.mom.*` errors.
- `src/platform/core/storage/supabase.ts` contains the concrete Supabase adapter and configuration; `src/platform/runtime.ts` imports it from Core.
- `src/platform/core/settings/brand-mark.ts` writes to `public/uploads/brand-marks` using `node:fs/promises`; General Settings calls it before its typed settings update.
- StudioFlow MOM is the sole current storage consumer. Its actions import the generic key factory and MOM validator; replacing that validator is permitted only as deterministic compatibility under PF-0's freeze exception.
- Brand marks are rendered from `brandMarkUrl` before sign-in and in the authenticated shell. Existing freeform safe HTTP(S)/site-relative URLs must remain supported.

## Decisions

- PF-0 is complete and accepted in R8.21. Do not re-execute it. Reconcile its stale roadmap/canonical-record status text as part of this planning revision only.
- PF-1 is a single P1 implementation slice because adapter relocation, MOM-policy extraction, and Brand mark migration jointly establish the Core/storage boundary. Do not split out a speculative abstraction.
- Keep `ObjectStorage`, its fake test seam, server-owned key creation, and signed-read capability in Core. Move only the Supabase implementation/configuration to `src/platform/infrastructure/storage/`; `src/platform/runtime.ts` remains the composition root.
- Move the full MOM type/byte/signature validation and MOM-specific safe messages to StudioFlow. Reuse the generic storage port and server-generated key constructor; do not extract a new generic image-validation helper because the two current validators have different policy and structural requirements.
- Preserve `brand_mark_url` for existing external/site-relative URL behavior. Add an additive nullable `brand_mark_storage_key` for platform-managed uploaded objects; never store expiring signed URLs as durable settings data. At read/presentation time, resolve a stored key through the injected `ObjectStorage` port; a persisted external URL remains the presentation URL.
- Brand mark writes use server-generated `brand-marks/<UUID>.png` keys, retain the existing PNG-structure/non-empty/2 MB policy, upload first, persist/audit the new reference atomically, then best-effort delete the old managed object. On persistence failure, delete the newly uploaded object before returning a safe error. Removing a managed mark clears the reference before best-effort deletion. Do not delete externally supplied URLs.
- The provider remains Supabase `platform-assets`; credentials stay server-only. Missing configuration must fail safely—no local-filesystem fallback, provider secret exposure, or claim of production provisioning.

## Open Questions

None for the code and schema boundary. Provisioning the public-read bucket and deployment secrets remains an external operational limitation already recorded as KB-004; it is not permission to retain filesystem storage or block deterministic implementation/testing with the fake adapter.

## Requirements

Implement only the decisions above. Preserve Platform General Settings authorization, typed validation, audit/no-op semantics, safe external URL validation, login and shell rendering, and StudioFlow MOM's accepted formats, byte limit, error behavior, and storage lifecycle. Preserve Master Data and BQ behavior exactly. Add no dependency, generic upload API, client-controlled key/bucket, public write/list/delete access, local fallback, or new StudioFlow media feature.

## Domain Model / Workflow

Brand mark upload: Platform settings policy validates PNG → server creates `brand-marks/<UUID>.png` → infrastructure adapter writes through Core `ObjectStorage` → settings transaction persists `brand_mark_storage_key` and audit → presentation resolves a signed/public read URL → old managed object is cleaned up best-effort.

MOM: StudioFlow-owned policy validates its selected image → Core creates an opaque key → runtime-bound `ObjectStorage` persists/reads/removes it. Core contains no MOM vocabulary.

## Non-goals

- No PF-2 registration/permission cleanup, PF-3 routing, PF-4 settings redesign, UI Engine redesign, utility curation, or boundary-check expansion.
- No Master Data or BQ behavior, schema, or UI change.
- No StudioFlow recovery, MOM redesign, retention-policy decision, new media route, or repair of KB-012/KB-022.
- No provider provisioning, Vercel secret mutation, bucket-policy mutation, remote operation, release, tag, or legacy access.
- No deletion of existing uploaded local files in this slice; their migration/cleanup requires separately approved retention handling.

## Dependencies

- `AGENTS.md`, `docs/agent/README.md`, `CORE.md` §§11–12 and §14, and the Foundation Reference §§6–8, §30, §34.
- `docs/apps/platform/PLATFORM-ASSET-STORAGE-ROADMAP.md` locked decisions 1–8 and Phase 3.
- Existing `ObjectStorage` port/fake, runtime composition root, typed settings service, General Settings permission boundary, and StudioFlow MOM storage consumer.
- Additive Prisma migration and regenerated client. Any database command requires `STUDIOFLOW_LOCATION=rumah`, `.env.rumah`, and prior verification that its explicit target is rebuild-only; use a disposable rebuild database for tests.

## Architecture / Ownership

Core owns the narrow provider-neutral storage port and opaque references. Infrastructure owns Supabase configuration and HTTP mechanics. Runtime binds infrastructure to Core. Platform General Settings owns Brand mark authorization, PNG policy, persistence, and audit. StudioFlow owns MOM image policy and messages. UI Engine remains limited to its existing selection/preparation interaction. No layer gains cross-app/domain ownership.

## Acceptance Criteria

1. Core storage exports no `MOM`, `studioflow`, allowed-format, byte-limit, or MOM-validation policy; StudioFlow owns and tests its existing MOM policy.
2. The Supabase adapter/configuration is outside Core; Core does not import infrastructure, and runtime is the only composition binding.
3. Platform-managed Brand marks never write to the runtime filesystem. Existing external/site-relative Brand mark URLs still render and validate as before.
4. An additive migration introduces a nullable managed-object reference without rewriting or invalidating existing `brand_mark_url` values; generated Prisma types and settings read/update/audit behavior remain correct.
5. Valid uploaded PNGs use server-owned `brand-marks/<UUID>.png` keys and object storage. Replacement, persistence failure, removal, missing provider, malformed/oversized input, and best-effort cleanup paths have focused tests and return safe errors without credentials.
6. Login and authenticated shell receive a usable presentation URL for a stored managed Brand mark; no raw storage key or expired signed URL is persisted as the durable Brand mark URL.
7. Existing StudioFlow MOM storage tests/contract behavior remain green, and Master Data/BQ source behavior is untouched.
8. Required checks pass: focused storage/settings/MOM tests, Prisma validation/generation, typecheck, lint, boundary checks, legacy-runtime check, full test suite against a verified disposable rebuild database, and production build. Browser verification covers permitted General Settings Brand mark states if the provider is provisioned; otherwise it records the safe unavailable-provider state and KB-004 remains open.
9. The executor records R8.23 in `CHANGELOG.md`, moves PF-1 to `docs/review.md` rather than closing it in the roadmap, stages only owned files, passes staged whitespace inspection, and makes one local commit.

## Proposed Work Slices

### READY — PF-1: Core purity and Brand mark storage migration

**Target revision:** R8.23

**Exact authority:** this PLAN; `AGENTS.md`; `docs/agent/EXECUTOR.md`; `CORE.md` §§11–12, §14; Foundation Reference §§6–8, §30, §34; and `docs/apps/platform/PLATFORM-ASSET-STORAGE-ROADMAP.md` locked decisions/Phase 3.

**Allowed changes:** Core storage public contract/tests only as needed to remove domain policy; new infrastructure storage adapter/tests; runtime composition import; StudioFlow MOM policy/action/test relocation with equivalent behavior; Platform Settings schema/service/action/form/presentation changes required for managed Brand marks; one additive migration; generated Prisma client if generated by the approved workflow; focused boundary/test updates; `docs/roadmap.md` PF-0 acceptance wording, `docs/FOUNDATION-BASELINE-FREEZE.md` accepted status, `docs/review.md`, `CHANGELOG.md`, and `PLAN.md` lifecycle state.

**Forbidden changes:** any unrelated app behavior; Master Data/BQ code or schema; StudioFlow workflow/lifecycle/UI redesign; any unapproved UI Engine API; external storage provisioning; credentials/config files; local-file deletion; dependency changes; app registration/routes/settings redesign; legacy access; remote changes.

**Required evidence:** record baseline/dirty files and next revision; inspect all storage consumers before edits; verify the exact migration target is isolated `studioflow-rebuild` before any Prisma/database command; prove no Core imports from Infrastructure/apps and no Core MOM vocabulary; inspect staged diff/stat/whitespace; run the acceptance checks. A cancelled/unavailable database or provider check is a limitation, not a pass.

**Regression risks:** object storage and database cannot share one transaction, so replacement cleanup must follow the locked compensating order; signed URLs must be resolved at presentation time; moving validation can accidentally relax MOM safety; a managed object could be deleted when an external URL is configured; a provider error can leak server details. Tests must cover each case.

## Regression Risks

The slice changes platform infrastructure and a shared persistence path. Its main risks are stale/invalid Brand presentation URLs, orphaned or prematurely deleted objects, unsafe provider errors, Core-to-domain coupling in a new location, and accidental changes to the frozen MOM behavior. The acceptance criteria require focused negative and compatibility evidence before review.

## Roadmap Impact

PF-0 is accepted in R8.21. PF-1 is now the sole READY Foundation slice and remains open in `roadmap.md` until independent review passes. PF-2 through PF-8 and StudioFlow Recovery remain open and blocked by the Foundation sequence.
