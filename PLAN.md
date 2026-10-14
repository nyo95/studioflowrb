# Active Plan

Plan ID: WO-MD-PRICE-BRAND-01 (create a Brand from the New price dialog)
Scope: one small change, one local commit
Module(s): masterdata only
Target revision: Executor **R9.51** on `main` (the Lead used R9.50 for this plan)
Status: DONE — Executor R9.51 (61cdaea), Lead review PASS R9.53
Baseline: `main` at the R9.50 plan commit; working tree clean except the owner's untracked `test/` (do not touch or stage it)

## Why

Owner 2026-10-14 (screenshot of Master Data → Pricing → New price → Material, Brand picker):
"dari price bisa add brand (create brand dari price tanpa perlu pindah halaman)".
Today the Brand picker in the bulk Material entry only filters; a Brand that does
not exist yet forces the user to leave the dialog, go to Brands, create it, and
start the price entry again. SKU, Supplier and Category are already creatable
from the same dialog; Brand is the gap (inline-CRUD parity rule).

## Locked decisions

1. **Where:** the Brand `CreatableSearch` above the Items table in the bulk
   Material entry (`src/app/(platform)/masterdata/pricing/pricing-directory.tsx`,
   `materialTable`, around line 666). Same picker serves both "Material" and
   "Material + labor" only if that picker is the same component instance; do not
   add Brand pickers anywhere else.
2. **Who:** offered only when `refs.canManageBrands` is true (already passed from
   `page.tsx`); otherwise the picker stays filter-only. The server still enforces
   `brandManage` through `masterDataService.createBrand`.
3. **What gets created:** a Brand with **name only** — no owner supplier,
   categories, suppliers, contacts, links or hashtags. The user completes it on the
   Brands page later if needed. Supplier links keep being added by the existing
   save path ("This supplier will be added as a supplier of … when you save").
4. **After create:** the new Brand appears in the picker options immediately (use
   the existing `useOptionOverlay(refs.brands)` and its `upsertOverlayOption`) and
   becomes the selected filter, so "New SKU" rows in the table get this Brand
   exactly as they do for an existing Brand today.
5. **Label shown:** the name the service stored (the service title-cases via
   `requiredTitleName`). Return it from the action (`{ brandId, name }`) rather than
   echoing the typed text.
6. **Copy:** `createLabel={(name) => \`Create brand “${name}”\`}`. Errors show
   under the picker with the existing `InlineError` (same as the category picker);
   the picker is `disabled` while the create is pending. Duplicate name → the
   service's existing safe message (mapWriteError), nothing new.
7. **No schema, no migration, no new dependency, no new shared component.**

## Implementation

- `src/app/(platform)/masterdata/pricing/actions.ts`: add
  `createPricingBrandQuickAction(formData: FormData): Promise<ActionResult<{ brandId: string; name: string }>>`
  following `createPricingProductCategoryQuickAction`: zod `name` 1–64 (matches
  `BrandInputSchema`), `context()`, `masterDataService.createBrand({ ...ctx, name })`,
  read back the stored name (from the service result if you extend its return with
  `name`, or a minimal read — pick the smaller change), then `refreshPricing()` and
  revalidate `/masterdata/brands`, `/masterdata/skus`, `/masterdata`.
- `pricing-directory.tsx`: take `upsertOverlayOption` from the brand overlay, add a
  `createBrand` handler mirroring `createProductCategory` (pending + error state),
  wire `onCreate`, `createLabel`, `disabled` on the Brand picker, set
  `materialBrandFilter` to the new id, show the error.
- Tests: extend `src/app/(platform)/masterdata/pricing/actions.test.ts` (or the
  masterdata integration test, whichever already covers the quick actions) for:
  creates a Brand with only a name and returns the stored name; rejected without
  `brandManage`; empty name rejected.

## Executor verification

typecheck, eslint on touched files, `npm test` (whole suite; report the count).
Browser walk not required from the Executor.

## Reviewer acceptance (Lead, after R9.51)

Pricing → New price → Material: type a new Brand name → "Create brand …" → it is
selected; add a New SKU row and save → the SKU carries that Brand; the Brand shows
on the Brands page with no owner. A user without brand-manage sees no create option.

## Executor prompt

```text
You are the BACKEND EXECUTOR (docs/agent/EXECUTOR.md). Implement PLAN.md
WO-MD-PRICE-BRAND-01 exactly, as revision R9.51 on main: a name-only "Create brand"
in the Brand picker of Pricing → New price (Material), via a new
createPricingBrandQuickAction, gated by canManageBrands, the new Brand selected
after create. masterdata only; no schema/migration/dependency. Leave the owner's
untracked test/ alone. Run typecheck, eslint on touched files, npm test; add the
R9.51 CHANGELOG entry; one local commit; no push. Stop with BLOCKED / CONFLICT if
the plan contradicts the repository. End with the Planner/Reviewer prompt (outcome,
commit, checks, limitations, dirty files).
```
