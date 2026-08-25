# MASTER DATA FULL BUILD — External OpenCode Implementation Program

Owner: PM/TL
Executor: one external OpenCode coding session
Status: **ACTIVE — UI Engine approved; ready for owner-operated external OpenCode execution**
Program checkpoints: MD-01 through MD-09
Required starting ref: **`masterdata-full-build-start-ui-approved`**

This file is the complete executor prompt. Read it in full before editing. Execute MD-01 through MD-09 sequentially in the same OpenCode session. Each MD checkpoint remains a separate, logically reviewable commit even though the owner starts only one implementation session.

## 0. Objective

Build the complete usable Master Data application defined by locked `MASTER_DATA.md`, including:

- persisted schema, migrations, constraints, and approved MVP seeds;
- Category, Unit, Party, BusinessType, Brand, SKU/material, and pricing workflows;
- permissions and transactional audit persistence;
- usable Master Data UI based on the locked UI Engine;
- whole-schema XLSX import/export;
- Brand Discovery;
- the only legal Master Data public-read surface for StudioFlow/BQ.

Do not implement BQ, broad StudioFlow migration, or any capability outside the locked Master Data contract.

## 1. Required start state

This package is executable only from `masterdata-full-build-start-ui-approved`. Earlier `masterdata-full-build-start*` tags are superseded and must not be used.

1. Checkout `main` at the new PM/TL-issued Master Data start tag.
2. Resolve and record the tag hash:

```powershell
git rev-parse masterdata-full-build-start-ui-approved
git status --short
```

3. The resolved hash must equal the exact starting commit reported by PM/TL.
4. The working tree must be clean. Existing unexpected changes are not yours: STOP and report them.
5. Never start from:
   - any legacy StudioFlow checkout or commit;
   - quarantine branch `codex/quarantine-unapproved-20260823`;
   - the old reproducible baseline if it would discard later approved Foundation/manager commits.

## 2. Mandatory reading and authority

Read in this order:

1. `AGENTS.md`
2. `scripts/work-orders/00-EXTERNAL-EXECUTOR-CONTEXT.md`
3. this entire package
4. `docs/00-SOFTWARE-SSOT.md`
5. `docs/06-DATA-OWNERSHIP.md`
6. `docs/07-ENGINEERING-CONVENTIONS.md`
7. `docs/03-MASTERDATA-PRD.md`
8. `CORE.md`
9. `DESIGN.md`
10. `UI_ENGINE.md`
11. `MASTER_DATA.md`
12. `docs/12-MASTER-DATA-SEED-INVENTORY.md`
13. current `prisma/schema.prisma`
14. relevant Next.js 16 documentation under `node_modules/next/dist/docs/` before writing Next routes/layouts/server actions.

Authority order remains owner instruction → Software SSOT → Data Ownership → Master Data PRD → locked manager contracts → current implemented schema → other docs → legacy evidence.

`MASTER_DATA.md` and the seed inventory are LOCKED. Executor implementation choices may not change their business meaning.

## 3. Legacy evidence policy

The only canonical legacy evidence is:

`https://github.com/nyo95/studioflow/commit/548fbd6bd00ef9fd7d53df66a3561a32fbb56944`

Resolve every legacy file from that immutable snapshot. Do not substitute the current GitHub branch tip or `D:\Projects\studioflow`. A temporary clone/fetch may be used only to read the exact locked commit and must remain outside the rebuild repository. Relevant starting evidence includes:

- `prisma/schema.prisma` Master Data models;
- `src/subapps/master-data/services/**`;
- `src/subapps/master-data/actions/**`;
- `src/subapps/master-data/lib/**` and focused tests;
- `src/subapps/master-data/components/**` for proven workflow evidence, not visual authority;
- `src/extensions/library/services/brand-library-service.ts`;
- `src/subapps/bq/services/master-data-service.ts` for required read intent only;
- `docs/PRD_MASTER_DATA_REDESIGN.md`;
- `docs/PLAN-MASTERDATA-V2.md`;
- `docs/MASTERDATA_UIUX_REVISION.md`;
- `docs/design database masterdata.xlsx` and archived seed/staging evidence.

Use the KEEP/MIGRATE/MERGE/REWRITE/PURGE classifications already locked in `MASTER_DATA.md`. Do not invent or change a classification. Every checkpoint report must state which legacy evidence was used and how its locked classification was applied.

No source file, runtime import, runtime network/file read, database connection, fallback, symlink, build step, or generated artifact may depend on any local or remote legacy repository.

## 4. Program-wide allowed areas

Implementation may change only where required by a checkpoint:

