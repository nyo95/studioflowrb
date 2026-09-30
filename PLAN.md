# Active Plan

Plan ID: WO-SF-FILELIFE-01
Scope: StudioFlow deliverables — large-file upload (streaming), Final flag, "keep the 2 newest working versions" rule, automatic expiry of non-final files with a warning, plus the storage-port streaming and free-space guard they need. Backend and minimal wiring only; the Lead builds the deliverables screen (final toggle, expiry chips, upload progress) and the image editor afterwards.
Target revision: R8.240
Status: READY
Priority: P2
Owner: owner (Product Owner). Direction given 2026-09-30: files may exceed 100 MB but erase themselves unless marked final; keep only the last 2 files; chat and working/internal files vanish after a while. The numbers below are Lead defaults from the recommendation put to the owner and are open to the owner's veto.
Last updated: 2026-09-30

## Outcome

A StudioFlow team member can upload a deliverable of up to 500 MB (default) without the app loading the whole file into memory. Each deliverable "slot" (one phase + one file name) keeps
its **final** file until the project's archive retention, plus at most the **2 newest non-final versions**; older non-final versions are removed at upload time. A non-final file that
nobody touches disappears by itself after 30 days; the uploader is notified 7 days before and can mark it final or extend it. Chat attachments keep their existing 30-minute expiry.

## Context and Evidence

- Deliverables today: `SfDeliverable` (`prisma/schema/studioflow.prisma`), `uploadDeliverable` / `deleteDeliverable` / `listDeliverables` in `src/apps/studioflow/phases/service.ts` (25 MB, whole body as `Uint8Array`, allowed types pdf/png/jpg/webp/zip), server action `uploadDeliverableAction` in `src/app/(platform)/studioflow/actions.ts`, panel `phases/[phaseId]/deliverables-panel.tsx`. Every upload is a new row; nothing is pruned except project-archive sweeps.
- Storage port: `src/platform/core/storage/index.ts` (`put(body: Uint8Array)`, `remove`, `createSignedReadUrl`), fake seam, `LocalFilesystemStorage` in `src/platform/infrastructure/storage/filesystem.ts`, parked Supabase adapter, private read route `src/app/api/platform/assets/private/route.ts`, signing in `asset-signing.ts`. Server actions are capped at 52 MB (`next.config.ts`).
- Lifecycle machinery to REUSE: `src/apps/studioflow/asset-sweep.ts` + `asset-cleanup.ts` (archive retention, daily boot scheduler), the notification retention scheduler pattern (`core/notifications/retention-sweep.ts`), messenger attachment TTL (`core/messenger`), `createNotificationWriter`.
- Roadmap: `docs/apps/platform/PLATFORM-ASSET-STORAGE-ROADMAP.md` (phase 4: future file consumers need their own approved policy; this plan is that policy for deliverables).

## Locked Decisions

- **Slot** = (`phase_id`, lowercase-trimmed `name`). A new upload with the same slot name is a new **version** of that slot; a different name is a different slot.
- **Final** is an explicit per-file flag (`is_final`, `finalized_at`, `finalized_by_id`). Only a user who may upload to that phase (same gate as upload) or holds `studioflow.project.manage` may set or clear it. At most ONE final per slot (setting a new final clears the previous flag; the previous file then behaves as a normal version). A final file never expires and is never pruned by the 2-version rule.
- **Keep rule:** after each successful upload, non-final versions of that slot beyond the **2 newest** (by created_at, id) are deleted (row + stored object). The final file does not count towards the 2.
- **Expiry:** each non-final file has `expires_at = created_at + 30 days`; "extend" sets it to now + 30 days. Marking final clears `expires_at`. A daily sweep (same boot-scheduler pattern: enabled in production or with an env switch, off in development) deletes expired non-final files. A warning notification goes to the uploader when `expires_at` is within 7 days and none was sent for this expiry (`expiry_warned_at`, reset on extend). Notification text is plain and names the file, phase, project and date.
- **Limits:** per-file maximum 500 MB, overridable by environment `STUDIOFLOW_DELIVERABLE_MAX_BYTES` (positive integer bytes; invalid falls back to the default). Allowed types unchanged (pdf, png, jpg, webp, zip).
- **Free-space guard:** the local adapter refuses a write that would leave less than 2 GB free on the storage volume (`fs.statfs`), with the plain error code `storage.no-space` ("The storage disk is nearly full."). Reserve overridable by env `STORAGE_MIN_FREE_BYTES`.
- **Upload path:** files above the server-action limit cannot use `uploadDeliverableAction`. Add an authenticated route handler `PUT` under the StudioFlow app (e.g. `src/app/api/studioflow/deliverables/route.ts`) that streams the request body straight to storage; metadata (project, phase, file name, content type) travels in headers/query; the request must carry `Content-Length` and is rejected above the limit before writing, and again if the stream exceeds it. It calls a service command (permissions, project state, revision rule, audit exactly as `uploadDeliverable`) and never touches Prisma itself. The existing server action stays for small files and shares the same service rules.
- **Streaming port:** extend the storage port with `putStream({ key, contentType, stream, maxBytes })` returning the stored object with the counted byte size (removes a partial file on failure or overrun). Implement it in the local adapter and the fake; the parked Supabase adapter may buffer. Signed reads must keep working for large files (streamed response, correct type, no whole-file buffering).
- **No resumable/chunked upload** in this plan (plain streamed PUT only).
- **Migration:** additive columns only (`is_final` default false, `finalized_at`, `finalized_by_id`, `expires_at`, `expiry_warned_at`, `slot_key`). Existing rows: `slot_key` computed from name; `expires_at` = migration time + 30 days (nothing vanishes on day one); no row is auto-marked final. Apply to both the dev and test databases.
- **Other apps:** no behavior change to messenger, Master Data, BQ. Project archive retention keeps working.

