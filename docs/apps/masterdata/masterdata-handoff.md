# Master Data Handoff Reference

Status reference: 2026-09-01

This document is a continuation reference for Master Data work in the
StudioFlow rebuild. The approved behavior contracts remain authoritative in
`docs/apps/masterdata/masterdata.md`, `CORE.md`, `DESIGN.md`, and `UI_ENGINE.md`.

## Repository State

- Branch: `main`
- Last local commit: `17261f4`
- Last commit subject: `R3.15 | docs(agent): require environment location verification`
- The latest local commit has not been pushed to GitHub.
- The next local revision is `R3.16`.

The following Pricing files contain owner changes that are not committed yet:

- `src/app/(platform)/masterdata/pricing/actions.ts`
- `src/app/(platform)/masterdata/pricing/page.tsx`
- `src/app/(platform)/masterdata/pricing/pricing-directory.tsx`

Do not reset, checkout, stash, overwrite, or stage these files unless the owner
explicitly directs it.

## Required Environment Verification

At the start of work on another computer, ask the owner to confirm all values
for the current session:

1. Exact local path of the StudioFlow legacy checkout, if read-only reference
   is needed.
2. Exact local path of the StudioFlow rebuild checkout in scope.
3. Rebuild-only PostgreSQL Docker target: container or service, published port,
   database name, and connection target.

Never infer these values from old handoffs, sibling folders, environment
variables, Docker listings, or remembered paths. Legacy is read-only evidence
only. Never access its database, container, files for modification, or runtime.

If legacy evidence is not needed, verify the rebuild checkout and rebuild-only
PostgreSQL target before any database command.

## Implemented Foundation

The following Master Data foundation is already present and should be reviewed
before adding new behavior:

- Prisma schema and migrations for Master Data entities.
- Permission registration and permission-scoped service operations.
- Audited create, update, archive, restore, deletion-request, and deletion-
  approval service workflows.
- Brand, Vendor, SKU, Unit, Category, Pricing, and VendorType route shells or
  directories.
- `Settings > General > Master Data Settings` for governed dictionaries and
  deletion review.
- Rebuild-only test isolation using the `masterdata_test` target when confirmed
  available.

## Remaining Work

### Pricing

- Complete create and edit UI for all approved pricing types.
- Preserve contract validation, permission checks, archive/restore, and
  permanent-deletion-request behavior.
- Ensure Material Price creation does not bypass the approved SKU/domain rules.
- Make success feedback, validation errors, and dialog close behavior
  consistent.

### Settings and Dictionaries

- Verify Unit, Category, VendorType, and deletion review are fully contained in
  the locked `Master Data Settings` tab shell.
- Keep SKU in the Pricing workflow as decided by the owner.
- Complete or correct VendorType CRUD, capability controls, archive, restore,
  deletion request, permission states, and mutation feedback.

### Vendor and Relationships

- Add the owner-only Vendor CreatableSearch/quick-entry flow.
- Review Brand/Vendor link interactions against the approved contract.
- Cover validation, permission, loading, empty, error, and archived states.

### Cross-Module UI Review

Review every Master Data workflow for:

- Search, filters, sorting, pagination, and detail/edit flow.
- Quick entry and unsaved-input handling.
- Destructive confirmations.
- Loading, empty, error, disabled, archived, and permission states.
- Long content and usable information hierarchy.
- Desktop, collapsed rail, and narrow viewport around 390px.
- No horizontal overflow and no browser console errors.

## Recommended Execution Order

1. Verify the current computer paths and rebuild-only PostgreSQL target.
2. Read the approved contracts and inspect the current Pricing and Settings
   implementation, including the uncommitted Pricing files.
3. Finish Pricing and VendorType without changing unrelated owner work.
4. Complete Vendor quick entry and review Brand/Vendor relationships.
5. Perform browser acceptance across desktop and narrow viewport.
6. Run `npm run check`, `npm test`, and `npm run build` against rebuild-only
   resources.
7. Update `CHANGELOG.md`, stage only owned files, inspect the staged diff, and
   create the next local revision commit.

## Completion Criteria

Master Data is complete only when the approved workflows are implemented,
permission and lifecycle behavior is verified, browser acceptance passes at
desktop and narrow viewport, required checks pass, limitations are documented,
and the cohesive change set is committed locally.

Do not push, publish, open a pull request, or alter remote state unless the
owner explicitly authorizes that action.
