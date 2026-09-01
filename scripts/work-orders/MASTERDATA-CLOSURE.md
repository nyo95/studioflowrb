# Master Data Closure Work Order

Status: **ACTIVE — owner-authorized 2026-09-01**

## Scope

Close every active Master Data contract slice: Brand, Vendor, VendorType, Unit,
Category, SKU, and all three Pricing models. Deferred media, Samples,
import/export, jobs, notifications, and BQ snapshot persistence are excluded.

## Locked execution order

1. Repair service/action gaps first: capability-validated Vendor quick entry
   for Pricing, Brand/Vendor relations, lifecycle guards, safe action results,
   one audited transaction per mutation, and focused integration coverage.
2. Complete directories and dialogs against the contract: filters, sorting,
   pagination, archived states, quick entry, detail/edit, confirmations,
   validation/success feedback, and unsaved-change protection.
3. Reuse or narrowly extend UI Engine only for domain-neutral interaction; keep
   every Master Data rule in the app service.
4. Verify the complete workflow on the confirmed rebuild-only test database and
   authenticated local application at desktop and 390px viewport.

## Acceptance

- All active contract rules and public read behavior are covered by tests.
- `npm run typecheck`, `npm run lint`, `npm run check`, `npm test`, and
  `npm run build` pass against an explicitly verified rebuild target.
- Browser acceptance covers permission, loading, empty, error, archived,
  disabled, validation, long-content, destructive-confirmation, unsaved-input,
  desktop, collapsed rail, and narrow viewport states.
- Each cohesive correction receives its next local revision, changelog entry,
  staged-diff review, and one local commit; no push or release is authorized.
