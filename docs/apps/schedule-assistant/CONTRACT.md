# Schedule Assistant contract (v1)

Status: ACTIVE (R9.167, WO-SCHEDULE-ASSISTANT-01; `finalize_option` added in R9.178,
WO-SCHEDULE-ASSISTANT-03, module 1.1.0). Owner decisions 2026-10-22; Lead decisions 10–22 in
that Work Order.

## Module

- `schedule-assistant` 1.0.0, `kind: "optional"`, parent and requires `studioflow`,
  `initialState: "DISABLED"` (only the Developer switches
  it on).
- Owns permission `studioflow.schedule-assistant.use` (in no built-in role profile; the
  Platform Owner holds it while the module is on). Disabling the module removes the grant
  everywhere at once.
- Stores no data in v1: idempotency lives in `platform.integration_request`, history in
  the platform audit. The first stored data adds `prisma/schema/schedule-assistant.prisma`
  with its own Postgres schema (MODULES-DECISION D8).
- Integration-only: no screen, no `public/nav.ts`; listed in `INTEGRATION_ONLY_APPS` of
  `scripts/check-boundaries.mjs`.
- Reaches StudioFlow only through its server-only public door
  `src/apps/studioflow/public/schedule-composer.ts` (composed in
  `schedule-composer-runtime.ts`, not exported from the client-safe `public/index.ts`); StudioFlow calls no AI model and
  stores no provider key.

## Tokens and access

| Scope | Allows |
|---|---|
| `schedule-assistant:read` | the four reads and preview |
| `schedule-assistant:write` | apply |

Both map to grant `studioflow.schedule-assistant.use`. Identity and live grants come only
from the token. Reads also require project detail access (assigned Designer/Drafter or
StudioFlow Manager). Preview and apply also require the Schedule screen's write rule:
`studioflow.schedule.manage`, assigned PIC or override holder, project not archived and
not completed. A manager without override reads but cannot apply.

## Routes (`/api/integrations/v1/schedule-assistant/…`)

| Method + path | Scope | Result |
|---|---|---|
| `GET projects` | read | `[{ id, name, status, canApply }]` (max 200, not archived) |
| `GET projects/{id}/context` | read | `{ project, baseFingerprint, entries, categoryChoices, templatesNotApplied }` |
| `GET brands?q=` | read | `[{ id, name }]` active Master Data Brands (q 2–80 chars, max 20) |
| `GET projects/{id}/reusable-options?q=&section=` | read | options of other projects (max 20, no image) |
| `POST projects/{id}/preview` | read | dry run: `{ valid: false, issues }` or `{ valid: true, digest, baseFingerprint, templatesCreated, operations, warnings }` (R9.176: `SCHEDULE_CATEGORY_SIMILAR` when a new category looks like a studio one; not blocking) |
| `POST projects/{id}/apply` | write | `{ operationId, applied, templatesCreated, operations }`; needs `Idempotency-Key` |

Every response uses the integration kit envelope `{ ok, data | error: { kind, code,
message } }`. Reads never contain storage keys or signed URLs; an option shows `hasImage`.
Bodies are limited to 256 KiB and 1–100 operations.

## Operations (`src/apps/schedule-assistant/contract.ts`, strict)

| `op` | Fields | Rule |
|---|---|---|
| `apply_templates` | — | only first, once; adds every active studio template item not yet in the project |
| `create_entry` | `ref?`, `section`, `category`, `qty?`, `unit?`, `location?`, `option?` | `qty`/`unit` Fixture only; a new category is allowed and flagged `newCategory` |
| `update_entry` | `entryId`, `qty?`, `unit?`, `location?` | only sent fields change; once per entry |
| `create_option` | `entryId` or `entryRef`, `option` | next label; never final |
| `reuse_option` | `entryId` or `entryRef`, `sourceOptionId` | copies an option of another project (photo and notes included); never final |
| `update_option` | `optionId`, `patch` | patch: sent fields change, `null` clears, `productName` cannot be cleared; photo, label, final flag and status never change; once per option |
| `finalize_option` | `optionId` | the client's final decision on one existing option of this project: it becomes final/approved and the item's other options become not used (same as Set as final on the Schedule screen, one audit row with `via`/`operationId`); once per option; already final = `no_change`; the result shows `productName` and `displacedOptions`; no ref, so not for an option created in the same batch |

