# Master Data — First-App Intake

Status: **DEFERRED UNTIL FOUNDATION F0 + UI-F1 — not an executable app contract yet**

This short intake preserves only owner-approved direction needed to design the foundation. It is intentionally not a complete Master Data PRD or work order. A full code-derived contract is written after the shared foundation passes and before Master Data implementation resumes.

## Product direction already locked

- Master Data is the first app built on the reusable platform foundation.
- It will own Party, Brand, Category, SKU, Unit, supplier/material prices, work prices, media, physical Samples, import/export, and its app audit behavior.
- One SKU may be sold by many vendors at different current prices.
- Price identity is therefore at least SKU × vendor/supplier, not one price column on SKU and not one global “current price”.
- BQ must later receive all eligible price options and choose explicitly; no cheapest/latest/preferred fallback is invented in Master Data.
- Master Data may consume Core, Utilities, and UI Engine but may not create private copies of a generic capability.
- StudioFlow and BQ read Master Data through an explicit public contract; no cross-app internal import or implicit table write.

## Foundation capabilities proven necessary

Before app work starts, the foundation must provide:

- real login/session and persisted RBAC/grant resolution;
- Platform General Settings and access-management UI;
- DB/transaction, audit, safe error/action result, validation, decimal/money/date/Unit/text/slug/pagination utilities;
- app shell, settings/directory/form/table/state/confirmation/unsaved patterns;
- `CreatableSearch`, debounce, option overlay, and pending feedback in UI Engine.

These are shared because their mechanics and meaning are the same for Master Data, StudioFlow, and BQ. Entity permissions, Party roles, pricing eligibility, SKU lifecycle, import policy, and route copy remain Master Data-owned.

## Required contract workflow when Master Data is activated

The PM/TL must inspect committed legacy code end to end at the exact recorded commit:

1. route/navigation and real UI interaction;
2. action/API and input validation;
3. service/domain rules;
4. query, transaction, and persisted relations;
5. permission, audit, import/export, and downstream BQ/StudioFlow reads;
6. tests, migrations, error handling, and defect-explaining comments.

Each behavior is recorded as **KEEP**, **FIX**, **MERGE**, or **PURGE**, with exact code path/symbol, intended replacement, schema constraints, public DTO, UI states, and acceptance tests. Legacy Markdown is never evidence.

Legacy baseline currently available:

```text
D:\Projects\studioflow
commit 6377ac0971e7a7cc0fd8fb58a8360c069675f9a5
dirty/stale checkout; committed code only is admissible evidence
```

Known code paths that must be traced later include `src/subapps/master-data/**`, `src/extensions/library/**`, relevant `src/subapps/bq/**` consumers, schema/migrations, and the legacy shared UI/hooks cited by `CORE.md` and `UI_ENGINE.md`.

## Activation gate

Do not issue or execute a Master Data implementation work order until:

- `CORE.md` Stage F0 passes;
- `UI_ENGINE.md` UI-F1 passes;
- the current schema/code is re-audited after those changes;
- this intake is replaced by a complete owner-reviewable app contract;
- the owner approves that logic contract.
