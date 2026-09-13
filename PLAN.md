# Active Plan

Plan ID: PF-1-LOCAL-STORAGE-R8-CORRECTION
Scope: Local filesystem asset provider and public/private application asset surfaces
Status: CORRECTION REQUIRED
Priority: P1
Owner: Repository owner
Target revision: R8.31
Last updated: 2026-09-14

## Review finding

R8.29 implemented the local provider, but review found a P1 correctness defect
before acceptance: the signed URL expiry value has different meanings in the
adapter and private route, so MOM image URLs expire immediately. The committed
tests also do not prove symlink escape protection. This correction pass must
fix those two gaps without changing the locked local/public/private decision.

## Outcome

Complete PF-1 for the final self-hosted/local deployment target. Keep the
provider-neutral `ObjectStorage` boundary, implement and compose a canonical
LocalFilesystemStorage adapter, and make Platform Brand marks public through an
application asset surface while keeping MOM and future private project assets
behind authenticated/authorized application reads. The database stores only
metadata and storage keys; it never stores file/blob contents.

## Context and Evidence

- Owner decision on 2026-09-14 makes self-hosted/local the final deployment
  target; Vercel + Supabase is deferred and must not block Foundation.
- R8.25 (`c4061f3`) implemented the first storage migration and the
  provider-neutral Core port. R8.26 (`358c61c`) corrected request headroom,
  storage contract wording, cleanup reporting, and the revision ledger.
- R8.27 (`a5bb5b7`) correctly blocked only on Supabase/provider evidence; that
  gate is now superseded by this owner decision.
- Existing Supabase infrastructure may remain parked as an optional adapter,
  but runtime composition and acceptance tests must use the local adapter.
- Existing runtime writes under `public/uploads` are not the target. The local
  storage root must be configuration/environment-driven and outside static
  public directories.

## Locked Decisions

- **REUSE/EXTEND:** Preserve the provider-neutral `ObjectStorage` port, fake
  seam, opaque server-generated keys, and domain-owned image policy. Add only
  the smallest read capability needed to distinguish public Brand mark reads
  from private authenticated reads.
- **ADD infrastructure:** `LocalFilesystemStorage` is the canonical deployment
  adapter. Its physical root comes from server-only configuration/environment;
  domain and app code use storage keys only, never absolute Windows paths.
- **Public Brand marks:** Brand mark objects use a fixed server-generated
  `brand-marks/<UUID>.png` key and are readable without authentication through
  an application/public asset endpoint. The filesystem directory itself is not
  exposed as a static directory.
- **Private assets:** MOM and future private project assets live below the
  configured private root and are readable only through an authenticated and
  authorized application endpoint. No private storage directory is served by
  Next static/public hosting.
- **Persistence meaning:** PostgreSQL/SQLite stores metadata and opaque keys
  only. File bytes remain on the configured filesystem root. Moving the
  installation to another PC or disk changes configuration, not domain data or
  key meaning.
- **Security:** reject absolute keys, traversal, separator escapes, unknown
  prefixes, and symlink/path escapes. Client input never chooses the physical
  root or arbitrary storage path. Provider errors are sanitized.
- **Supabase:** no bucket provisioning, credentials, browser proof, or runtime
  dependency is required for PF-1. The Supabase adapter may remain parked for a
  future deployment profile, but it is not the canonical composition root.

## Boundaries and Non-goals

- Preserve General Settings authorization, PNG validation, replacement/removal
  compensation, audit/no-op behavior, login branding, and authenticated-shell
  branding.
- Preserve StudioFlow MOM policy and its signed/private application read flow;
  do not broaden the MOM feature or alter Master Data/BQ behavior.
- Do not store blobs in Prisma/PostgreSQL, create a generic upload endpoint,
  expose absolute paths, expose the private directory, or add a cloud provider.
- Do not migrate/delete existing local uploaded files automatically. Existing
  files require a separate owner-approved migration/retention decision.
- Do not implement Vercel/Supabase provisioning or remove the parked adapter in
  this slice.

## Acceptance Criteria

1. Core remains provider-neutral; LocalFilesystemStorage is the only canonical
   runtime adapter and has focused tests for configured-root resolution,
   traversal/symlink protection, missing root, read/write/remove, and safe
   failures.
2. A managed Brand mark is stored under the configured root, its key is the
   only durable reference, and an unauthenticated request through the
   application/public asset surface returns the bytes.
3. An authenticated/authorized MOM request returns a private asset through the
   application endpoint; unauthenticated access and direct static access to the
   private directory fail.
4. No Prisma/SQLite model or audit payload contains image/blob bytes or an
   absolute filesystem path. Existing external Brand mark URLs remain valid.
5. Replacement, persistence failure, removal, cleanup failure, malformed PNG,
   oversized PNG, missing configuration, unauthorized private read, and safe
   error behavior have focused tests.
6. Login, authenticated shell, and Settings continue to render a usable Brand
   mark URL/path; moving the configured storage root requires no domain-data
   rewrite.
7. `prisma validate/generate`, typecheck, lint, boundary check,
   legacy-runtime check, full test suite, production build, and local browser
   checks for public Brand mark/private MOM behavior pass. Any unavailable
   local-browser check remains explicitly recorded rather than claimed.
8. The Executor updates `CHANGELOG.md`, stages only owned files, verifies the
   staged diff/whitespace, and creates local revision R8.31.

## Risks and Recovery

Local disk permissions, backups, disk loss, and root relocation become
deployment responsibilities. The adapter must fail safely when the root is
missing or inaccessible. A root change must be an explicit operator action;
the system must not silently reinterpret keys or fall back to the runtime
working directory. Recovery of old files is a separate migration decision.

## Executor Prompt

You are the Executor. Location: rumah. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and this `PLAN.md`, then implement the PF-1
correction pass for R8.29. Align signed URL expiry semantics between the local
adapter and private route, add valid/expired URL integration coverage, and
prove symlink escape protection for public and private reads. Preserve the
locked local/public/private boundary, run all required checks including local
browser evidence, update the changelog, and create local revision R8.31. Do
not provision or require Supabase. Stop
only for a material locked-decision conflict or unsafe boundary, then report
the commit, checks, limitations, and unrelated dirty files.
