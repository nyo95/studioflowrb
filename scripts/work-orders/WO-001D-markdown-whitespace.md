# WO-001D — Baseline Markdown Whitespace Correction

Owner: PM/TL
Executor type: independent deterministic coding executor
Status: COMPLETE — incorporated into accepted baseline commit 2026-08-23

## Objective

Remove only the trailing Markdown whitespace that blocked `git diff --cached --check` during WO-001C, without changing wording, structure, decisions, or any non-Markdown file.

## Context

WO-001C staged 84 valid files and stopped before commit because `git diff --cached --check` reported 38 trailing-whitespace findings. The repository still has no commit. The staged index may remain populated.

## Source files

- WO-001C executor report;
- `git diff --cached --check` output;
- Markdown files currently staged in the repository.

## Target files

Only Markdown files named by the current `git diff --cached --check` output. At the time of escalation these are:

- `CORE.md`
- `DESIGN.md`
- `UI_ENGINE.md`
- `docs/08-CURRENT-STATUS.md`
- `docs/09-EXECUTION-PLAN.md`
- `docs/10-UI-CONTRACT-AUDIT.md`
- `docs/11-CORE-CONTRACT-AUDIT.md`
- `scripts/work-orders/WO-001-toolchain-baseline.md`
- `scripts/work-orders/WO-001A-baseline-hardening.md`
- `scripts/work-orders/WO-001B-next-tsconfig-correction.md`
- `scripts/work-orders/WO-001C-repository-baseline.md`
- `scripts/work-orders/WO-001D-markdown-whitespace.md` if needed
- `scripts/work-orders/WO-002-category-pure-rules.md` through `WO-009-core-audit.md`

## Locked decision

Trailing spaces used as Markdown hard breaks are not semantically required in these status/header lines. Remove them; do not replace them with HTML or alter document content.

## Exact allowed changes

1. Re-run `git diff --cached --check` to obtain the authoritative current locations.
2. Remove spaces/tabs occurring only at end-of-line on those reported Markdown lines.
3. Stage the corrected Markdown files and this correction work order.
4. Re-run the checks below.

## Forbidden changes

- No wording, punctuation, heading, list, blank-line, code, config, source, package, lockfile, schema, Git config, branch, remote, or generated-file change.
- No commit; WO-001C remains responsible for the baseline commit after this correction passes.
- Do not perform a broad formatter rewrite.
- Do not unstage or remove valid files from the index.

## Acceptance criteria and checks

- `git diff --cached --check` exits 0.
- A whitespace-insensitive comparison shows no semantic line-content changes beyond removal of end-of-line whitespace.
- `npm test`, `npm run typecheck`, and `npm run check:boundaries` pass.
- The staged file set still contains all intended baseline files and no ignored/generated/secret file.
- Report exact files and number of lines corrected.

## Stop / escalation conditions

- Any `git diff --cached --check` failure is not trailing whitespace in an allowed Markdown file.
- Fixing a line would require changing visible content or structure.
- The staged file set changes unexpectedly.