- `prisma/schema.prisma`
- `prisma/migrations/**`
- Prisma seed implementation/config required by MD-01
- `src/apps/masterdata/domain/**`
- `src/apps/masterdata/application/**`
- `src/apps/masterdata/infrastructure/**`
- `src/apps/masterdata/ui/**`
- `src/apps/masterdata/public/**` only in MD-09 or earlier type scaffolding explicitly required by a locked dependency
- `src/app/masterdata/**` and the smallest root routing/navigation integration needed to reach Master Data
- `src/platform/core/audit/**` only for the locked domain-neutral persistence adapter/read support in MD-07
- `src/platform/core/rbac/**` only for the narrow locked `<app>.access` validator correction in MD-07
- focused tests adjacent to the allowed code
- `package.json` and `package-lock.json` only for:
  - deterministic test/seed scripts genuinely required by this package;
  - `exceljs@^4.4.0` in MD-08.
- `docs/08-CURRENT-STATUS.md` only to append factual checkpoint hashes/results; do not rewrite manager decisions.

Do not change `MASTER_DATA.md`, `CORE.md`, `DESIGN.md`, `UI_ENGINE.md`, `docs/00-SOFTWARE-SSOT.md`, `docs/03-MASTERDATA-PRD.md`, `docs/06-DATA-OWNERSHIP.md`, or `docs/12-MASTER-DATA-SEED-INVENTORY.md`. A required contract change is a STOP condition.

## 5. Program-wide locked decisions

The executor must implement these literally:

1. Master Data owns canonical Unit, BusinessType, Party/Supplier/Vendor, Brand, Category, SKU/material, SkuPrice, and WorkPrice data.
2. PRODUCT Category is flat. WORK Category alone may be hierarchical.
3. BrandCategory is explicit staff discovery metadata, never SKU-derived.
4. Brand creation requires at least one live PRODUCT Category.
5. SKU uses one direct nullable PRODUCT `category_id`; ACTIVE requires a live category, canonical base Unit, and exactly one canonical SkuPrice.
6. SkuPrice is `0..1` for DRAFT and exactly one before ACTIVE. It is one current canonical row per SKU, updated in place. There are no temporal price rows, supplier offers, history selectors, preferred/cheapest/latest logic, `is_current`, `valid_from`, or `valid_to`.
7. Audit is SkuPrice/WorkPrice change history. BQ project snapshot is historical project truth.
8. WorkPrice is one current canonical row per code, updated in place, with `MATERIAL_LABOR | LABOR_ONLY`, one amount, required WORK Category, optional eligible vendor, and no SKU/BOM/component/project relation.
9. Party operational roles are only `MATERIAL_SUPPLIER | WORK_VENDOR`. Business nature is editable BusinessType data and never grants eligibility implicitly.
10. Unit and BusinessType are controlled editable dictionaries, not evolving Prisma enums. Their locked seeds are idempotent.
11. All money/decimal values cross application/public/import boundaries as canonical strings.
12. Successful mutation and audit commit in the same transaction. No-op updates emit no audit event.
13. Other apps access Master Data only through `src/apps/masterdata/public`.
14. StudioFlow/BQ never directly query Master Data internals and never implicitly mutate it.
15. BQ reads the singular current price and snapshots it. Master Data does not refresh or write back to BQ.

## 6. Program-wide forbidden behavior

- No generic repository/service/action/CRUD framework.
- No new DI container, event bus, workflow engine, unit-conversion engine, or feature flag system.
- No PRODUCT hierarchy, SkuCategory join table, derived BrandCategory, Brand tags, Party material-category table, or SERVICE SKU.
- No multiple SkuPrice rows per SKU, price comparison/history UI, automatic vendor quote synchronization, or defaulting blank price to zero.
- No WorkPrice→SKU, BOM, component breakdown, material/labor split, generated total, or project reference.
- No `is_active` alongside `deleted_at` for locked soft-delete entities/dictionaries.
- No role matrix, admin bypass, fallback role, route-authority shortcut, or client-side-only authorization.
- No Prisma model/DTO leakage through `masterdata/public`.
- No secrets, contact dumps, price-list links, audit data, or internal notes in Brand Discovery.
- No Excel missing-row deletion, last-write-wins, partial best-effort apply, automatic conflict merge, or implicit dictionary creation.
- No BQ implementation or broad StudioFlow changes.
- No opportunistic cleanup or unrelated dependency upgrades.

## 7. Checkpoint discipline and manager gates

Commit each checkpoint separately using a message beginning with its ID. Never squash MD-01–MD-09 into one opaque commit.

Suggested messages:

```text
MD-01: implement Master Data schema and seeds
MD-02: implement category and unit dictionaries
MD-03: implement party and business types
MD-04: implement brand workflows
MD-05: implement SKU material workflows
MD-06: implement canonical pricing
MD-07: enforce Master Data permissions and audit
MD-08: implement Master Data XLSX round trip
MD-09: implement discovery and public reads
```

Manager review gates:

- Gate 1: stop and report after MD-01 commit.
- Gate 2: after Gate 1 approval, continue in the same OpenCode session; stop and report after MD-06 commit.
- Gate 3: after Gate 2 approval, continue in the same session; stop and report after MD-09 commit.
- Final Gate: PM/TL performs convergence review. Corrections use narrow follow-up instructions in the same session where practical.

The owner does not start nine sessions. Checkpoint commits and gate pauses occur inside one managed OpenCode session.

## 8. Common checkpoint verification

At every MD checkpoint run:

```powershell
npm test
npm run check
npx prisma validate
npx prisma generate
git diff --check
git status --short
```

At Gate 1, Gate 2, Gate 3, and Final Gate also run:

```powershell
npm run build
npm run test:boundaries
npm run test:legacy-runtime
```

Do not add `npm run lint` as a claimed acceptance result unless an approved ESLint flat configuration exists; lint configuration is not part of this program.

For clean-database migration acceptance, use only a disposable database explicitly provided as `MASTERDATA_TEST_DATABASE_URL`. Never reset the owner's normal `DATABASE_URL`:

```powershell
if (-not $env:MASTERDATA_TEST_DATABASE_URL) { throw 'MASTERDATA_TEST_DATABASE_URL is required for clean migration verification.' }
$previousDatabaseUrl = $env:DATABASE_URL
try {
  $env:DATABASE_URL = $env:MASTERDATA_TEST_DATABASE_URL
  npx prisma migrate reset --force
  npx prisma migrate status
  npx prisma validate
  npx prisma generate
} finally {
  $env:DATABASE_URL = $previousDatabaseUrl
}
```

Absence of a disposable database blocks Gate 1 approval; do not point destructive migration commands at another database.

---

## MD-01 — Schema, migrations, invariants, and seeds

### Objective

Implement the complete locked persisted shape and idempotent seed baseline before application/UI work.

### Dependencies

- Required start tag only; no MD checkpoint dependencies.

### Exact scope

- Add full Unit, BusinessType, Party graph, Brand graph, Category/BrandCategory, SKU/SkuMedia, singular SkuPrice, WorkPrice, and platform AuditEvent models/relations/enums.
- Replace current Brand/Sku/WorkPrice stubs.
- Implement all partial/expression indexes and non-Prisma constraints required by `MASTER_DATA.md`.
- Implement owner-approved seeds from `docs/12-MASTER-DATA-SEED-INVENTORY.md`.
- Remove unsupported stub `WorkPrice.sku_id` and `Sku.work_prices`.

### Schema locks

- Unit and BusinessType are tables with immutable globally unique codes and soft deletion.
- `UnitUsage` is the small code-owned enum locked by MD-00.
- PartyType is `ORGANIZATION | INDIVIDUAL`.
- PartyRole is `MATERIAL_SUPPLIER | WORK_VENDOR`.
- BusinessType assignments are many-to-many.
- Category remains one table with PRODUCT/WORK.
- SKU has direct optional PRODUCT category, optional Brand, `DRAFT | ACTIVE | DISCONTINUED`, and Unit relations.
- SkuPrice has unique `sku_id`; optional supplier/source; exact amount/currency/unit; updater metadata; no temporal/current fields.
- WorkPrice has one current row per live code; exact amount/currency/unit; updater metadata; no SKU/project relation.
- AuditEvent implements the locked domain-neutral Core envelope with no entity/actor FKs.
- Soft-delete uniqueness and nullable SKU Brand/code/slug cases are database-enforced.

### Migration requirements

- One reviewable migration chain from the approved pre-Master-Data schema.
- Clean-database reset passes on the disposable database.
- Seeds are idempotent by immutable code/slug and do not overwrite later staff edits accidentally.
- PRODUCT seeds have no parent/path.
- WORK paths are produced consistently with locked rules.
- No legacy business rows or historical prices are silently copied.

### Allowed files

- `prisma/**`
- seed script/config
- focused schema/seed tests under `src/apps/masterdata/infrastructure/**`
- smallest package scripts required to invoke seeds/tests.

### Forbidden

- Application, route, or product UI implementation.
- Legacy business-row migration or unreviewed bulk data copy.
- Temporal price fields, price history, preferred/cheapest-source rules, or multiple current SKU prices.
- SKU-to-WorkPrice or project-to-WorkPrice relations.
- Any entity, relation, enum, field, seed value, or abstraction not locked by MD-00 and its seed inventory.

### Focused acceptance

Create and run:

```powershell
npx tsx --test src/apps/masterdata/infrastructure/schema-contract.test.ts
npx tsx --test src/apps/masterdata/infrastructure/seed-contract.test.ts
```

Tests must prove cardinality/constraints, 43 flat PRODUCT seeds, locked WORK roots/children, locked Unit/BusinessType inventory, idempotency, and forbidden legacy fields/relations.

### Acceptance criteria

- Full locked graph exists with no stub/legacy-only relation.
- All declared database constraints fail the corresponding negative fixture.
- Clean migration plus seed succeeds twice with the exact locked inventory.
- Generated client, schema validation, focused tests, and common checks pass.

