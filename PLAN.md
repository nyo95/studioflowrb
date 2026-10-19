# Active Plan

Plan ID: WO-REL-READINESS-01
Scope: Close the post-takeover production-readiness gate. Engineering work is complete through R9.162; what remains is owner acceptance on real data and owner-only remote decisions.
Module(s): StudioFlow, Master Data, BQ, Platform (acceptance only; no code change is authorised by this plan).
Target revision: none until a FAIL produces a correction plan.
Risk: high for release — real-data acceptance and push/deploy are outside the agents' authority.
Status: BLOCKED (owner)
Priority: P1
Owner: Product Owner
Last updated: 2026-10-19

## Outcome

The owner walks the pending browser-acceptance items on real data, authorises the push of R9.161–R9.162, and decides when to deploy.

## Context and Evidence

- WO-SF-ROLE-PROFILES-01 (R9.160) was implemented by the acting Lead; the Lead review in R9.161 accepted it with the full high gate as its evidence.
- R9.161 repaired the verification harness and four stale/order-dependent e2e specs; R9.162 closed the review findings (service-level access for phase detail and Deliverables, sample receipt race, Timeline Table milestones, Deliverables Upload gating, UI Engine controls, Design-Handover copy, phase-name truncation).
- Final gate on the R9.162 tree: full tests, typecheck, lint, boundaries, legacy-runtime, Prisma generate, production build and full e2e (see R9.161/R9.162 in `CHANGELOG.md`).

## Locked Decisions

- No push, tag, PR, merge or deployment without a separate explicit owner instruction (AGENTS).
- Browser items already marked PASS are not re-run without a regression reason.

## Owner actions (in order)

1. Authorise pushing R9.161–R9.162 (they exist only in this session's local checkout until pushed).
2. At `kantor`, pull, run `prisma migrate deploy` on both rebuild databases (R9.152 and R9.160 migrations included), restart `next dev`.
3. Walk `docs/agent/BROWSER-ACCEPTANCE-BACKLOG.md` pending items, highest value first: [R9.162], [R9.160] roles, [R9.152] Timeline, [R9.158] Deliverables, R9.99/R9.100 sample/pricing; and run the office-only `bq-boq-walk` e2e with the local workbook.
4. Report PASS/FAIL per item to the Lead; a FAIL becomes the next correction plan.

## Verification

Reviewer acceptance only. Any correction returns to the normal Lead/Executor loop with its own risk tier.

## Executor Prompt

None — no Executor work is authorised until the owner reports an acceptance FAIL or approves new work.
