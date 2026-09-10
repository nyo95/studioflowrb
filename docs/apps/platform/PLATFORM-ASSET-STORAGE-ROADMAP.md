# Platform Asset Storage Roadmap

## Status

**PARTIALLY ACTIVATED in R7.52.** The shared Core port, fake seam, UI Engine
ImageWorkspace, MOM consumer, and server-only Supabase adapter are implemented.
The provider bucket and local/production credentials are not provisioned.

## Objective

Make production-safe image upload available through a reusable platform
capability. The first activated consumer is StudioFlow MOM in R7.52; the
platform Brand mark remains deferred until its own work order. The StudioFlow
decision gates and exclusions are recorded in [`STUDIOFLOW-LEGACY-AUDIT-ROADMAP.md`](../studioflow/STUDIOFLOW-LEGACY-AUDIT-ROADMAP.md).

The production runtime is Vercel and the application database is Supabase
PostgreSQL. Runtime filesystem storage is not durable on Vercel and must never
be used as an upload destination.

## Evidence and classification

Legacy evidence was inspected read-only at:

- repository: `D:/Misc/ProjectsHUB/studioflow`
- committed reference: `5fc605e304a12db6b5efe0a2c0271a2d9415b2da`
- relevant implementation: `src/components/ui/optimized-uploader.tsx`

| Observed legacy behavior | Classification | Rebuild destination |
| --- | --- | --- |
| Client-side crop plus `browser-image-compression`, using a 1200 px maximum dimension and 0.5 MB target | **MERGE** | Shared UI/image-preparation capability, with each consumer declaring its own policy |
| Server validates, persists, and reports image operations | **KEEP** | Platform Core storage port and infrastructure adapter |
| Writing public files under `public/uploads` | **PURGE** | Replace with Supabase Storage objects |
| A generic upload API which accepts caller-controlled folders and paths | **PURGE** | Fixed, server-owned object-key constructors; no client-selected storage path |

The legacy working tree was dirty when inspected. Only the committed reference
above is evidence; no working-tree legacy file is a source of behavior.

## Locked design decisions

1. **Storage provider.** Use a Supabase Storage bucket named
   `platform-assets`. Supabase PostgreSQL stores metadata/URLs only; it does
   not store image bytes.
2. **Visibility.** Brand marks are public presentation assets because they are
   displayed before sign-in. The bucket/object policy must permit anonymous
   read only for approved public asset paths. Write, update, list, and delete
   remain server-only.
3. **Credentials.** Vercel holds Supabase URL and service-role credentials as
   Production secrets. Those credentials never reach the browser, source tree,
   client bundles, action responses, audit metadata, or logs.
4. **Shared boundary.** Platform Core owns a domain-neutral storage port and
   opaque object references; the Supabase adapter remains infrastructure code.
   UI Engine owns file selection, preview, crop, and compression interaction.
   General Settings owns the Brand mark policy and authorization.
5. **Keys.** The server generates non-guessable fixed-prefix keys such as
   `brand-marks/<UUID>.png`. The client supplies neither a bucket nor an
   object path.
6. **Brand-mark policy.** Retain the current consumer rule: PNG only, valid
   PNG structure, non-empty, at most 2 MB after preparation. The first UI
   implementation may crop and optimize in the browser but server validation
   remains authoritative.
7. **Replacement and cleanup.** Upload the new object first, persist the new
   reference, then best-effort delete the previous object. If persistence
   fails, delete the newly uploaded object before returning a safe error.
8. **No speculative StudioFlow media.** This roadmap creates no StudioFlow
   routes, schemas, tables, permissions, or media policies. Future consumers
   must declare their allowed formats, dimensions, retention, access model,
   and lifecycle separately.

## Delivery sequence

### Phase 1 — platform contract and test seam (complete in R7.52)

- Add the storage port, object-reference model, and a fake adapter for unit
  tests.
- Add UI Engine image-preparation interaction based on the legacy pattern,
  without copying its legacy styles or upload routing.
- Keep policy out of the shared layer: format, byte size, aspect ratio, and
  ownership are supplied by the consumer.
- Add tests for size/type/signature checks, key construction, cleanup, and
  failures that never expose provider errors.

### Phase 2 — Supabase Storage infrastructure (adapter complete; provisioning open)

- Create `platform-assets` with public-read access limited to its public asset
  paths and no anonymous write/list/delete access.
- Add the server-only Supabase adapter and Production Vercel secrets.
- Verify no service-role secret is included in browser JavaScript or surfaced
  through an error response.

### Phase 3 — General Settings Brand mark

- Replace filesystem writes in `saveBrandMarkPng` with the shared storage
  port.
- Use the shared preparation UI in General Settings while retaining the
  General Settings permission check and PNG policy.
- Show preview, replacement, validation, pending, safe-error, and removal
  states; preserve the existing safe HTTP(S)/site-relative URL validation for
  stored references.
- Verify upload, replacement, removal, sign-in branding, app-shell branding,
  and a Vercel production deployment.

### Phase 4 — operate and enable future consumers

- Document object ownership, cleanup/reconciliation, quota monitoring, and
  incident handling.
- Activate StudioFlow media only through an owner-approved StudioFlow work
  order that consumes this port and provides its own policy. No legacy upload
  endpoint or local directory is reused.

## Acceptance criteria for the first executable work order

- A Platform Owner can upload, replace, and remove a valid PNG Brand mark in
  production.
- The object survives redeployments and appears on the login page and app
  shell.
- Invalid, oversized, malformed, unauthorized, unavailable-storage, and
  cleanup-failure cases produce safe, actionable UI states without leaking
  provider secrets or raw errors.
- Vercel runtime performs no filesystem writes for uploaded assets.
- Browser, unit/integration, typecheck, lint, boundary, build, and production
  verification are recorded. Any unavailable mandatory check is reported as a
  limitation, not a pass.