### Stop conditions

- Any locked relation cannot be represented without changing MD-00.
- Existing migration state differs from the assumed approved schema.
- Seed evidence conflicts with the locked inventory.
- Clean-database migration cannot be tested safely.

### Gate 1 report

Return MD-01 commit, exact migration names, schema model/index summary, seed counts, focused/global results, clean-database evidence, and stop-condition review. Stop for PM/TL Gate 1 approval.

---

## MD-02 — Category, BrandCategory primitives, and Unit dictionary

### Dependencies

- MD-01 approved.

### Scope

- Category CRUD/lifecycle/search/sort.
- PRODUCT flat enforcement.
- WORK tree create/rename/re-parent with cycle prevention and transactional descendant-path propagation.
- Category delete/restore blockers.
- synonym normalization/deduplication.
- Unit controlled dictionary CRUD/lifecycle and usage-aware selectors.
- BrandCategory domain primitives; Brand integration completes in MD-04.
- usable Category/Unit management routes and UI using locked UI Engine patterns.

### Allowed files

- `src/apps/masterdata/domain/category*`, `unit*`
- matching application/infrastructure/UI areas
- `src/app/masterdata/categories/**`, `src/app/masterdata/settings/units/**`
- focused tests.

### Locked business rules

- PRODUCT never has a parent/path; WORK alone maintains a hierarchy.
- BrandCategory primitives accept PRODUCT only and are explicit.
- Unit codes are immutable controlled data; usage filters do not convert values.

### Migration requirements

- MD-01 already owns the complete persisted shape and seeds. MD-02 adds no schema/migration unless the implemented MD-01 differs from its approved contract; that difference is a STOP condition.

### Forbidden

- PRODUCT parent UI/logic.
- category inference from SKU/free text.
- unit conversion or silent unit creation.
- editing locked codes after creation.

### Focused acceptance

```powershell
npx tsx --test src/apps/masterdata/domain/category-rules.test.ts
npx tsx --test src/apps/masterdata/domain/unit-rules.test.ts
npx tsx --test src/apps/masterdata/application/category-service.test.ts
```

Prove PRODUCT flatness, WORK path/cycle behavior, blockers, synonyms, Unit usage restrictions, permissions hooks, audit inputs, and no duplicate seed creation.

### Acceptance criteria

- Category and Unit routes are usable with permission-aware create/edit/delete/restore flows.
- Every hierarchy/dictionary mutation uses application transaction and audit ports.
- Focused tests and common checks pass without new schema drift.

### Stop conditions

- A WORK path operation cannot remain within one application transaction.
- UI requires a new shared UI Engine primitive/token rather than composition of locked primitives.

Commit MD-02, run common verification, and continue to MD-03 without owner restarting the session.

---

## MD-03 — Party, operational roles, BusinessType, contacts, and links

### Dependencies

- MD-01; may reuse approved MD-02 dictionary patterns.

### Scope

- Party CRUD/soft delete/restore/live uniqueness.
- PartyType, operational PartyRole, controlled BusinessType assignments.
- contacts including optional Brand scope validation port (full Brand relation available after MD-04).
- Party links and locked LinkKind vocabulary.
- material-supplier/work-vendor eligibility queries and write guards.
- delete/role-removal blockers.
- usable Party management UI and quick-entry behavior that never guesses classifications.

### Allowed files

- Party/business-type areas under all Master Data layers
- `src/app/masterdata/parties/**` and relevant settings route
- focused tests.

### Locked business rules

- Party is one identity with nonexclusive operational roles.
- `MATERIAL_SUPPLIER | WORK_VENDOR` drive eligibility; BusinessType is descriptive only.
- PartyType is `ORGANIZATION | INDIVIDUAL`; contacts/links remain owned children.

### Migration requirements

- No new model/enum/index is expected after MD-01. If a locked Party field/relation is missing from MD-01, STOP and report rather than creating an unreviewed follow-on migration.

### Forbidden

- separate Supplier/Vendor/Company tables.
- legacy six-value mixed PartyRole enum.
- BusinessType-based implicit eligibility.
- PartyCategory for materials.

### Focused acceptance

```powershell
npx tsx --test src/apps/masterdata/domain/party-rules.test.ts
npx tsx --test src/apps/masterdata/application/party-service.test.ts
```

Prove multi-role/type behavior, eligibility, live uniqueness, migration aliases, role blockers, brand-scoped contact validation contract, and truthful quick entry.

### Acceptance criteria

- One usable Party UI manages roles, business types, contacts, and links without duplicate entity paths.
- All eligibility/delete/role-removal negative cases fail safely.
- Focused tests and common checks pass.

### Stop conditions

- A legacy Party classification cannot map through the locked seed mapping without a real data decision.
- Contact Brand scoping requires cross-app data or a relation outside Master Data.

