# Active Plan

Plan ID: WO-SCHEDULE-ASSISTANT-01
Scope: Product Schedule Composer MCP, V1: an AI client composes one project's Product Schedule through a provider-neutral MCP bridge (read context → validate → preview → approved atomic apply → read-back).
Module(s): new optional module `schedule-assistant` (parent/requires `studioflow`, starts DISABLED); StudioFlow (new protected `public/` composer door + one permission id); Platform integrations (scope registration wiring only); composition root; new standalone bridge package `tools/schedule-assistant-mcp/`.
Target revision: R9.167 (this plan is R9.166). R9.165 exists twice in the ledger (Platform Owner user deletion, local; Schedule MCP proposal `6fb5c66`, pushed) and R9.163–R9.164 are also used on the unmerged remote branch `claude/r9-163-timeline-fixes`; re-check `CHANGELOG.md` and every local/remote branch, and use the next unused number if R9.167 is taken.
Risk: high - a new external write door into live project data authenticated by a bearer token; crosses the StudioFlow protected core, RBAC/module gating and the integration transaction kit. Escalate (BLOCKED / CONFLICT) if the composer cannot run inside the kit's transaction, if code allocation needs a change to `schedule/sync.ts` semantics, if any locked decision below needs a schema migration, or if the MCP SDK cannot be used as a pinned dependency of the standalone package.
Status: READY
Priority: P0 (owner, 2026-10-22)
Owner: Product Owner (decisions 2026-10-22; BACKLOG "Product Schedule Composer MCP")
Last updated: 2026-10-22

Plan reconciliation: the previous active plan `WO-PLATFORM-FORCE-DELETE-01` is DONE in
R9.165 (local) and only awaits the owner's browser walk (BACKLOG `[UNVERIFIED]`).
`docs/agent/queued-plans/WO-REL-READINESS-01.md` stays parked unchanged and resumes
after this P0. Nothing else is in flight.

## Outcome

A Platform Owner (Developer switches the module on) can create a personal integration
token with the new Schedule Assistant scopes on the Account page, paste it into the
local bridge config of Claude Code, Codex, OpenCode or Gemini CLI, and then, from a
written brief, have the AI client:

1. list the projects the user may work on and read one project's schedule context
   (current entries/options, studio categories and prefixes, which active template
   items are not yet in the project, active Master Data Brands, reusable options from
   past projects);
2. send a complete draft batch that StudioFlow validates and previews **without
   writing anything**, returning every issue at once or the exact projected result
   (codes, option labels, categories, Brand snapshots) plus a digest;
3. after the user approves that preview in the client, apply exactly that batch in one
   transaction (all or nothing, safe to retry), then read the saved schedule back and
   show it.

StudioFlow alone decides codes, prefixes, numbering, category spelling, Brand
snapshots, Material/Fixture rules, option labels and the never-final rule. StudioFlow
calls no AI model and stores no model-provider key.

## Context and Evidence

