# Active Plan

Plan ID: PF-1-CORE-PURITY-STORAGE-R8
Scope: Core storage purity and Platform Brand mark persistence
Status: READY
Priority: P1
Owner: Repository owner
Target revision: R8.25
Last updated: 2026-09-13

## Outcome

Complete PF-1 as one coherent Foundation milestone: make Core storage
provider-neutral, return MOM image policy to StudioFlow, and move
Platform-managed Brand mark bytes from the runtime filesystem to canonical
object storage without changing Master Data, BQ, or accepted StudioFlow
behavior.

## Context and Evidence

- PF-0 is accepted in R8.21. PF-1 is the next Foundation dependency in
  `docs/roadmap.md` and remains open until this implementation passes review.
- `docs/PROJECT-REBUILD-FOUNDATION-REFERENCE.md` §§6–8, §30, and §34 define
  the ownership boundary. `CORE.md` §§11–12 and §14 remain authoritative.
- `docs/apps/platform/PLATFORM-ASSET-STORAGE-ROADMAP.md` locks the Brand mark
  provider, key, validation, replacement, cleanup, and recovery behavior.
- Current evidence shows MOM policy and the Supabase adapter under
  `src/platform/core/storage/`, while Brand marks are written through
  `src/platform/core/settings/brand-mark.ts` to `public/uploads`.
- StudioFlow MOM is the only existing object-storage consumer. Login and the
  authenticated shell currently render `brandMarkUrl` from General Settings.

## Locked Decisions

- Core keeps only the provider-neutral `ObjectStorage` port, its fake test seam,
  opaque server-generated keys, and read capability. Concrete Supabase
  configuration/HTTP mechanics belong in Platform infrastructure; runtime is
  the composition root.
- StudioFlow owns its full MOM image type, byte, signature, and safe-error
  policy. Preserve its accepted formats, limit, messages, and storage lifecycle.
  Do not invent a generic image-policy abstraction.
- Preserve `brand_mark_url` for existing safe HTTP(S) and site-relative URLs.
  Add a nullable `brand_mark_storage_key` for Platform-managed objects. Resolve
  managed keys to presentation URLs at read time; never persist an expiring
  signed URL as durable settings data.
- Brand mark uploads remain PNG-only and at most 2 MB. Use server-generated
  `brand-marks/<UUID>.png` keys. Upload first, persist and audit the managed
  reference, then best-effort delete the replaced managed object. On persistence
  failure, clean up the new upload. On removal, clear the reference before
  best-effort deletion. Never delete externally supplied URLs.
- The provider remains Supabase bucket `platform-assets`, with server-only
  credentials and writes. Missing configuration fails safely; there is no
  filesystem fallback and no provider-secret leakage.

## Boundaries and Non-goals

- Preserve General Settings authorization, validation, no-op/audit behavior,
  login/shell rendering, and existing external Brand mark URLs.
- Preserve Master Data and BQ behavior exactly. StudioFlow changes are limited
  to moving existing MOM policy behind the same behavior.
- Add no dependency, generic upload API, client-controlled key/bucket, public
  write/list/delete access, local fallback, or new media feature.
- Do not include PF-2 through PF-8, StudioFlow Recovery, UI Engine redesign,
  provider provisioning, secret mutation, legacy access, remote actions, or
  deletion/migration of existing local uploaded files.
- Any Prisma/database command must use `STUDIOFLOW_LOCATION=rumah`, load
  `.env.rumah`, and first prove the explicit target is rebuild-only.

## Acceptance Criteria

1. Core contains no MOM/StudioFlow policy or concrete provider adapter, and
   boundary evidence proves Core does not import apps or infrastructure.
2. StudioFlow owns and tests the unchanged MOM validation and storage behavior.
3. Platform-managed Brand marks never write to the runtime filesystem. Existing
   external/site-relative Brand mark URLs still validate and render.
4. An additive migration adds the nullable managed-object reference without
   rewriting existing URLs; generated types and settings read/update/audit
   behavior remain correct.
5. Upload, replacement, persistence failure, removal, malformed/oversized PNG,
   missing provider, and cleanup behavior have focused safe-error tests.
6. Login and the authenticated shell receive a usable presentation URL while
   the durable settings record contains no raw secret or expiring signed URL.
7. Focused checks, Prisma validation/generation, typecheck, lint, boundary and
   legacy-runtime checks, the full test suite on a verified disposable rebuild
   database, and production build pass. Browser-check Brand mark states when
   the provider is provisioned; otherwise record the unavailable-provider state
   and keep KB-004 open.
8. The Executor records R8.25 in `CHANGELOG.md`, stages only owned files,
   inspects the staged diff and whitespace, and creates one local commit.

## Risks and Recovery

Object storage and PostgreSQL do not share a transaction. Tests must prove the
compensating order so replacement cannot prematurely delete the old object and
failed persistence does not strand the new object. Resolve presentation URLs
at read time, keep provider errors sanitized, and verify the policy move does
not relax MOM safety.

## Executor Prompt

You are the Executor. Location: rumah. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and the active `PLAN.md`, then implement the entire
PF-1 READY outcome as one coherent change. Inspect current repository evidence,
preserve unrelated owner work, make sound in-scope implementation decisions,
run the required checks, update `CHANGELOG.md`, and create local revision
R8.25. Stop only for a material locked-decision conflict or unsafe boundary;
otherwise finish the outcome and report the commit, checks, limitations, and
remaining unrelated dirty files.