Commit MD-03 and continue.

---

## MD-04 — Brand vertical slice

### Dependencies

- MD-02 Category/BrandCategory primitives.
- MD-03 Party.

### Scope

- Brand CRUD/lifecycle/live uniqueness.
- optional owner Party.
- BrandLink, BrandSupplier, explicit BrandCategory.
- creation/restore/final-category/delete blockers.
- material-supplier role enforcement.
- brand-scoped contacts across valid owner/supplier relationships.
- usable brand-grain materials page, detail, quick entry, and relation editors.

### Allowed files

- Brand areas in Master Data layers
- `src/app/masterdata/brands/**`, `src/app/masterdata/materials/**`
- focused tests.

### Locked business rules

- A live Brand always has at least one explicit live PRODUCT BrandCategory.
- BrandSupplier is Brand-level sourcing, not price or SKU availability.
- Brand validity never requires supplier/SKU and Brand tags are absent.

### Migration requirements

- No schema change is expected. A missing Brand/BrandCategory/BrandSupplier/BrandLink constraint means MD-01 is incomplete and requires manager review, not silent migration expansion.

### Forbidden

- Brand tags as discovery authority.
- supplier/SKU requirement for Brand validity.
- derived BrandCategory or CategorySource.
- SKU/price fields inside Brand CRUD.

### Focused acceptance

```powershell
npx tsx --test src/apps/masterdata/domain/brand-rules.test.ts
npx tsx --test src/apps/masterdata/application/brand-service.test.ts
```

Prove category-required create, explicit assignments, final-category guard, live uniqueness/reuse/restore conflicts, supplier eligibility, delete blocking with live SKU, and no derived classification.

### Acceptance criteria

- Brand-grain management is usable and every creation path requires explicit Category input.
- Supplier/category/contact relation constraints are enforced and audited.
- Focused tests and common checks pass.

### Stop conditions

- Any flow cannot satisfy category-required creation without guessing a Category.
- Brand UI needs price/SKU ownership moved into Brand.

Commit MD-04 and continue.

---

## MD-05 — SKU / material vertical slice

### Dependencies

- MD-04 Brand.
- MD-02 Category/Unit.

### Scope

- SKU CRUD/lifecycle/status transitions.
- optional Brand, direct optional PRODUCT Category, required base Unit.
- spec, dimensions, commercial-unit defaults, notes, media.
- ACTIVE readiness excluding price behavior implemented in MD-06; activation command may be completed in MD-06 when price becomes available.
- live slug/code uniqueness for branded and unbranded SKU.
- usable SKU directory/detail/create/edit/inline-selection UI.

### Allowed files

- SKU/material areas in Master Data layers
- `src/app/masterdata/skus/**` and material SKU routes
- focused tests.

### Locked business rules

- SKU has one direct optional PRODUCT Category and optional Brand.
- Only `MATERIAL | FURNITURE | FIXTURE` kinds exist.
- DRAFT may be incomplete; ACTIVE readiness must remain explicit and fail closed.
- Master Data owns defaults/identity while BQ owns calculation/rounding.

### Migration requirements

- No schema migration is expected. A missing SKU/Unit/media/costing field or constraint is an MD-01 discrepancy and a STOP condition.

### Forbidden

- SkuCategory or multiple primary categories.
- SERVICE kind.
- silent `pcs`/Unit/category/Brand defaults.
- BQ calculations inside Master Data.
- automatic Master Data price creation from StudioFlow.

### Focused acceptance

```powershell
npx tsx --test src/apps/masterdata/domain/sku-rules.test.ts
npx tsx --test src/apps/masterdata/application/sku-service.test.ts
```

Prove status graph, direct-category rule, Unit/conversion validation, live uniqueness, soft-delete preservation, media constraints, and DRAFT incomplete-state truthfulness.

### Acceptance criteria

- SKU directory/detail/create/edit flows are usable with explicit DRAFT state.
- No activation can bypass category/base-Unit checks; final price gate completes in MD-06.
- Focused tests and common checks pass.

### Stop conditions

- A legacy field cannot be classified by existing MD-00 decisions.
- Implementing a costing default would require changing BQ calculation semantics.

Commit MD-05 and continue.

---

## MD-06 — Current canonical material/work pricing

### Dependencies

- MD-03 eligible Parties.
- MD-05 SKU.
- MD-02 WORK Category and Unit.

### Scope

- Singular canonical SkuPrice create/update/clear-for-DRAFT by SKU.
- ACTIVE gate requiring exactly one canonical price.
- amount/currency/Unit/supplier/source/updater validation.
- WorkPrice CRUD/lifecycle for MATERIAL_LABOR and LABOR_ONLY.
- one current rate updated in place with updater metadata and audit diff inputs.
- material, material+labor, and work-only pricing UI without comparison/history affordances.
- readiness pure rules needed by later public reads.

