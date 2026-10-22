# Active Plan

Plan ID: WO-SCHEDULE-ASSISTANT-03
Scope: let the Schedule Assistant (MCP) mark an existing option as the client's final decision ("Set as final"), one named option at a time, behind the same preview, digest and confirmation as every other change.
Module(s): Schedule Assistant (contract, route validation, bridge); StudioFlow schedule composer door and schedule writer. No schema change.
Target revision: R9.178 (this plan is R9.177).
Risk: medium-high - first Assistant operation that records a client decision; a loose version could let an AI lock many rows from one sentence. Guarded by explicit option ids, preview and a visible count in the confirmation.
Status: DONE in R9.178 (executed by the Lead at the owner's request). Acceptance 8 (the 42 "(old)" materials, HT-04 excluded) is run with the owner on the dev database.
Priority: P1
Owner: Product Owner (decision 2026-10-22: "2, saya bisa kerja via AI app")
Last updated: 2026-10-22

## Context

The Assistant contract v1 deliberately had no final/unfinal operation. A Codex test on
project "2026-536 Sociolla SBZ The Breeze BSD Phase 2" needs it: mark the 42 older
materials tagged "(old)" as final, except HT-04. The owner wants to run such work through
an AI app, so the operation is added. The Schedule screen already does this with
`markFinal` (`src/apps/studioflow/schedule/service.ts`): the chosen option becomes
`is_final` + `APPROVED`, every other option of the same entry becomes `NOT_USED`, the
active index is synced and `studioflow.schedule.option-finalized` is audited.

## Locked Decisions

1. (Owner) The operation exists. Same safety as all other operations: preview, digest,
   explicit user approval, session-bound apply.
2. (Lead) One new operation `finalize_option { optionId }`. It targets an option that
   already exists in the project; an option created in the same batch cannot be finalized
   in that batch (no ref for options). No "all", "every", filter or pattern selector: the
   AI must name each option id from `get_schedule_context`.
3. (Lead) Un-finalize is NOT added; undoing a decision stays on the Schedule screen.
4. (Lead) Rules: once per option per batch (`SCHEDULE_DUPLICATE_UPDATE`); an unknown option
   is `SCHEDULE_OPTION_NOT_FOUND`; an option that is already final gives effect `no_change`;
   otherwise effect `update` with `changes { isFinal: false → true }` and the other options
   of that entry listed as becoming `NOT_USED` in the result so the preview shows what the
   decision displaces. Access rule is the same as every composer write (Schedule screen
   write rule); if the Schedule screen needs a stronger permission for final decisions,
   use that one instead and say so in the changelog.
5. (Lead) Audit: reuse the existing `option-finalized` action with
   `metadata.via = "schedule-assistant"` and `operationId`, written inside the batch
   transaction like the other operations. Extract the body of `markFinal` into the schedule
   writer (`writer.markFinal(tx, { actor, projectId, optionId, metadata })`, the same shape
   as `patchOption`) and have the existing service command call it. Behavior of the Schedule
   screen must not change.
6. (Lead) Visible risk: the bridge's confirmation dialog and the preview summary show a
   separate line "N keputusan final" (and the entry codes) whenever the batch finalizes
   anything; the interview text tells the AI to list every code it will finalize and to ask
   specifically about final decisions, even when the user already gave the instruction.
7. (Lead) Contract version: Schedule Assistant module 1.0.0 → 1.1.0 and the bridge to the
   next minor, per the repository's module version rule. `DIGEST_VERSION` stays 1 (adding an
   operation changes no existing digest).
8. Nothing else changes: no unfinal, no delete, no sample, no image, no card field, no new
   scope (still `read` for preview, `write` for apply).

## Work

- `src/apps/schedule-assistant/contract.ts`: add the strict `finalize_option` operation.
- `src/apps/studioflow/public/schedule-composer.ts`: type, `validate`, `execute`; result
  and preview show the displaced sibling options; no_change when already final.
- Schedule writer (`src/apps/studioflow/schedule/`): `writer.markFinal`; the screen's
  `markFinal` command delegates to it.
- `tools/schedule-assistant-mcp/bridge.mjs`: operation schema, summary line, confirmation
  wording, server instructions and `susun_jadwal` interview text (final decisions are now
  available but need their own explicit question); remove them from the "not available" list.
- Docs: `docs/apps/schedule-assistant/CONTRACT.md` (operations table, "no final/unfinal"
  sentence, error list if any), `tools/schedule-assistant-mcp/README.md`, module manifest
  version, `CHANGELOG.md`, `docs/BACKLOG.md` if a follow-up is found.
- Confirm that `get_schedule_context` already returns each option's id, label, product name
  and final flag so the AI can find the "(old)" rows; if a field is missing, add it
  (read-only, still no storage keys or URLs).

## Acceptance Criteria

1. Preview of `finalize_option` on a non-final option is valid, shows the entry code,
   option label, and which sibling options become not used; apply makes it final/approved,
   siblings not used, and writes one audit row with `via = "schedule-assistant"`.
2. Already-final option: preview `no_change`, apply writes nothing.
3. Unknown option, option of another project, or the same option twice in one batch:
   preview issues, nothing written.
4. Batch of finalize operations is all-or-nothing; a stale fingerprint still refuses apply.
5. A caller with only the read scope cannot apply; a user without the Schedule write rule
   or on an archived/completed project is refused, same as other operations.
6. Bridge: apply of an unpreviewed finalize batch is refused (`APPLY_NOT_PREVIEWED`); the
   confirmation dialog text contains the finalize count; summary shows "N keputusan final".
7. The Schedule screen's Set as final / undo behave exactly as before (existing tests pass).
8. Owner scenario, run after PASS on the dev database by the Lead with the owner: finalize
   the 42 "(old)" materials of the Sociolla SBZ project except HT-04, through the
   Assistant, and read the result back.

## Verification

High gate: schedule-assistant composer suite, schedule service tests, bridge tests
(`npm --prefix tools/schedule-assistant-mcp test`), full `npm test`, build, boundaries and
`scripts/verify.mjs --tier high` with `NEXT_DIST_DIR=.next-e2e`. Browser: none needed from
the Executor; the Lead checks the Schedule screen after commit. Acceptance 8 uses the
dev database only and is not an Executor task.

## Executor Prompt

Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, `docs/apps/schedule-assistant/CONTRACT.md` and
`PLAN.md` (WO-SCHEDULE-ASSISTANT-03). Implement exactly the plan for R9.178: add the
`finalize_option` operation to the Schedule Assistant (contract, composer door, schedule
writer extraction, bridge, docs, module version), with tests. Do not add un-finalize,
selectors for many options, new scopes or schema changes. Do not touch the dev database
data. Run the high gate, update `CHANGELOG.md`, make one local commit `R9.178 | feat(schedule-assistant): finalize option`, do not push. Reply only with a Planner/Reviewer
prompt: outcome, commit, checks, limitations, dirty files, request for verdict.