`option = { brandId?, brandName?, productName, color?, pattern?, finishing?, dimension?,
notes?, extra? }`. `brandId` must be an active Master Data Brand; `brandName` is only a
hint from the brief and always produces `SCHEDULE_BRAND_NOT_FOUND` with up to five
suggestions. No Master Data write, no image, delete, un-finalize, sample, card field,
reorder, category move or global template/prefix change exists. Final decisions have no
"all", filter or pattern form: each option is named by id.

## Preview, digest, apply

1. Preview checks access, reads `baseFingerprint` (hash of the project's entries and
   options with their `updated_at`, the active template items, and the archived/completed
   state), validates the whole batch and returns all issues; otherwise it runs the batch
   through the StudioFlow schedule writer in a transaction that is always rolled back.
2. `digest = sha256(canonical JSON { v: 1, projectId, operations, baseFingerprint })`.
3. The bridge gives each valid preview a new `operationId` (UUID). Apply sends
   `{ operationId, digest, operations }` with `Idempotency-Key: operationId`.
4. Apply runs in the kit's one serializable transaction: access, fingerprint, digest
   check (`409 SCHEDULE_PREVIEW_STALE`, nothing written), validation, writes. A failed
   operation fails the whole batch (`Operation N (op): …`). Schedule rows, StudioFlow audit
   rows (`metadata.via = "schedule-assistant"`, `operationId`), the idempotency record and
   the `integration.write` audit commit together.
5. An exact retry replays the stored answer (`Idempotency-Replayed: true`); the same key
   with another body is `409 IDEMPOTENCY_KEY_REUSED`. A stored 4xx (e.g. stale) replays
   too, so preview again for a new `operationId`.
6. Human approval is the client's tool prompt; the server enforces previewed-only (digest)
   and the write scope.

## Error codes

`SCHEDULE_PREVIEW_STALE`, `SCHEDULE_TEMPLATES_FIRST`, `SCHEDULE_CATEGORY_REQUIRED`,
`SCHEDULE_ENTRY_REF_DUPLICATE`, `SCHEDULE_ENTRY_REF_INVALID`, `SCHEDULE_ENTRY_NOT_FOUND`,
`SCHEDULE_OPTION_NOT_FOUND`, `SCHEDULE_DUPLICATE_UPDATE`, `SCHEDULE_QTY_NOT_FOR_MATERIAL`,
`SCHEDULE_QTY_INVALID`, `SCHEDULE_PRODUCT_REQUIRED`, `SCHEDULE_BRAND_NOT_FOUND`,
`SCHEDULE_REUSE_SOURCE_INVALID` (finalize reuses `SCHEDULE_OPTION_NOT_FOUND` and `SCHEDULE_DUPLICATE_UPDATE`), plus the kit's `INTEGRATION_*`/`IDEMPOTENCY_*` codes and
StudioFlow's `PERMISSION_DENIED`, `PROJECT_ARCHIVED`, `PROJECT_COMPLETED`.

## Bridge

`tools/schedule-assistant-mcp/` (standalone Node ≥ 20 package, stdio, pinned
`@modelcontextprotocol/sdk` 1.32.1 and `zod` 3.25.76; never imported by the app). Tools:
`list_projects`, `get_schedule_context`, `search_brands`, `search_reusable_options`,
`preview_schedule_changes` (all read-only) and `apply_schedule_changes`. Setup for Claude
Code, Codex, OpenCode and Gemini CLI is in its README.

Guardrails (R9.174, WO-SCHEDULE-ASSISTANT-02): server instructions and the `susun_jadwal`
prompt carry a mandatory interview (confirm project, intent, missing facts, summary, then
preview and an explicit yes); the bridge applies only an operationId it issued from a valid
preview in the same process for the same project, digest and canonical operations
(`APPLY_NOT_PREVIEWED` otherwise, no HTTP call; a stale-preview 409 forgets it); and when
the client declares MCP `elicitation` it asks the user in a form dialog (boolean
`setuju`) before calling apply, saving nothing on decline, cancel, false or dialog failure.
Clients without elicitation keep their own tool approval, except for a batch that contains
`finalize_option` (R9.178): the bridge refuses it (`FINAL_NEEDS_CONFIRMATION_DIALOG`, no HTTP
call), because a client's tool approval can be switched to automatic. The final-decision
dialog names every finalized item code and option and says the item's other options become not
used; the interview tells the AI to list them and ask about final decisions on their own.