### Allowed files

- pricing areas in Master Data layers
- `src/app/masterdata/pricing/**`
- focused tests.

### Locked business rules

- SkuPrice is singular current truth and preserves row identity across updates.
- WorkPrice is singular current truth per code; Material+Labor remains one indivisible quote.
- Audit—not price rows—provides change history; BQ snapshot provides project history.

### Migration requirements

- No temporal/current pricing migration may be introduced. MD-01 must already contain unique `SkuPrice.sku_id` and current-value WorkPrice. Any mismatch is a Gate 1 correction, not an MD-06 workaround.

### Locked write behavior

- Blank SkuPrice means no price for DRAFT; zero is intentional; negative fails.
- Upsert updates the same SkuPrice row. Supplier changes do not create a row.
- SkuPrice Unit equals SKU purchase Unit when set, otherwise base Unit.
- No price delete for ACTIVE SKU.
- WorkPrice amount is required, zero allowed, negative/blank rejected.
- MATERIAL_LABOR requires adequate scope note but no component relation/split.

### Forbidden

- close-then-insert price history.
- `prices[]`, current flags, validity periods, preferred/cheapest/latest selectors.
- automatic sample/request quote mirroring.
- WorkPrice history table, SKU relation, project relation, or qty.

### Focused acceptance

```powershell
npx tsx --test src/apps/masterdata/domain/sku-price-rules.test.ts
npx tsx --test src/apps/masterdata/domain/work-price-rules.test.ts
npx tsx --test src/apps/masterdata/application/pricing-service.test.ts
```

Prove unique one-to-one price, update-in-place identity preservation, DRAFT/ACTIVE price gates, supplier role validation, Unit match, updater metadata, audit diffs/no-ops, WorkPrice kinds/scope, and absence of selector/history semantics.

### Acceptance criteria

- Pricing UI exposes exactly material, material+labor, and work-only current-value workflows.
- Updating canonical price changes the same DB identity and creates one audit diff.
- ACTIVE readiness and every negative amount/Unit/vendor case are proven.
- Focused tests and common Gate 2 checks pass.

### Stop conditions

- Legacy data has multiple current offers and implementation would choose one. Do not import that data; report curation need.
- A requested UI implies price comparison/history.
- Pricing would require BQ code changes.

### Gate 2 report

Commit MD-06. Return MD-02–MD-06 hashes, exact files/migrations since Gate 1, usable route inventory, legacy classifications applied, focused/global/build results, known data-curation items, and stop-condition review. Stop for PM/TL Gate 2 approval.

---

## MD-07 — Permissions and audit convergence

### Dependencies

- MD-02 through MD-06 mutation surfaces stable.

### Scope

- export exact Master Data permission constants.
- server-side permission checks on every protected read/write/import/export/discovery use case.
- implement one domain-neutral AuditEvent persistence adapter for the locked Core writer.
- Master Data audit read/query UI protected by `masterdata.audit.read`.
- verify all real mutations write one same-transaction event and no-ops write none.
- narrow Core RBAC correction accepting exactly locked `<app>.access` alongside normal three-segment IDs.

### Allowed files

- Master Data permission/audit composition across its layers
- `src/platform/core/audit/**`
- `src/platform/core/rbac/**` only for special app access grammar/tests
- `src/app/masterdata/audit/**`
- focused tests.

### Locked business rules

- The exact permission IDs in MD-00 are app-owned and checked server-side.
- One platform AuditEvent store implements the locked envelope; action names remain app-owned.
- Mutations and audit share a transaction; reads/UI never replace authorization.

### Migration requirements

- AuditEvent schema is already created in MD-01. MD-07 may not add a duplicate audit table or change its envelope. A schema discrepancy requires PM/TL correction.

### Forbidden

- persisted role/grant designer or invented role grants.
- admin bypass/fallback role.
- app-specific action vocabulary inside Core.
- duplicate MasterDataAudit or StudioFlow AuditLog.
- audit undo/revert/deletion.

### Focused acceptance

```powershell
npx tsx --test src/apps/masterdata/application/masterdata-permissions.test.ts
npx tsx --test src/apps/masterdata/infrastructure/masterdata-audit.test.ts
npx tsx --test src/platform/core/rbac/rbac.test.ts
npx tsx --test src/platform/core/audit/audit.test.ts
```

Also produce a mutation-to-permission-to-audit coverage table in the MD-07 executor report. Prove rollback atomicity against the disposable database.

### Acceptance criteria

- Every protected use case appears once in the coverage table with exact permission/audit behavior.
- Audit rollback/no-op/secret-safety tests pass.
- `<app>.access` works without weakening normal permission grammar.
- Focused tests and common checks pass.

### Stop conditions

- Current identity implementation cannot supply the locked principal/updater snapshot without a new identity decision.
- Audit persistence would require changing the Core envelope.

