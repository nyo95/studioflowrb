# SF-RF Addendum — owner decisions, documentation cleanup, phase palette

Applies after R8.74 is committed. Items A and B go into the SF-RF commit (R8.75).
Item C is a separate small slice after SF-RF (R8.76). Local commits only; push later only when the owner says so.

## A. Owner decisions (2026-09-15) — record them

| Topic | Decision | Where to record |
|---|---|---|
| MOM "Plain" note shows no number and does not advance numbering | **Approved** | Contract §10 implementation notes: change "UX change vs legacy (proposal, confirm at acceptance)" to "approved by the owner 2026-09-15" |
| Phase accent palette (contract §13.8) | **Approved** — implement as item C | Contract §13.8: replace "Proposed, pending owner approval" with "Approved 2026-09-15"; roadmap: move the wave-2 line to a new wave-1 follow-up item "SF-R4 — Phase accent palette" |
| Stored-file retention and Google Drive activation | **Deferred** | roadmap Platform "Decision gates": mark both as deferred by owner 2026-09-15 (keep unchecked); knownbug KB-002 status "Deferred by owner" |
| Push `studioflow/contracts` to origin | **Later, done by Codex on owner instruction** | No doc change; do not push in SF-RF |

## B. Documentation cleanup (stale after the legacy rework)

1. `docs/knownbug.md`
   - Set the per-item status of KB-013, KB-014, KB-015, KB-016, KB-017, KB-018, KB-023 to
     "Closed in R8.71 as superseded (rebuild StudioFlow archived; see rework note)" and move them under `## Closed`.
   - Fix the link to `apps/studioflow/studioflow-project-contract.md` → `archive/studioflow-rb/studioflow-project-contract.md`; plain mentions in KB-021/KB-022 may stay as text.
   - KB-002: rewrite "Observed" for the current MOM (photos stored through `ObjectStorage`, removed on replace/delete; no long-term retention/reconciliation policy) and set status "Deferred by owner (2026-09-15)".
   - Update the ledger header "reconciled through" revision.
2. `docs/README.md`
   - "Active sequence": replace the 2026-09-10 list with the current order: SF-RF → SF-R4 palette → pending verifications (Master Data Supplier Category, BQ-F1…F5) → roadmap backlog. Remove the "StudioFlow … KB-013…KB-017" line.
   - Index: mark `alignment.md` as archived (see 3).
3. `docs/alignment.md` describes the archived rebuild model (iterations, global Product Catalogue). `git mv` it to `docs/archive/studioflow-rb/alignment.md`, add a one-line superseded banner pointing to the rework contract, fix links.
4. `docs/roadmap.md`
   - "Historical implemented or removed evidence": replace references to SF-A…SF-F / D-SF / SF-C with "superseded by the legacy rework (R8.70+)".
   - Master Data: remove "Product Catalogue remains independently StudioFlow-owned" (catalogue no longer exists; Product Schedule is project-owned).
   - UI Engine: annotate the `FileDropZone` and rich-text/MOM lines as historical (the archived StudioFlow was the consumer; the reworked MOM uses plain notes).
   - After SF-RF passes: tick SF-R1, SF-R2, SF-R3, SF-RF with revision numbers.
5. `docs/UTILITY-INVENTORY.md`: remove or rewrite rows that point to deleted files (`src/apps/studioflow/service.ts` slug formatter, `src/app/(platform)/studioflow/[id]/…`, "StudioFlow catalogue table"); add current StudioFlow consumers only if they exist.
6. UI Engine consumers: `FileDropZone` and `CopyButton` now have no app consumer. Per UI_ENGINE deferred-pattern rules, record them in `UI_ENGINE.md` as "exported, no active consumer since R8.71 (kept; next consumer: wave-2 deliverables / TBD)". Do not delete code in SF-RF.
7. `docs/review.md`: leave Master Data Supplier Category and BQ-F1…F5 as "Ready for review" but add "scheduled after SF-RF" so they are not forgotten.

## C. SF-R4 — Phase accent palette (after SF-RF)

Goal: StudioFlow stops reading as generic slate; each phase has a restrained, recognisable accent.

- **UI Engine (domain-neutral):** add five categorical accent token pairs to `src/platform/ui_engine/tokens/tokens.css` and Tailwind theme names in `globals.css`, e.g. `--ui-accent-1 … --ui-accent-5` (solid, for dots/bars) and `--ui-accent-1-surface … --ui-accent-5-surface` (tinted background). Names must not mention phases. Check WCAG AA: text on `-surface` ≥ 4.5:1, dots/bars ≥ 3:1 against `--ui-surface`. Document them in `UI_ENGINE.md` and `DESIGN.md` (DESIGN.md stays authoritative; keep hues muted, consistent with the existing warm neutral palette).
- **UI Engine components:** if `PipelineStrip` / `ContextNavLink` cannot take an accent today, add one optional generic prop (e.g. `accent?: 1 | 2 | 3 | 4 | 5`) with tests, rather than styling them from the app.
- **StudioFlow (app-owned mapping):** `domain/phase.ts` maps Moodboard → 1, Layout Plan → 2, 3D Design → 3, Construction Drawing → 4, Supervision → 5. Use the accent only for: the project `PipelineStrip` step marker, the phase rail dots in the project navigation (status colour stays for state — accent is an extra thin left bar or ring, not a replacement), the phase page header chip, and Today task rows' phase tag. Status meaning (warning/success/danger) must remain readable without colour.
- **Tests:** UI Engine token export test; a StudioFlow domain test that every phase key has an accent; visual check at 1440 px and 375 px.
- **Commit:** `R8.76 | feat(studioflow): phase accent palette (SF-R4)`.