- Integration kit `src/platform/core/integrations/index.ts`: `sfk_` bearer tokens
  (SHA-256 stored), live grants via `loadLiveGrants` filtered by
  `enabledPermissionIds` (a disabled module's permission is never granted), route
  `scope` + `grant`, zod body, 1 MiB default limit. `write: true` requires
  `Idempotency-Key`, runs the handler in **one `runSerializableTransaction`** with a
  savepoint, stores the response in `platform.integration_request` (24 h retention,
  2 min lease, request hash = method + path + raw body, different body → 409
  `IDEMPOTENCY_KEY_REUSED`), writes an `integration.write` audit, and replays the
  stored response with `Idempotency-Replayed: true`. A 4xx handler error is rolled back
  to the savepoint and stored; a 5xx (incl. serialization conflict P2034) is rethrown so
  the runner retries (3 attempts, 30 s timeout). The handler gets `{ principal, body,
  requestId, transaction }`, not the URL.
- Scopes offered on the Account page and accepted by `createOwn` are only
  `REFERENCE_SCOPE_GRANTS` (`integration:ping`) today
  (`src/app/(platform)/account/page.tsx:103`, `actions.ts:153`, default parameter in
  `createOwn`). Scope regex `^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$`.
- Schedule service `src/apps/studioflow/schedule/service.ts`: `writer.createEntry` /
  `writer.createOption` (tx-aware single home for codes, labels and "a new option is
  never final", already shared with Ideas); `applyTemplates` →
  `seedScheduleFromTemplates` (all active template items not yet in the project,
  idempotent); `updateEntry` (qty/unit Fixture-only, location); `updateOption`
  (full snapshot replace, Brand re-snapshot only when the id changes);
  `copyReusableOption`; `searchReusableOptions`; `listCategoryChoices`;
  `listBrandChoices`. `requireScheduleCommand` = `studioflow.access` +
  `studioflow.schedule.manage` + `requireProjectAccess(kind: "document")` (assigned
  Designer/Drafter PIC or override holder, project not completed);
  `loadWritableProject` refuses archived/completed. `allocateIncrement` locks the
  project row `FOR UPDATE` (lowest free number). `brandSnapshot` accepts only an active
  Master Data Brand id; the UI create paths drop a free-text Brand name.
- `listSchedule` signs image URLs and checks only `requireRead` (no project-detail
  check), so the composer must not reuse it for its read DTO.
- Precedent door: `src/apps/studioflow/public/ideas-bridge.ts` (+ `-runtime.ts`)
  wraps the schedule writer for the Ideas module. Optional module precedents:
  `src/apps/ideas/public/manifest.ts`, `presentation`, `workspace-board`
  (`initialState: "DISABLED"`). Module permissions live in `STUDIOFLOW_PERMISSIONS`
  and are claimed by the module manifest's `permissionIds`.
- Platform Owner automatically holds every enabled non-position permission
  (`owner-policy.ts`).
- Node v24 on the owner machines; the repo has no MCP dependency today.

## Locked Decisions

Owner (2026-10-22), preserved verbatim in meaning:

1. One provider-neutral bridge for Claude, Codex, OpenCode and Gemini; no
   per-provider code paths.
2. Scope is composing the Product Schedule of one project at a time; nothing else.
3. Flow: read context → validate → preview → explicitly approved atomic apply →
   read-back.
4. V1 writes: apply templates, create/update entry, create/update option.
5. Codes/prefix/numbers, Brand snapshot, Material/Fixture rules and option labels
   are decided by StudioFlow, never by the client.
6. A new option is never final.
7. Not in V1: delete, final/unfinal, samples, image upload/removal, any change to
   global templates or prefixes.
8. No model-provider key and no model call from StudioFlow.
9. The extension goes only through StudioFlow's public door; no Prisma and no
   StudioFlow-internal import outside `src/apps/studioflow/`.

Lead (settles the six open points of the proposal, 2026-10-22):

10. **Module.** `schedule-assistant`, `kind: "optional"`, `parent`/`requires`
    `["studioflow"]`, `initialState: "DISABLED"`, version `1.0.0`. It owns no
    persistent data in V1 (idempotency lives in the platform ledger, history in the
    platform audit), so it has **no Prisma schema and no migration**; the first
    revision that needs stored data adds `prisma/schema/schedule-assistant.prisma`
    with its own Postgres schema (MODULES-DECISION D8). Record this in the module
    contract.
11. **Permission.** ADD `scheduleAssistantUse: "studioflow.schedule-assistant.use"`
    to `STUDIOFLOW_PERMISSIONS`, claimed by the manifest's `permissionIds` (Ideas /
    Presentation pattern). It is added to **no** built-in role profile: the Platform
    Owner holds it automatically while the module is on; anyone else gets it only when
    the Platform Owner grants it in Roles. It is a usage gate only; every StudioFlow
    rule below still applies on top. No data migration.
12. **Token scopes (least privilege).** `schedule-assistant:read` and
    `schedule-assistant:write`, both mapped to grant
    `studioflow.schedule-assistant.use`. Read tools and preview need `:read`; apply
    needs `:write` (a full composing token holds both). Scope → grant pairs are
    registered at the composition root (outside `src/platform/`) and passed to the
    Account page list and to `createOwn({ scopeGrants })`; the platform kit itself
    imports no app code. Labels: "Schedule Assistant: read project schedules" /
    "Schedule Assistant: change project schedules".
13. **Access.** Actor identity and live grants come only from the token (kit). Every
    read additionally requires `requireProjectDetailAccess` (assigned team or
    StudioFlow Manager). Preview and apply additionally require the existing
    `requireScheduleCommand` rule (schedule.manage + assigned PIC or override) and a
    writable project (not archived, not completed): StudioFlow's current Schedule
    write rule, unchanged. A manager without override can read but not apply, exactly
    as on the Schedule screen. Preview refuses with the same error apply would.
14. **Update semantics (point 2).** V1 includes updates. `update_entry` changes only
    `qty`, `unit`, `location` (no category move, no reorder, no card fields).
    `update_option` is a **patch**: only sent fields change, `null` clears an optional
    field, `productName` cannot be cleared; the composer merges the patch onto the
    stored option and then applies the existing `updateOption` rules (Brand re-snapshot
    only when the Brand id changes; image, label, final flag and status untouched).
15. **Templates (point 3).** Template application happens only through an explicit
    `apply_templates` operation, at most once per batch and only as the first
    operation. It applies all active studio template items not yet in the project
    (current `seedScheduleFromTemplates` behaviour; no per-item selection in V1).
    Template options seeded with a template photo keep it (existing behaviour; not an
    upload).
16. **Unknown Brand / category (point 5).** A Brand must be an active Master Data
    Brand id (from `search_brands`) or omitted; free-text Brand names are not accepted
    on writes. A Brand the brief names that is not in Master Data is a validation issue
    `SCHEDULE_BRAND_NOT_FOUND` carrying up to 5 closest active Brand suggestions; the
    user picks one, leaves it blank, or creates the Brand in Master Data first. V1
    never writes Master Data. A category not yet known is allowed (as on the Schedule
    screen); the preview marks it `newCategory: true` and shows the projected prefix and
    code. The global prefix dictionary is never written.
17. **Material/Fixture.** `qty`/`unit` on a Material entry is a validation issue
    `SCHEDULE_QTY_NOT_FOR_MATERIAL` (rejected in preview rather than silently dropped
    at apply); quantity format follows the existing two-decimal rule.
18. **Preview = dry run (point 4).** Preview validates the whole batch (collecting
    every issue with its operation index), then executes it through the real StudioFlow
    writer inside a transaction that is **always rolled back**, so projected codes,
    labels and category spellings are exactly what apply would produce against the
    same state. It returns `digest = sha256(canonical JSON {v:1, projectId,
    normalized operations, baseFingerprint})`, where `baseFingerprint` is a hash of the
    project's schedule state (entry and option ids with `updated_at`, plus the set of
    active template item ids and their `updated_at`, plus the project's
    archived/completed state). Apply recomputes the base fingerprint inside its
    transaction **before** writing; if the digest differs it refuses with 409
    `SCHEDULE_PREVIEW_STALE` ("the schedule changed since the preview; preview again")
    and writes nothing. Apply therefore cannot differ from the reviewed preview.
