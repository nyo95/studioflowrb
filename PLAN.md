# Active Plan

Plan ID: WO-BRAND-BY-ROLE-01
Scope: Two brands fixed by role — contractor brand (A) for BQ and Master Data, consultant brand (B) for StudioFlow — on every printable document and in the app's top-left mark per area
Module(s): studioflow (settings: document identity), bq (public read of its existing issuer identity), platform authenticated shell (Lead, per-area mark)
Target revision: **R9.84** Executor backend (Lead plan R9.83); Lead UI and integration follow as R9.85
Status: READY
Priority: P2
Owner: Product Owner; Lead locks and reviews
Last updated: 2026-10-15

## Outcome

The company appears under two brandings, each locked to one role:

- **A = contractor** — the BQ and Master Data areas. Its identity already exists as BQ's quotation letterhead (`BqQuotationSettings`: company name, logo, address, e-mail, signer, signature).
- **B = consultant** — StudioFlow (including Ideas and Presentation, which live under `/studioflow`). It has **no** identity today.

After this Work Order (R9.84 + R9.85):

1. StudioFlow has its own **document letterhead** setting (company name, logo, address, e-mail), edited in StudioFlow Settings.
2. Every printable StudioFlow document carries B: Minutes of meeting, Product schedule, Presentation. The BQ quotation keeps carrying A exactly as today.
3. The top-left mark of the app shell **changes with the area**: B's logo/name inside `/studioflow`, A's inside `/bq` and `/masterdata`, the platform brand mark everywhere else (home, Settings, Account, Developer). An area with no identity set falls back to the platform brand mark.

Previous Work Order WO-SF-SUPERVISION-HANDOVER-01 is complete in code (R9.80; history at `46f49fb:PLAN.md`); its browser group [R9.80] is pending with the owner.

## Context and Evidence

- Owner 2026-10-15, on brands: a company may run one central brand or two; then "A konsultan ya hanya konsultan ga bisa kontraktor … salah satu branding -> satu jenis"; "kontraktor=A; konsultan=B … BQ, Masterdata -> A; studioflow -> B"; A and B are "minimal beda branding" (legal-entity split unknown); no data separation ("domain sudah masing2"). Then: "gonta ganti better; semua dokumen yg bisa di print dan secara template butuh logo".
- BQ identity: `prisma/schema/bq.prisma` `BqQuotationSettings` (owner 2026-10-14: "the contractor may not be the studio"); service `src/apps/bq/services/quotation-settings.ts` (`getQuotationSettings`, `updateQuotationSettings` with `ImageChange`, replaced-key cleanup, audit); print `src/app/(document)/bq/print/[id]/quotation/page.tsx:296–308` (signed logo, fallback to platform `organizationName` / `brandMarkUrl`). BQ public (`src/apps/bq/public`) does not expose the identity.
- StudioFlow settings singleton `SfSettings` (`prisma/schema/studioflow.prisma:70`, id `"studio"`, workflow numbers only), read/written in `src/apps/studioflow/projects/service.ts`; settings pages listed in `src/app/(platform)/studioflow/settings/sections.ts`, gated by `studioflow.settings.manage`.
- StudioFlow prints (`src/app/(document)/studioflow/print/projects/[projectId]/…`): `mom/[momId]`, `schedule`, `presentation/[boardId]` — none shows a company name or logo.
- Shell: one `AuthenticatedShell` (`src/platform/authenticated-shell/index.tsx`) composed in `src/app/(platform)/layout.tsx`; the mark is the platform `brandMarkUrl` or a monogram; `RouteAwareAppShell` already knows the app root paths. Master Data prints nothing.
- Signed links are stable since R9.82 (`stableExpiry`), so a long-lived signed logo link in the shell does not churn.

## Locked Decisions

1. **Brand follows the role, not the project.** No per-project or per-document choice, no list of identities, no swap. Contractor (A) = BQ + Master Data; consultant (B) = StudioFlow (+ Ideas, Presentation).
2. **Each identity is owned by the app that holds the role.** A stays in BQ (`BqQuotationSettings`, unchanged meaning). B is StudioFlow-owned. Nothing moves to Platform General Settings; Core stays domain-neutral. Master Data owns no identity — the composition layer (`src/app`) maps `/masterdata` to BQ's public identity.
3. **B's fields:** company name (≤ 120), logo (PNG, same policy as BQ's logo), address (letter text limit as BQ), e-mail (validated as BQ). No signer/signature, PPN or payment terms (StudioFlow documents have none). All optional; empty = fall back to the platform organisation name and brand mark, like BQ today.
4. **Storage:** four nullable columns added to the `SfSettings` singleton — additive migration, no backfill, no data change. Logo as a private object key in platform object storage; a replaced/removed logo is discarded after commit through StudioFlow's existing asset-cleanup path (same discipline as BQ's replaced keys).
5. **Permission:** editing B needs `studioflow.settings.manage`; reading B for printing/shell needs no extra permission beyond reaching the page (it is letterhead, not business data). Editing A unchanged (`bq.project.manage`).
6. **Documents render the current identity** (as BQ does today). No historical snapshot of the letterhead per document in this Work Order.
7. English UI copy. No new dependency. No change to BQ's schema or quotation output.