Commit MD-07 and continue.

---

## MD-08 — Whole-schema XLSX import/export

### Dependencies

- MD-07.
- stable application ports from MD-02 through MD-06.

### Scope

- add `exceljs@^4.4.0` and no other spreadsheet library.
- versioned manifest and locked sheets from `MASTER_DATA.md`.
- export canonical strings/codes/IDs and row versions.
- validate/preview with safe sheet/row/field errors.
- atomic apply through existing application rules, permissions, transactions, and audit.
- stable-ID create/update, no missing-row deletion.
- singular SkuPrice upsert by SKU.
- dictionary code handling and locked legacy aliases.
- conflict detection and exact round-trip tests.
- usable import/export UI.

### Allowed files

- import/export areas under Master Data layers
- `src/app/masterdata/data/**`
- `package.json`, `package-lock.json` for ExcelJS only
- focused fixtures/tests.

### Locked business rules

- Workbook identity is stable ID/canonical code; display names never become authority.
- Missing rows do nothing; stale/invalid/duplicate input aborts the entire apply.
- SkuPrice is one row per SKU and dictionaries are extended only through their explicit sheets/manage permission.

### Migration requirements

- No database schema migration is expected. ExcelJS dependency/lockfile change is the only package-level dependency change allowed. Persistent import-job/history tables are not authorized.

### Forbidden

- direct Prisma bulk writes bypassing application invariants/audit.
- unknown-column passthrough.
- implicit Unit/Category/BusinessType/Party creation.
- duplicate SkuPrice winner selection.
- raw caught errors or Prisma details in row results.
- partial apply, automatic merge, delete/restore columns, formulas/macros.

### Focused acceptance

```powershell
npx tsx --test src/apps/masterdata/application/import-export.test.ts
npx tsx --test src/apps/masterdata/infrastructure/xlsx-roundtrip.test.ts
```

Tests must cover unchanged round trip, create/update, stale conflict, missing-row no-op, relationship preservation, decimals, updater/audit, duplicate price rejection, unknown dictionary/column/version rejection, and atomic rollback.

### Acceptance criteria

- Export→preview→unchanged apply is lossless and writes no false changes.
- Valid creates/updates preserve every locked relation and audit atomically.
- Every forbidden/conflict case returns safe row-level evidence and writes nothing.
- Focused tests and common checks pass.

### Stop conditions

- Exact locked workbook semantics cannot be represented with ExcelJS.
- A source workbook field requires a new business/entity decision.
- Apply cannot remain atomic for the MVP workbook.

Commit MD-08 and continue.

---

## MD-09 — Brand Discovery and Master Data public reads

### Dependencies

- MD-04 Brand.
- MD-05 SKU.
- MD-06 pricing.
- MD-07 authorization/audit infrastructure.

### Scope

- deterministic Brand Discovery search, reasons, ranking, suggestions, and detail.
- active SKU evidence without deriving classification.
- minimal allowlisted Brand catalog links.
- typed `masterdata/public` operations for StudioFlow catalog/discovery reads.
- typed material/SKU, singular canonical price, and WorkPrice candidate/readiness operations for BQ.
- canonical decimal/date/Unit DTOs; no Prisma leakage.
- negative cross-app boundary tests.

### Allowed files

- discovery/public areas under Master Data layers
- `src/apps/masterdata/public/**`
- tests/fixtures
- no consumer-app implementation beyond compile-only boundary fixtures if essential.

### Locked business rules

- Brand Discovery ranking/reasons use only locked evidence and deterministic tie-breaks.
- `masterdata/public` is the sole consumer surface and exposes immutable minimal DTO values.
- BQ-facing material reads contain exactly one canonical price or explicit not-ready reasons.

### Migration requirements

- No schema migration is expected. Discovery/public reads use existing indexed data; a proposed denormalized/materialized persistence model requires manager approval and is a STOP condition.

### Locked discovery ranking

Implement the exact tier order in `MASTER_DATA.md`: Brand exact/prefix; explicit BrandCategory Category exact/synonym/prefix/substring; secondary ACTIVE SKU code/name; stable reason-count/name/ID tie-break. Empty suggestions use BrandCategory count/sort/name/ID.

### Public DTO requirements

- StudioFlow receives discovery-safe Brand/category/link and ACTIVE SKU summary data only.
- BQ receives one `price` object or explicit not-ready reason, never `prices[]`.
- BQ candidate values include stable source IDs, amount, currency, Unit code, optional supplier/source snapshot values, Category name/path, WorkPrice kind/scope, and source `updatedAt`.
- No public writes.

### Forbidden

- direct consumer imports of Master Data internals.
- supplier/contact/price/audit leakage into Brand Discovery.
- fuzzy/repeated-letter/ML ranking, Brand tags, SkuCategory, or derived BrandCategory.
- BQ snapshot implementation or StudioFlow Library migration in this checkpoint.

