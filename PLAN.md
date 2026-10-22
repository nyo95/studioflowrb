# Active Plan

Plan ID: WO-SCHEDULE-ASSISTANT-02
Scope: Schedule Assistant guardrails: a mandatory interview before any preview, apply bound to a preview made in the same bridge session, and a bridge-side human approval before apply.
Module(s): `schedule-assistant` bridge only (`tools/schedule-assistant-mcp/`); docs. No StudioFlow, platform, schema or route change.
Target revision: R9.174 (this plan is R9.173). Re-check `CHANGELOG.md` and all branches.
Risk: medium - changes the only write path of an external client; a wrong guard either blocks legitimate applies or lets an unreviewed batch through. Escalate if a guard needs a server-side change.
Status: DONE in R9.174 — owner walk pending (BACKLOG [UNVERIFIED]). Executed by the Lead (owner, 2026-10-22).
Priority: P0 follow-up of WO-SCHEDULE-ASSISTANT-01
Owner: Product Owner (decision 2026-10-22: all three layers)
Last updated: 2026-10-22

Plan reconciliation: `WO-BQ-ASSEMBLY-SOURCE-01` is DONE in R9.170 (browser walk owed);
`WO-REL-READINESS-01` stays parked in `docs/agent/queued-plans/`.

## Outcome

Whatever AI client is used (Claude, Codex, OpenCode, Gemini), the Schedule Assistant
behaves like an assistant: it asks which project and what the user wants before it
proposes anything, it can only apply a preview it made and showed in this session, and
in clients that support it StudioFlow's bridge itself asks the user "apply N changes to
<project>?" before anything is saved.

## Locked Decisions

1. (Owner) **Layer 1 — interview.** The server instructions and every tool description
   carry one protocol: (a) confirm the project, asking when the brief matches more than
   one or none; (b) ask what the user wants (studio templates or not, which categories,
   client-chosen Brands); (c) ask for missing facts (Fixture qty/unit, a Brand not in
   Master Data with the suggestions); (d) summarise the plan in plain words; then (e)
   preview, show it, and wait for an explicit yes. Questions are asked in the user's
   language. An MCP prompt `susun_jadwal` (optional `proyek`, `permintaan`) starts this
   interview in clients that list prompts.
2. (Owner) **Layer 2 — session-bound apply.** The bridge remembers each valid preview it
   returned (operationId → project, digest, canonical operations, summary). Apply is
   refused with `APPLY_NOT_PREVIEWED` unless the operationId was issued by this bridge
   process for the same project, digest and operations. A refused apply makes no HTTP
   call. An exact retry of an issued operation stays allowed (idempotent replay).
3. (Owner) **Layer 3 — bridge-side approval.** When the connected client declares the
   MCP `elicitation` capability, apply first sends a form elicitation: a plain summary
   (project name, counts of new items/options/updates/template rows, first codes) and one
   required boolean "Ya, terapkan". Only `accept` with `true` proceeds; decline, cancel,
   false or an elicitation failure saves nothing and tells the AI the user did not
   approve. Clients without the capability fall back to their own tool approval
   (unchanged). Support found 2026-10-22: Claude Code ≥ 2.1.76, Codex CLI ≥ ~0.119,
   OpenCode listed by third parties, Gemini CLI unconfirmed — the bridge decides at run
   time from the declared capability, never from the client's name.
4. (Lead) No StudioFlow change: the server already enforces previewed-only through the
   digest; these layers sit in the bridge. No new dependency.

## Acceptance Criteria (bridge tests over real stdio)

1. Apply without a preview in this session → tool error `APPLY_NOT_PREVIEWED`, no apply
   request; apply with an issued operationId but different operations or project →
   refused the same way.
2. Elicitation-capable client, accept + true → apply request sent; the message names the
   project and a projected code. Decline / cancel / false → no apply request, a
   "not approved, nothing saved" result.
3. Client without elicitation → apply proceeds after a valid preview (fallback).
4. `prompts/list` includes `susun_jadwal`; `prompts/get` returns the interview text with
   the given project and request; server instructions contain the interview steps.
5. Existing bridge behaviour stays: six tools, read-only hints, Idempotency-Key with a
   byte-identical body on retry, read-back, token never in output.

## Verification

Bridge: `npm --prefix tools/schedule-assistant-mcp test`. Repo: low gate
(`STUDIOFLOW_LOCATION=kantor node scripts/verify.mjs --tier low`) for the touched docs
(no app code changes). Live smoke against the kantor dev server with the configured
Claude token: read + preview only.

## Reviewer Acceptance

Owner: in a new Claude or Codex session ask "susun jadwal untuk Sociolla" — the
assistant asks which project and what to add; after the preview, applying shows the
bridge's "Ya, terapkan" dialog (Claude/Codex); declining saves nothing.

## Executor Prompt

Executed by the Lead in this session; no Executor handoff.