## Backend Contract (Executor, R9.84)

- **StudioFlow document identity service:** `getDocumentIdentity()` → `{ companyName, logoKey, companyAddress, companyEmail }` (nulls when unset; no row = all null) and `updateDocumentIdentity({ grants, actor, companyName, companyAddress, companyEmail, logo: ImageChange })` → `{ replacedLogoKey }`, validating as BQ's letterhead fields, requiring `studioflow.settings.manage`, auditing `studioflow.document-identity.updated`. Writing must not reset the workflow numbers in `SfSettings` (upsert only these columns).
- **Logo upload:** a server action that accepts a PNG (reuse the platform PNG policy used for brand marks/BQ logo — no private copy of the PNG check), stores it under a StudioFlow key prefix, calls the service, and enqueues the replaced key for cleanup after commit.
- **Public reads for composition** (used by print pages and the shell, no grants needed):
  - StudioFlow public: `readStudioFlowDocumentIdentity()` returning the identity above.
  - BQ public: `readBqIssuerIdentity()` returning `{ companyName, logoKey, companyAddress, companyEmail }` from `BqQuotationSettings` (no signer/signature/PPN/terms).
  Both return plain data; resolving the logo key to a link is the caller's job (`objectStorage.createSignedReadUrl`).
- Contract docs: add the identity to the StudioFlow and BQ app contracts (one short paragraph each).

## UI Contract

**Executor minimal wiring (R9.84):** a StudioFlow Settings page **Document letterhead** (new group "Documents" in `studioflow/settings/sections.ts`, visible with `studioflow.settings.manage`) with the four fields and logo set/replace/remove, mirroring the BQ quotation settings form. Plain and functional; no print or shell changes.

**Lead (R9.85), not delegated:** letterhead block on MOM, Product schedule and Presentation prints (Presentation: logo in the running header of every page, kept small so slides stay clean); `AuthenticatedShell` extended with a domain-neutral per-area mark (root path → name + logo link), composed in `(platform)/layout.tsx` from the two public reads (long-lived signed links), falling back to the platform mark; settings page polish.

## Boundaries and Non-goals

- No per-project brand choice, no third brand, no identity list, no legal-entity fields (tax ID, bank account, numbering per entity).
- No data, user or permission separation between A and B.
- No change to the BQ quotation's look or the meaning of `BqQuotationSettings`.
- No letterhead snapshot per printed document.
- No login-page or browser-tab icon change.

## Acceptance Criteria

- Saving B in StudioFlow Settings persists the four values and logo; replacing/removing the logo discards the old object after commit; workflow numbers in `SfSettings` are untouched.
- A user without `studioflow.settings.manage` cannot see the page or call the action.
- Both public reads return the stored identity, and all-null when nothing is set.
- (R9.85) Each StudioFlow print shows B's logo and name (or the platform fallback); the BQ quotation is unchanged; the shell mark shows B in `/studioflow…`, A in `/bq…` and `/masterdata…`, the platform mark elsewhere.

## Verification

Executor (R9.84): integration tests for get (no row / row), update (values, trimming, validation refusals for long name/bad e-mail/long text, permission refusal, logo set/replace/remove returns the replaced key, workflow numbers preserved, audit row) and both public reads. Then `npm test`, typecheck, full lint, `check:boundaries`, `check:legacy-runtime`, production build, `git diff --cached --check`. Apply the migration to both dev and test databases (rebuild-only targets).

## Reviewer Acceptance

After R9.85 (owner browser group): set B's logo and name in StudioFlow Settings; print a MOM, a schedule and a presentation and see B; print a BQ quotation and see A; move between StudioFlow, BQ, Master Data and Settings and watch the top-left mark change; clear B's logo and see the platform mark come back.

## Regression Risks and Recovery

- Upserting `SfSettings` with only the new columns must not reset workflow defaults — covered by a test.
- An orphaned logo object on a failed save: clean up the new key when the write fails (as BQ does).
- Migration is additive and nullable; rollback = drop the four columns.

## Executor Prompt

```text
ROLE: BACKEND EXECUTOR. Location: kantor (load .env.kantor, set
STUDIOFLOW_LOCATION=kantor, verify rebuild-only dev/test targets). Read
AGENTS.md, docs/agent/EXECUTOR.md and PLAN.md WO-BRAND-BY-ROLE-01.
Build R9.84 only: StudioFlow document identity (four nullable columns on
SfSettings via an additive migration applied to dev and test; get/update
service with BQ-style validation, studioflow.settings.manage, audit, logo
ImageChange with replaced-key cleanup; PNG upload action reusing the platform
PNG policy), public reads readStudioFlowDocumentIdentity and
readBqIssuerIdentity, the plain "Document letterhead" settings page, contract
doc paragraphs, and the listed tests. Do not touch prints, the shell or the
BQ quotation output. No new dependency, legacy or remote operation. Preserve
untracked owner files under test/. Finish with all checks, CHANGELOG R9.84,
one local commit. Return only the Planner/Reviewer prompt: outcome, commit,
checks, limitations, remaining dirty files, request for verdict.
```