### Focused acceptance

```powershell
npx tsx --test src/apps/masterdata/application/brand-discovery.test.ts
npx tsx --test src/apps/masterdata/public/masterdata-public.test.ts
npm run test:boundaries
npm run test:legacy-runtime
```

Prove every ranking tier/tie-break, explanations, deleted/discontinued filtering, link allowlist, singular price readiness, WorkPrice DTO, decimal/date serialization, and forbidden internal imports.

### Acceptance criteria

- StudioFlow-facing discovery/catalog reads expose no commercial/private data.
- BQ-facing reads expose singular price/work readiness without selector logic.
- Boundary/legacy-runtime/focused/common Gate 3 checks pass.

### Stop conditions

- A consumer requires fields outside the locked minimum DTO.
- Implementation would require BQ/StudioFlow product changes.
- Discovery ranking cannot be implemented without a new authority source.

### Gate 3 report

Commit MD-09. Return MD-07–MD-09 hashes, permission/audit matrix, workbook round-trip evidence, public API inventory, discovery ranking evidence, all focused/global/build results, and stop-condition review. Stop for PM/TL Gate 3 and Final convergence review.

---

## 9. Final expected capabilities

On successful completion, the rebuild must provide:

- clean-database Master Data schema and idempotent controlled seeds;
- usable management for Unit, Category, Party/roles/business types, Brand, SKU, and pricing;
- current canonical material price per ACTIVE SKU with optional supplier/source provenance;
- current labor and material+labor WorkPrice management;
- lifecycle, uniqueness, permissions, and same-transaction audit guarantees;
- versioned whole-schema XLSX export/preview/import round trip;
- explainable Brand Discovery;
- stable `masterdata/public` reads suitable for later StudioFlow and BQ consumer migration;
- no legacy runtime coupling or cross-domain leakage.

Bulk migration of legacy Party/Brand/SKU/business rows is not authorized by this package. The package implements approved dictionary seeds and safe import capability. Any ambiguous real legacy record—especially multiple current supplier prices for one SKU—requires curated data input, not executor selection.

## 10. Final convergence acceptance

PM/TL will verify:

```powershell
git status --short
git log --oneline masterdata-full-build-start-ui-approved..HEAD
git diff --check masterdata-full-build-start-ui-approved..HEAD
npm test
npm run check
npx prisma validate
npx prisma generate
npm run test:boundaries
npm run test:legacy-runtime
npm run build
```

And, with the disposable database:

```powershell
$previousDatabaseUrl = $env:DATABASE_URL
try {
  $env:DATABASE_URL = $env:MASTERDATA_TEST_DATABASE_URL
  npx prisma migrate reset --force
  npx prisma migrate status
  npm test
} finally {
  $env:DATABASE_URL = $previousDatabaseUrl
}
```

Manual usability smoke review must cover:

1. Category/Unit settings;
2. Party + operational roles + business types;
3. category-required Brand creation;
4. DRAFT SKU completion and activation with singular price;
5. canonical price update-in-place and audit display;
6. WorkPrice material+labor/work-only entry;
7. XLSX export → preview → unchanged import and safe update;
8. Brand Discovery search/detail;
9. public material/work readiness reads.

## 11. Universal stop and escalation conditions

STOP only the affected checkpoint, preserve the last valid checkpoint commit, and report exact evidence when:

- current code/schema differs materially from this package;
- the exact canonical GitHub evidence commit cannot be resolved or read; do not fall back to a local checkout or a different remote ref;
- a locked rule is contradictory or impossible to implement;
- a new field/entity/relation/status/permission/action/dependency is required;
- a migration would be destructive or cannot be verified on a disposable DB;
- legacy data requires choosing among multiple current prices or ambiguous identities;
- a boundary would require BQ/StudioFlow internals or Platform→app dependency;
- a new UI Engine token/primitive or Foundation redesign appears necessary;
- acceptance requires changing a forbidden contract/file;
- an unrelated dirty change cannot be isolated.

Do not reinterpret the contract, silently reduce scope, or “improve while here.” Report:

1. affected checkpoint;
2. exact file/data evidence;
3. locked rule involved;
4. why deterministic implementation cannot continue;
5. smallest manager decision/correction required;
6. last valid commit and verification state.

## 12. Required checkpoint/final report format

At each manager gate return:

1. start tag hash and checkpoint commit hashes;
2. exact files changed per checkpoint;
3. change → checkpoint-item mapping;
4. legacy evidence and locked classification used;
5. migration/seed/data-curation evidence;
6. focused and global acceptance commands with results;
7. deviations/residual risks;
8. stop-condition review;
9. confirmation of clean worktree, no unrelated change, and no runtime legacy dependency.

Do not mark the program complete yourself. After MD-09, status is `IMPLEMENTED — AWAITING PM/TL FINAL APPROVAL` until convergence review passes.
