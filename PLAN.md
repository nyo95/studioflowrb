# Active Plan

Plan ID: WO-REPAIR-20261003
Scope: Eight locked backend correction packages supplied by the Lead after R8.316. Backend and minimal functional wiring only.
Target revisions: R8.317 through R8.324, one local commit per package.
Status: READY
Priority: P0
Owner: Product Owner; decisions locked in the 2026-10-03 Executor handoff.

## Outcome

1. StudioFlow Today retains converted supervision checklist work and project completion cannot bypass readiness.
2. Master Data distinguishes Rp0, By Request, and quoted text prices, including BQ snapshots.
3. BQ rejects genuinely missing component prices and cross-project entity operations.
4. Optional Master Data fields retain omitted values while allowing explicit clearing.
5. Every StudioFlow storage-delete failure enters the existing retry registry.
6. Master Data workbook preview/apply detects duplicate targets and stale database state.
7. Messenger reads newest messages first with safe pagination and cleans partial uploads.
8. CI and recovery guidance protect the rebuild without application behavior changes.

## Locked boundaries

- BQ remains frozen except the two integrity repairs above. No BQ versioning, approval, performance work, or refactors.
- Completion override is project-manage only, requires a written reason, and is audited.
- Existing ambiguous zero rows remain numeric Rp0; report their count.
- Reuse the StudioFlow asset-cleanup registry. Do not create another cleanup abstraction.
- No remote action is authorized. Each package requires regression coverage, the required checks, a changelog entry, and one local commit.

## Execution order

WO-1 StudioFlow Today and completion; WO-2 Master Data price state; WO-3 BQ integrity; WO-4 partial updates; WO-5 cleanup registry; WO-6 workbook integrity; WO-7 Messenger; WO-8 CI and recovery.

## Executor Prompt

You are the Backend Executor. Location: rumah. Implement this READY repair batch exactly in the locked order, preserving unrelated work. Use only the selected rebuild databases after verifying their targets. Make revisions R8.317-R8.324 as applicable, one local commit per completed work order. Run the mandatory checks before each commit and the full suite before the final package. End with one Planner/Reviewer prompt reporting every work order, commits, checks, injected-failure results, ambiguous price count, limitations, and dirty files.