## Business Rules and Architecture Constraints

- App-owned: slot/final/keep/expiry policy stays in StudioFlow; the platform gets only the domain-neutral pieces (streaming put, free-space guard). Do not create a platform file registry table in this plan.
- Deletion order: clear the database reference first, then remove the stored object; a removal failure is swallowed with a sanitized operational message. An orphan sweep for stored files with no row is out of scope.
- Sweep and prune are idempotent and batch-limited like `asset-sweep.ts`.
- Audit: upload, mark final, clear final, extend, and expiry-delete each write an audit event; automatic deletions use the SYSTEM actor as the existing sweep does.
- Permissions: reuse existing StudioFlow permissions and PIC access rules (R8.220/R8.221); no new permission ids.

## Backend Contract

- Service: `uploadDeliverable` (same signature for small files) plus a streaming counterpart used by the route; `setDeliverableFinal({ projectId, deliverableId, isFinal })`, `extendDeliverableExpiry({ projectId, deliverableId })`, `sweepDeliverableExpiry()` (delete pass + warning pass). `listDeliverables` returns per file: `isFinal`, `expiresAt`, `daysLeft`, `versionNumber` within the slot (newest first), plus the existing fields.
- Actions: `setDeliverableFinalAction`, `extendDeliverableExpiryAction`; the route handler above.
- Storage port: `putStream`; adapter free-space guard; stable error code `storage.no-space`.

## UI Contract

The Executor adds only the minimum wiring so a user can exercise this: the deliverables panel uploads through the route for any file, shows Final / expiry text, and has plain Mark final / Extend buttons. Layout, upload progress, warning chips and copy are the Lead's next revision.

## Boundaries and Non-goals

- No image editor or image compression (Lead, separate revision). No resumable upload. No Master Data / BQ / messenger changes. No cloud adapter work. No storage usage/quota settings page.
- Do not touch legacy or any legacy database. No new dependency expected; if one seems unavoidable, stop and report.

## Acceptance Criteria

- A large file uploads through the route without buffering the whole body (test with a stream and a byte counter; a 20 MB stream against a lowered env limit is enough in CI) and is readable through a signed URL.
- Over-limit (declared and actual), wrong type, no permission, archived project, no active revision, and disk-nearly-full each fail with a plain error and leave no stored object or row behind.
- Keep rule: three non-final uploads to one slot leave the 2 newest; with a final present, final + 2 newest remain; a different name is a separate slot; setting a new final unflags the old one.
- Expiry: a fixture row past `expires_at` is removed by the sweep with its object; a final row and a non-expired row are untouched; a row within 7 days gets exactly one warning notification to the uploader; extend moves `expires_at` and re-arms the warning; marking final clears `expires_at`.
- Migration applies to a database with existing deliverables without data loss (expiry set, nothing final).
- `npm test`, `npx tsc --noEmit`, `npm run check`, eslint on touched folders pass; `npm run build` only if the owner dev server is stopped (otherwise report it as not run).

## Verification

Executor: tests for `putStream` (fake and local adapter, including partial-file cleanup and the free-space guard with an injected free-space function), integration tests for the service rules above, and route-handler tests where the repo has a pattern for them. Record any skipped check as not passed.

## Reviewer Acceptance

Lead after the commit: upload a large file in the browser, mark final, upload versions and confirm the 2-newest rule, and force an expiry with a fixture. Only if user-facing screens change.

## Regression Risks and Recovery

- The migration touches an existing table; it is additive with safe defaults. Recovery: revert the revision; the extra columns are ignored.
- Deletion is the risky verb: every delete path needs a test proving a final file cannot be removed by the keep rule or the sweep.

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, and this `PLAN.md`, then implement the entire READY backend outcome and nothing beyond it. Inspect current repository evidence, preserve unrelated owner work, make sound in-scope implementation decisions, run the required checks, update `CHANGELOG.md` (next revision R8.240), and create the target local revision commit. Stop only for a material locked-decision conflict or unsafe boundary, using the BLOCKED / CONFLICT report; otherwise finish the coherent outcome and report the commit, checks, limitations, and remaining unrelated dirty files.