19. **Approval.** The server enforces "only a previewed batch can be applied" (digest)
    and the `:write` scope. Human approval is enforced by the client: the apply tool is
    the only non-read-only tool, its description requires showing the preview and
    getting the user's explicit yes, and all four clients prompt before a non-read-only
    tool call by default. The setup docs tell users not to auto-approve
    `apply_schedule_changes`. StudioFlow does not claim to prove a human clicked.
20. **Idempotency and transaction.** The bridge generates a fresh UUID `operationId`
    for every preview; apply sends it as `Idempotency-Key` and in the body. The kit's
    single serializable transaction holds the schedule writes, the StudioFlow audit
    rows, the idempotency ledger row and the `integration.write` audit; any failed
    operation rolls back the whole batch. An exact retry replays the stored response;
    the same key with a different body is 409. A stale-preview 409 is stored like any
    4xx, so the bridge must preview again (new `operationId`) after it.
21. **Composer door.** StudioFlow ADDs `src/apps/studioflow/public/schedule-composer.ts`
    (+ `schedule-composer-runtime.ts`), exported from the StudioFlow public index. It
    exposes only bounded DTO reads, `previewBatch`, and `applyBatch(tx, …)` where `tx`
    is the platform `TransactionClient` from `@platform/core/db` passed through as an
    opaque handle (needed so the batch commits with the kit's ledger row). No Prisma row
    or StudioFlow internal type crosses the door; inputs are plain data, outputs are
    DTOs. It reuses the schedule writer and the existing sync/domain helpers; any new
    reusable piece (option patch merge, base fingerprint) lives inside
    `src/apps/studioflow/schedule/`, not in the extension.
22. **Bridge packaging (point 6).** Standalone package `tools/schedule-assistant-mcp/`
    with its own `package.json` and lockfile, plain Node ESM (`.mjs`, `// @ts-check`
    JSDoc, no build step, Node ≥ 20), stdio transport only. Approved dependencies (this
    package only, exact pinned versions at least two weeks old): `@modelcontextprotocol/sdk`
    1.x and the `zod` version it requires. Not imported by, built with, or installed by
    the Next app; excluded from the app build/typecheck; never imports from `src/`.
    Config only via env: `STUDIOFLOW_URL` (https, or http only for `localhost`,
    `127.0.0.1`, `::1`) and `STUDIOFLOW_TOKEN` (`sfk_…`). It never prints the token,
    writes logs only to stderr (stdout is the MCP channel), and makes no request to any
    host other than `STUDIOFLOW_URL`.

## Business Rules and Architecture Constraints

- Capability classification: REUSE the integration kit (auth, scope, idempotency,
  transaction, audit), the schedule writer, `seedScheduleFromTemplates`,
  `updateEntry`/`updateOption` rules, `searchReusableOptions` + `copyReusableOption`
  rules, `listCategoryChoices`, Master Data Brand public read, the module
  manifest/gating system. EXTEND StudioFlow's public door (composer) and the
  integration scope registration (composition-level list). ADD the module, its
  permission, its routes, its wire contract and the bridge. App policy stays in
  StudioFlow.
- Dependencies: `schedule-assistant` → `studioflow/public`, `@platform/*`. Never
  StudioFlow → `schedule-assistant`. Route files stay thin (parse → extension
  service → respond). The extension service only maps wire data to composer calls;
  it contains no schedule rules.
- Audit: each StudioFlow write keeps its existing audit action and adds metadata
  `{ via: "schedule-assistant", operationId }`; `apply_templates` keeps
  `studioflow.schedule.templates-applied`. The kit adds `integration.write`.
- Batch limits: 1–100 operations, request body ≤ 256 KiB (`bodyLimitBytes`), one
  project per batch (from the URL). An `entryId`/`optionId` must belong to that
  project. An entry or option may be updated at most once per batch. A
  `create_option` may target a `create_entry` earlier in the same batch by `entryRef`.
- Reads are bounded and private-safe: no signed URLs, no storage keys, no sample
  request details, notes or other project sections; the option DTO exposes `hasImage`
  only. Lists are capped (projects 200, brands 20, reusable options 20).
- Projects listed: not archived, caller passes project-detail access; each has
  `canApply` (the write rule in decision 13).

## Backend Contract

### HTTP (thin routes, `/api/integrations/v1/schedule-assistant/…`)

| Method + path | Scope | Kit mode | Purpose |
|---|---|---|---|
| `GET projects` | read | read | projects the caller may see, with `canApply` |
| `GET projects/[projectId]/context` | read | read | schedule context DTO + `baseFingerprint` |
| `GET brands?q=` | read | read | active Master Data Brands `{id,name}` (q ≥ 2 chars) |
| `GET projects/[projectId]/reusable-options?q=&section=` | read | read | past-project options (no image) |
| `POST projects/[projectId]/preview` | read | read (no idempotency, no write) | validate + dry run + digest |
| `POST projects/[projectId]/apply` | write | `write: true` | approved atomic apply |

Routes may build the kit handler per request to close over `params`/query; the kit is
not changed. All use grant `studioflow.schedule-assistant.use`.

### Wire schema (`src/apps/schedule-assistant/contract.ts`, zod, single source)

```text
Option      = { brandId?: string|null, productName: string, color?, pattern?, finishing?,
                dimension?, notes?: string|null, extra?: [{label, value}] }   // no image, label, final, status
OptionPatch = Option fields all optional (productName non-null if sent)
Operation =
  | { op: "apply_templates" }
  | { op: "create_entry", ref?: string, section: "MATERIAL"|"FIXTURE", category: string,
      qty?: string|null, unit?: string|null, location?: string|null, option?: Option }
  | { op: "update_entry", entryId: string, qty?, unit?, location? }
  | { op: "create_option", entryId?: string, entryRef?: string, option: Option }      // exactly one target
  | { op: "reuse_option", entryId?: string, entryRef?: string, sourceOptionId: string }
  | { op: "update_option", optionId: string, patch: OptionPatch }
PreviewRequest = { operations: Operation[] }                       // strict objects, unknown keys rejected
ApplyRequest   = { operationId: uuid, digest: string, operations: Operation[] }
```

Text limits follow the existing schedule rules (category 80, product 200, other
fields 160, notes 2000, location 160, unit 40). `reuse_option` follows
`copyReusableOption` (source must be in another project; copied option is not final).

### Responses

- Preview, invalid: `{ valid: false, issues: [{ index, op, field?, code, message,
  suggestions? }] }`, HTTP 200, nothing written, no digest.
- Preview, valid: `{ valid: true, digest, baseFingerprint, templatesCreated: [{ code,
  category, productName|null }], operations: [{ index, op, effect:
  "create"|"update"|"no_change", entryCode, optionLabel?, category, prefix,
  newCategory?, brandName?, changes?: { field: { from, to } } }] }`.
- Apply: `{ operationId, applied: true, templatesCreated: n, operations: [{ index, op,
  entryId, entryCode, optionId?, optionLabel?, effect }] }`.
- Errors use the kit's safe payload (`kind`, `code`, message) with its status mapping.

### StudioFlow composer door (behavioural contract)

`createStudioFlowScheduleComposer(db, ports)` returning:
`listProjects(ctx)`, `readContext(ctx & {projectId})`, `searchBrands(ctx & {query})`,
`searchReusableOptions(ctx & {projectId, query, section?})`,
`previewBatch(ctx & {projectId, operations})`,
`applyBatch(tx, ctx & {projectId, operationId, digest, operations})`, where `ctx` is
`{ grants, actor }` built from the integration principal. Access checks for apply
run on `tx`. The operation types are the composer's own plain types; the extension
maps its zod output onto them.

### MCP bridge tools

| Tool | Read-only | Calls |
|---|---|---|
| `list_projects` | yes | `GET projects` |
| `get_schedule_context` `{projectId}` | yes | `GET …/context` |
| `search_brands` `{query}` | yes | `GET brands` |
| `search_reusable_options` `{projectId, query, section?}` | yes | `GET …/reusable-options` |
| `preview_schedule_changes` `{projectId, operations}` | yes (no write) | `POST …/preview`; on success returns the preview plus `operationId` (new UUID) and `digest` |
| `apply_schedule_changes` `{projectId, operationId, digest, operations}` | **no** | `POST …/apply` with `Idempotency-Key: operationId` and a deterministically serialized body, then `GET …/context` and returns the saved entries the batch touched (read-back); if the read-back fails it says the apply succeeded and the read-back did not |

Tool input schemas mirror the wire schema; tool annotations set `readOnlyHint`
correctly. The server instructions/tool descriptions state the required flow
(context → preview → show the user → explicit approval → apply → show read-back) and
that codes, labels and Brand snapshots come from StudioFlow.

## UI Contract

Minimal wiring only: the Account page token form lists the two new scopes (with the
labels in decision 12) when the user holds the grant and the module is on; nothing
else. No new StudioFlow screen. The Lead owns any later UI (e.g. an "AI-composed" hint
in History).

## Boundaries and Non-goals

- Not in V1: delete, final/unfinal, samples, image upload/removal, card fields,
  reorder/move/category change, global template/prefix edits, Master Data writes,
  multi-project batches, HTTP/remote MCP transport, OAuth, any model call or provider
  key, any UI beyond the scope list.
- No change to the kit's behaviour, to existing schedule rules, or to existing
  migrations. No new dependency in the root `package.json`.
- No auto-final, no auto-apply, no background jobs.

## Acceptance Criteria

Server (integration tests against the rebuild test DB, real kit routes):

1. Module off → every route refuses (grant filtered out) and the scopes are not
   offered; module on → Platform Owner can create a token with both scopes.
2. Auth/scope: no/invalid/revoked/expired token 401; read-only token gets 403 on
   apply; token whose user lost the permission or `schedule.manage` is refused live.
3. Project access: outsider (not assigned, not manager) refused on context and on
   preview/apply; manager without override can read context but preview/apply is 403;
   archived and completed projects refused on preview and apply.
4. Preview writes nothing: entry/option/audit/idempotency counts identical before and
   after, including a preview that applies templates and allocates codes.
5. Preview of an invalid batch returns all issues with indexes (unknown Brand with
   suggestions, qty on Material, bad section, entryId from another project, duplicate
   update, bad `entryRef`) in one response.
6. Apply of a valid previewed batch: codes/labels equal the preview's; new options are
   not final and `DRAFT`; Brand name is the Master Data snapshot; audit rows carry
   `via` and `operationId`; read-back DTO matches.
7. Rollback: a batch whose later operation fails at apply after earlier operations
   succeeded (e.g. the Brand of operation 3 archived in Master Data after the preview,
   which the schedule fingerprint does not cover) leaves no entry, option or StudioFlow
   audit row, and stores the 4xx for that key.
8. Stale preview: a schedule change between preview and apply → 409
   `SCHEDULE_PREVIEW_STALE`, nothing written.
9. Idempotency: exact retry returns the same body with `Idempotency-Replayed: true`
   and creates nothing new; same key + different body → 409.
10. Concurrency: two different batches applied concurrently on one project never
    produce a duplicate code (either both succeed with distinct codes or one returns
    stale-preview 409).
11. Update patch: omitted fields unchanged, `null` clears, unchanged patch reports
    `no_change` and writes no audit; image, label, final flag untouched.
12. Reads never return signed URLs or storage keys (assert on the serialized JSON).

Bridge (automated, `node --test` inside the package):

13. Spawned over stdio with an MCP client: initialize, `tools/list` returns exactly the
    six tools with correct `readOnlyHint`; each tool calls the right path with the
    bearer header against a local fake HTTP server; apply sends `Idempotency-Key` and
    a byte-identical body on retry, then performs the read-back GET; a non-https,
    non-localhost `STUDIOFLOW_URL` is refused at start; the token never appears in
    stdout/stderr.

Docs:

14. `docs/apps/schedule-assistant/CONTRACT.md` (wire contract, decisions 10–22, error
    codes) and `tools/schedule-assistant-mcp/README.md` with copy-ready setup for
    Claude Code, Codex, OpenCode and Gemini CLI (each checked against that client's
    current documentation) and the "do not auto-approve apply" warning.
    `docs/apps/platform/INTEGRATIONS.md`, `MODULES-DECISION.md` module list and the
    StudioFlow permission vocabulary are updated.

## Verification

High tier per `docs/agent/VERIFICATION.md`, run with the location's env
(`STUDIOFLOW_LOCATION=<rumah|kantor> node scripts/verify.mjs --tier high`):
boundaries, legacy-runtime, whitespace, typecheck, lint, full `npm test` against
`studioflow_rebuild_test` (no migration in this plan, but confirm both DBs are at the
current head first), Prisma generate, production build. Plus
`npm --prefix tools/schedule-assistant-mcp ci` and `npm --prefix
tools/schedule-assistant-mcp test`. New tests: an integration suite for the routes
and composer covering criteria 1–12 (next to the extension, e.g.
`src/apps/schedule-assistant/*.integration.test.ts`), composer unit tests for patch
merge and fingerprint/digest canonicalisation, module/permission registration tests
(`module-gates.integration.test.ts` consumers, registry and role-profile tests must
still pass with the new permission absent from profiles), and the bridge tests
(criterion 13). Affected consumers to re-run explicitly: Ideas bridge tests
(shared schedule writer), schedule regression/service suites, integrations kit suite,
Account page action tests. e2e: not required (no user-facing flow beyond the scope
list). Per-command timeout 15 min. Never run against owner data; disposable test DB
only.

Safe checkpoint if interrupted: commit nothing partial; the composer door with its
tests is the first coherent unit, routes second, bridge third. If the session must
stop, report which units pass and leave the tree uncommitted for the Lead.

## Reviewer Acceptance

Lead/owner, after the commit, on the dev server (:3001) with the module switched on:
create a token with both scopes; connect each of Claude Code, Codex, OpenCode and
Gemini CLI to the bridge using the README configs; in each, `list_projects` and
`get_schedule_context` on a test project; in one client, compose from a short brief
(apply templates + two new entries + one extra option + one option update), confirm the
preview is shown and the client asks before apply, apply, and check the Schedule screen
shows the same codes/labels with nothing final; repeat apply → replay, no duplicates.

## Regression Risks and Recovery

- Shared writer: the composer must call the existing writer, not fork it; the Ideas
  bridge tests guard this.
- Transaction length: 100 operations inside one serializable transaction must finish
  well under 30 s; the integration test measures a 100-operation batch.
- A permission id added to the registry must not leak into built-in profiles; the
  role-profile test guards it.
- Recovery: disable the module (Developer console) to cut every route at once;
  revoke tokens on the Account page. Writes are ordinary audited schedule rows.

## Executor Prompt

You are the Backend Executor. Location: ask the owner (rumah or kantor) and load that
env file. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, `docs/agent/EXTENSIONS.md`, and
this `PLAN.md` (WO-SCHEDULE-ASSISTANT-01), then implement the entire READY outcome and
nothing beyond it: the `schedule-assistant` optional module, the StudioFlow schedule
composer public door, the two token scopes and module permission, the six integration
routes, the standalone `tools/schedule-assistant-mcp` stdio bridge, the contract and
four-client setup docs, and all listed tests. Inspect current repository evidence,
preserve unrelated owner work (e.g. the generated `next-env.d.ts`), run the high-tier
gate plus the bridge package tests, update `CHANGELOG.md`, and create the target local
revision commit (R9.167 unless the ledger or any branch shows it taken). Stop only for a
material locked-decision conflict or unsafe boundary, using the BLOCKED / CONFLICT
report; otherwise report the commit, checks, limitations, and remaining unrelated
dirty files. No push.
