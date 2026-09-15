# Active Plan

Plan ID: SF-R2-LEGACY-MOM
Scope: Port the legacy project MOM (document, sections, notes, photos, print) onto the Foundation
Status: READY — implemented and committed in R8.72
Priority: P1
Owner: Repository owner
Last updated: 2026-09-15

## Outcome

Inside a project, the studio writes minutes of meeting and site reports the
way legacy did: a MOM opens as "SITE INSPECTION REPORT" dated today and
prepared by the signed-in person, with one section. Each section has up to
two cropped/annotated photos (or is text-only), an ordered list of notes with
a list style, and can be reordered or removed. The MOM prints on A4 without
the app shell, and can be deleted with confirmation.

## Context and Evidence

- Authority: `docs/apps/studioflow/STUDIOFLOW-REWORK-CONTRACT.md` §10 (plus
  §3 permissions, §4.4 archive read-only, §12 centralization, §13 UI).
- Legacy evidence (`c4b0c466`, committed files only):
  `src/extensions/mom/{validations.ts, actions/mom-actions.ts,
  services/mom-service.ts, components/mom-document-list.tsx,
  components/mom-editor.tsx, components/mom-print-view.tsx}`,
  `src/app/(dashboard)/projects/[id]/mom/**`, `prisma/schema.prisma`
  (`ProjectMomDocument`, `ProjectMomItem`, `ProjectMomPoint`,
  `ProjectMomImage`, `MomListStyle`, `MomPointStyle`).
- Depends on R8.71 (SF-R1) being committed.

## Locked Decisions

- **Schema:** additive migration `20260915120000_sf_r2_mom` with
  `sf_mom_document` (project FK cascade, DATE `meeting_date`),
  `sf_mom_item`, `sf_mom_point`, `sf_mom_image` (`slot` 0/1 unique per item,
  `storage_key` unique, CHECKs). No change to other schemas.
- **Service:** `src/apps/studioflow/mom/service.ts` composed as
  `studioFlow.mom`; `StudioFlowPorts` gains `storage: ObjectStorage`
  (runtime passes the platform `objectStorage`). Behavior and notes per
  contract §10 implementation notes.
- **Images:** browser preparation through UI Engine `ImageWorkspace`
  (4:3, JPEG ≤ 1600 px); upload via a multipart server action; policy (type,
  size, magic bytes, key prefix `studioflow/mom/<projectId>`) in the service;
  signed read URLs through the existing private asset route.
- **Print:** UI Engine §13 activated (`DocumentSheet`, `DocumentBlock`,
  `PrintButton`, base print CSS) with the `(document)` route group; content
  and vocabulary stay in the app.
- **Navigation:** project workspace "Records" gets **MOM** (with count)
  above History. No global nav entry.

## Boundaries and Non-goals

Product Schedule (SF-R3), issue/supersede/approval states, MOM templates,
sharing with clients, server-side PDF rendering, legacy data import, photo
retention policy beyond delete-on-remove, push/PR/deploy.

## Acceptance Criteria

- Integration tests prove legacy defaults, header validation and audit,
  section/note ordering and the one-note rule, the two-photo limit with slot
  normalization, replace/swap/remove with storage cleanup, scope isolation,
  `mom.manage` denial, and archived-project read-only with no orphan objects.
- Unit tests cover note markers and reorder helpers.
- Browser: create → header → notes (reorder) → photo → text-only section →
  print (toolbar hidden in print) → delete; 375 px without horizontal
  overflow; a user without `mom.manage` sees a read-only MOM.

## Verification

`npm test`, typecheck, lint, `check:boundaries`, `check:legacy-runtime`,
`next build`, `npx prisma migrate deploy` on the disposable test DB and the
kantor rebuild DB, `npx prisma migrate diff … --exit-code`. Owner acceptance
at the end of wave 1.
