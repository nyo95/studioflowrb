# Platform Asset Storage Roadmap

## Status

**PARTIALLY ACTIVATED in R7.52.** The provider-neutral Core port, fake seam,
UI Engine ImageWorkspace, and StudioFlow MOM consumer exist. The final target
is now self-hosted/local; PF-1 activates the LocalFilesystemStorage adapter.
The Supabase adapter is optional parked infrastructure and is not a Foundation
release blocker.

## Objective

Provide durable asset storage for the self-hosted/local StudioFlow deployment
without putting file/blob contents in SQLite or PostgreSQL. The database stores
metadata and opaque storage keys; the configured local filesystem stores bytes.

Brand marks are public presentation assets served through an application-owned
public asset surface. MOM and future private project assets are served only
through authenticated/authorized application endpoints. The private storage
directory is never exposed as a static/public directory.

## Evidence and classification

Legacy evidence was inspected read-only at:

- repository: `D:/Misc/ProjectsHUB/studioflow`
- committed reference: `5fc605e304a12db6b5efe0a2c0271a2d9415b2da`
- relevant implementation: `src/components/ui/optimized-uploader.tsx`

| Observed behavior | Classification | Rebuild destination |
| --- | --- | --- |
| Client-side crop/compression | **MERGE** | Shared UI/image-preparation capability; each consumer declares policy |
| Server validation and persistence | **KEEP** | Core ObjectStorage port plus deployment adapter |
| Public writes under `public/uploads` | **PURGE** | Local provider with configured root and application-owned public read |
| Caller-selected folders/paths | **PURGE** | Fixed server-owned keys; no client-selected root/path |
| Cloud-specific Supabase provider | **DEFER** | Parked optional adapter; not required by the local Foundation target |

The legacy working tree was dirty when inspected. Only the committed reference
above is evidence; no working-tree legacy file is a source of behavior.

## Locked design decisions

1. **Canonical provider.** Use `LocalFilesystemStorage` in the self-hosted/local
   runtime. Its physical root is supplied by server-only configuration or an
   environment variable and must not default silently to the process working
   directory.
2. **Database meaning.** SQLite/PostgreSQL stores metadata and opaque keys only;
   it never stores image/file/blob contents or absolute filesystem paths.
3. **Public Brand marks.** Brand marks use fixed server-generated
   `brand-marks/<UUID>.png` keys. An application/public asset endpoint may serve
   those bytes without authentication. The backing directory is not exposed as
   a static folder.
4. **Private assets.** MOM and future private project assets use private keys
   below the configured root and are read only through authenticated,
   authorized application endpoints. Direct static/public access is forbidden.
5. **Key safety.** Reject absolute paths, traversal, separator escapes,
   unknown prefixes, and symlink escapes. Domain code never sees or constructs
   physical paths; it passes storage keys through ObjectStorage.
6. **Shared boundary.** Core owns the provider-neutral ObjectStorage contract,
   opaque references, and fake seam. LocalFilesystemStorage and the parked
   Supabase adapter remain infrastructure. UI Engine owns preparation
   interaction; each application owns format, size, retention, and authorization
   policy.
7. **Compensation.** Upload first, persist the key, then best-effort delete a
   replaced object. On persistence failure, remove the new object. On removal,
   clear the reference first. Cleanup failures are operationally reported and
   never leak raw provider/path details.
8. **Supabase is deferred.** No Supabase bucket, credential, Vercel setting, or
   cloud browser proof is required for Foundation completion. The adapter may be
   selected later by a separate deployment profile without changing domain
   storage keys.

## Delivery sequence

### Phase 1 — platform contract and test seam (complete in R7.52)

- Keep the provider-neutral port, object-reference model, fake seam, and UI
  Engine image-preparation interaction.
- Keep image policy out of the shared layer; consumers declare it.

### Phase 2 — LocalFilesystemStorage adapter (PF-1; accepted in R8.34)

- Resolve a configured storage root and create controlled public/private
  subdirectories without placing private bytes under `public/`.
- Implement safe key-to-file mapping, atomic enough writes, reads, removal,
  missing-root behavior, traversal/symlink protection, and sanitized errors.
- Compose this adapter as the canonical runtime provider. Keep Supabase parked.

### Phase 3 — General Settings Brand mark

- Store managed Brand marks in the local provider and persist only their keys.
- Serve Brand marks through the application/public asset surface.
- Preserve external safe URLs, replacement/removal behavior, authorization,
  audit, and the existing PNG policy.

### Phase 4 — private application assets

- Keep MOM reads authenticated/authorized through application endpoints.
- Activate future StudioFlow file consumers only through their own approved
  work orders with explicit policy, retention, and lifecycle decisions.

### Phase 5 — optional cloud deployment profile

- Revisit the parked Supabase adapter only if a future online deployment is
  explicitly approved. It must remain behind the same ObjectStorage boundary.

## Acceptance criteria for PF-1

- A local deployment can upload, replace, remove, and publicly render a Brand
  mark without authentication at read time.
- A local authenticated deployment can read MOM through its authorized endpoint;
  anonymous requests and direct static requests to private bytes fail.
- Moving the configured storage root to another PC/disk does not change stored
  keys or require a domain-data rewrite.
- Invalid, oversized, malformed, unauthorized, unavailable-root, traversal, and
  cleanup-failure cases produce safe behavior and operational evidence.
- Unit/integration tests, typecheck, lint, boundary, legacy-runtime, build, and
  local browser workflow evidence are recorded. Supabase provisioning is not a
  required check.
