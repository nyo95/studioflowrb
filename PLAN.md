# Active Plan

Plan ID: WO-MD-FINDABILITY-01
Scope: Master Data — presentation only. Make Brands, Suppliers, SKUs and Pricing (material, material + labor, labor only) quick to search, filter and compare, so a contractor can find a supplier, a brand and a price in a few clicks. Screens, filters, columns, sorting and links; NO change to business rules, data meaning, schema, permissions, prices, validation, actions or audit.
Target revision: R8.261
Status: COMPLETE (R8.257 and R8.259 by the Executor; finished by the Lead in R8.261 after the owner asked the Lead to take over; browser acceptance passed, see the acceptance backlog)
Priority: P2
Owner: owner (Product Owner). Review by the Lead on 2026-09-30 as a head-of-interior-contractor user; the owner approved a thorough improvement, assigned it to the Executor (UI included, by the owner's explicit lane assignment for this plan), and confirmed it is **presentation only, no business-contract change** ("hanya tampilan yang disempurnakan").
Last updated: 2026-09-30

## Correction pass 2 (review of R8.259 by the Lead)

**Verdict: CORRECTION REQUIRED.** Scope is still clean (screens plus one pure helper file; no schema, action, permission or audit change) and these are done and accepted from R8.257/R8.259: status filter (default Active) on Brands, Suppliers, SKUs; Brands category/supplier filters, "Supplied by", "Links"; Suppliers brand, capability and product-category filters, "Brands" column, address line, clear button with count, tel/WhatsApp links, price breakdown line; SKU "Has price" and supplier filters and the per-currency-and-unit "from <amount> / <unit>" summary; Pricing supplier, brand and work-category filters, brand in search, extra sort keys in the sort function.

**Defects and gaps found in R8.259 (verified in the code):**

1. **A control that does nothing.** The Pricing "Group by item" checkbox only sets a state flag; nothing reads it. `groupLowestRows` is imported into `pricing-directory.tsx` and never called; no "Lowest" badge is rendered anywhere. Shipping a dead control is a defect.
2. The new Pricing sort keys (Updated, Category, Brand) have no column header wired to them, so they cannot be used.
3. Pricing columns from decision 6 are missing: Material has no Brand, Category, Size or supplier contact; the work tables have no supplier contact.
4. Pricing tab labels still show the unfiltered total.
5. Decision 2 (one shared filter bar with Clear filters and "N of M", same order everywhere) is not built; only Suppliers has a clear button and count. Brands, SKUs and Pricing lack them.
6. Tests do not cover the grouping/ordering that the "Group by item" view needs.

**What to do (finish all of it in one revision, R8.261):**

- Wire "Group by item" (Material: group by SKU; Material + Labor and Labor: group by name + category): groups ordered by item name, rows inside a group ordered by price ascending using decimal-safe comparison (`compareDecimals`, not `Number`), a group header line naming the item, and the "Lowest" badge from `groupLowestRows` on the cheapest active row(s) under the plan's rules (two or more active prices, one currency and one unit only, otherwise no badge; archived rows never badged). Put the grouping/ordering in a pure, tested helper (for example `groupPriceRows`) and use it from the screen.
- Add clickable sort headers for Updated, Category (all tabs) and Brand (Material).
- Add the missing Pricing columns (Material: Brand, Category, Size, supplier contact with phone links; work tables: supplier contact with phone links) using the existing phone helpers. Extra read data may be added only under decision 8(d).
- Tab labels show the filtered count, with the unfiltered total in a tooltip.
- Build the shared filter bar once (Clear filters, "N of M", fixed control order: Status first) and use it on Brands, Suppliers, SKUs and Pricing; remove the per-screen duplicates.
- Tests: grouping/ordering (single price, ties, mixed currency, mixed unit, archived), badge rules, filter-bar clear behavior where testable as a pure function.
- **Report format (mandatory).** The final report must contain a table with one row per item above and per decision 1–8 of this plan, each marked DONE or NOT DONE with the file and function that proves it. "Limitations" prose is not a substitute; anything NOT DONE is a correction, not a footnote. No control may ship without changing what the list shows.

Keep every hard constraint below.

## Outcome

On the four Master Data lists a person can answer, without leaving the list: "who sells brand X and whom do I call", "which suppliers carry material Y or do labor Z", and "what is the cheapest price for this item and from whom". Archived records stop mixing with active ones. Every list has a filter bar that behaves the same way.

## Hard constraint (read first)

This is a **display** work order. Do not change: schema or migrations, permission ids, service commands and their validation, price/SKU/brand/supplier rules, deletion and archive behavior, audit, action inputs, import/export files, other apps. Existing server actions and services are called exactly as today. The only backend touch allowed is **additive, read-only fields on the existing list reads** when a column needs data that already exists in the database (listed below); those additions must not alter existing fields, filters, ordering, permission checks or performance characteristics materially (batch selects, no per-row queries). If a wanted column would need a rule change or a new command, do not build it: note it in `docs/BACKLOG.md` as `[PLANNED]` and continue.

## Context and Evidence (Lead review, 2026-09-30, live app + code)

- Brands (`masterdata/brands/brand-directory.tsx`): only a search box; columns Brand, Categories, Hashtags, Owner, Suppliers (a count), Resources (a count), SKUs, Updated. The Suppliers count reads 0 for brands whose owner is the seller; supplier names are not shown; links are only counted.
- Suppliers (`vendors/vendor-directory.tsx`): filters only supplier type and supplier category; no brand or capability (material/labor) filter although the service already accepts `brandId`, `canSupplyMaterial`, `canSupplyLabor`; search misses brand names, address and notes; no "brands carried" column; the Categories column shows supplier categories and (R8.255) read-only "from brands" product categories; phone numbers are plain text.
- SKUs (`skus/sku-directory.tsx`): filters brand and product category; columns SKU & Code, Brand & Categories, Units, Prices.
- Pricing (`pricing/pricing-directory.tsx`): one search box and a status select shared by three tabs; the material search matches only SKU name/code and supplier name; the material table has SKU, Supplier, Price, Unit, Updated (no brand, category, size, contact); work tables have Name, Category, Supplier, Price, Unit, Updated; sort only by name, supplier, price; tab counts ignore search/status; no comparison across suppliers.
- Brand, Supplier and SKU pages load archived rows (\`includeArchived: true\`) and show them mixed with active ones (only a small red marker differs). Pricing already has an Active/Archived/All select.
- Contact-phone helpers: \`masterdata/contact-phones.tsx\` (\`contactPhoneList\`, \`phoneSummary\`).
- The dev database currently holds no prices, no SKUs; use the existing import workbook/template (R8.238) or the screens to create fixtures in a **disposable rebuild-only** database for tests; the Lead will load sample rows in the dev database for browser acceptance.

## Locked Decisions

1. **Status filter on Brands, Suppliers, SKUs**: Active (default) | Archived | All, same wording and control as Pricing. Pricing keeps its own select (same component/wording). Counts and pagination follow the filter. Archived rows keep their current look in "All".
2. **One shared filter bar pattern** across the four screens: search box, then filter controls in a fixed order (Status first, then domain filters), a visible "Clear filters" when any filter is set, and the result count ("12 of 40"). Reuse UI Engine \`TableToolbar\`, \`SearchField\`, \`Select\`, \`Combobox\`; build the bar once as a small shared component in the Master Data screens folder (or extend UI Engine once if a generic gap is proven; never duplicate per screen). Filter state is client-side, as today; no URL persistence in this plan.
3. **Brands.** Filters: Status, Product category, Supplier (matches the owner or any linked supplier). Columns: rename "Suppliers" to **"Supplied by"** and show names (owner first, marked "owner" in a tooltip, then linked suppliers, up to 2 then "+N"); keep it sortable by the existing count semantics; rename "Resources" to **"Links"** and show the link kinds as small clickable labels (Website, Catalog … opening the stored URL in a new tab with \`rel="noopener noreferrer"\`, using the URL safety already applied on save; a brand with no links shows "—"). Search also matches supplier/owner names.
4. **Suppliers.** Filters: Status, Supplier type, Supplier category, **Product category (from brands)**, **Brand** (Combobox over brands the supplier carries or owns), **Capability** (Any | Material | Labor, from the supplier types' can-supply flags, same meaning as the existing badges). New column **"Brands"**: names (first 3, then "+N"), sortable by the existing count. The supplier name cell gets a secondary line with the first line of the address when present. Search also matches brand names, address, notes and contact phone digits. Contact phones become links: \`tel:\` always, plus a WhatsApp link (\`https://wa.me/<digits>\`, a leading 0 replaced by 62 for Indonesian numbers) only when the number normalizes to 8–15 digits; otherwise plain text. The "Prices" column keeps the total and adds a small breakdown ("M 3 · M+L 1 · L 0") in its tooltip.
5. **SKUs.** Filters: Status, Brand, Product category, **Has price** (Any | With price | No price), **Supplier** (has an active price from that supplier). Search also matches brand name, category names and notes. The Prices column shows the count and, when there are prices, the lowest active price per currency ("from Rp 45.000 / m2"); the existing display of the row's first price stays available in the row menu/expansion if it exists today (do not remove information; move it, do not delete it).
6. **Pricing.** Filters (all tabs): Status, **Supplier**. Material tab adds **Brand** and **Product category** (from the SKU); work tabs add **Category** (their own work category). Search matches SKU name/code, brand, category, supplier and, on work tabs, name. Material table columns: SKU (name + code), **Brand**, **Category**, **Size** (the SKU's dimension text when set), Supplier (with phone links per decision 4, first contact), Price (amount + currency), Unit, Updated. Work tables: Name, Category, Supplier (with phone), Price, Unit, Updated. Sorting gains **Updated** and **Category** (and Brand on Material). Tab labels show the filtered count, with the unfiltered total only in a tooltip. **Compare view:** a "Group by item" switch (default off) groups rows by item (material: SKU; work: name + category) and orders each group by price ascending; within a group, rows with the same currency and unit as the cheapest get a **"Lowest"** badge on the cheapest active row when the group has at least two active prices (never compare across currencies or units; a group with mixed currencies shows no badge). No price is computed or converted; this is ordering and labeling of existing values only.
7. **Consistency and copy.** Plain English labels; empty states say whether a filter is hiding results ("No brands match these filters — Clear filters"); horizontal-scroll tables keep the first column sticky where the UI Engine table supports it.
8. **Read-only additions allowed (no other backend touch).** (a) \`listBrands\`: the owner and linked supplier names, and the link kinds and URLs, per brand (fields it already reads or can read in the same query). (b) \`listSkus\`: active price amounts, currencies, units and supplier ids per SKU for the summary/filters. (c) \`listVendors\`: address is already returned; nothing else needed beyond R8.255. (d) Pricing page reads: SKU brand id/name, SKU product categories and dimension text on material prices; the first contact and its phones on each supplier reference. Each addition must keep permission checks and existing result fields byte-compatible for current callers (existing tests stay green).

## Boundaries and Non-goals

- No schema/migration, no new permission, no new server action, no write path change, no rule or validation change, no import/export change, no other app.
- No unified cross-tab "price search" page and no saved views/URL-persisted filters in this plan (candidates for a later plan).
- No currency conversion, no averaging, no price recommendation.
- Do not touch legacy or any legacy database.

## Acceptance Criteria

- Each of the four screens shows the filters and columns above and behaves per the decisions; every filter combines with search and with the others (logical AND); "Clear filters" resets all; counts match what is listed.
- Status defaults to Active on Brands, Suppliers and SKUs; archived rows appear only under Archived/All; Pricing unchanged in behavior.
- Supplier "Brand" filter lists exactly the brands the supplier carries or owns; "Capability: Labor" shows only suppliers with a labor-capable type; product-category filter uses active categories of the supplier's brands (same rule as R8.255).
- Pricing: filtering by supplier/brand/category and searching by brand or category find the expected rows; "Group by item" orders each group by price ascending and marks "Lowest" only per the rule (two or more active prices, same currency and unit, mixed currency = no badge); totals in tab labels follow the filters.
- Phone links: a normal Indonesian number produces \`tel:\` and a WhatsApp link with 62; a malformed number produces neither link.
- Existing Master Data tests pass unchanged (contracts intact); new pure-function tests cover: filter combination, status filter, "supplied by" composition, brand-category derivation, lowest-price grouping (edge cases: single price, ties, mixed currency/unit, archived rows), phone normalization.
- No change to any server action signature, service command, permission, schema or audit event (state this in the changelog with the evidence that \`git diff\` touches only read selects and screens).

## Verification

Executor: extract the filter/group/normalization logic into pure, unit-tested helpers (not buried in JSX); \`npm test\`, \`npx tsc --noEmit\`, \`npm run check\`, eslint on the touched folders; if the owner's dev server is running, do not run \`npm run build\` (report it as not run). The Lead performs browser acceptance afterwards with sample data; browser scenarios are added to the acceptance backlog by the Executor for: each screen's filters, the archived default, phone links, "Group by item".

## Reviewer Acceptance

Lead, in the browser with the dev database after loading sample suppliers, brands, SKUs and prices (material, material + labor, labor): run the three contractor questions end to end; check the status defaults, every filter, sorting, the "Lowest" badge, phone links, empty states and narrow-width behavior.

## Regression Risks and Recovery

- Client-side filtering over full lists is unchanged in cost; if a list is large the Executor must still keep render time reasonable (memoize derived data).
- The main risk is accidental business change: any diff outside screens, pure helpers and read selects is a defect. Recovery: revert the revision; nothing persisted changes.

## Executor Prompt

You are the Executor. Location: kantor. This plan is presentation-only and the owner has assigned the UI work to you for this plan. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, `DESIGN.md` (typography: sans for operational UI; serif only for large display) and this `PLAN.md`, then implement the entire READY outcome and nothing beyond it. Inspect current repository evidence, preserve unrelated owner work, keep every business rule, action, permission, schema and audit behavior exactly as it is, run the required checks, check test results before committing (never commit with a failing test), update `CHANGELOG.md` (next revision R8.261), and create the target local revision commit. Stop only for a material locked-decision conflict or unsafe boundary, using the BLOCKED / CONFLICT report; otherwise finish the coherent outcome and report the commit, checks, limitations, and remaining unrelated dirty files.
