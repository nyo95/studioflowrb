# WO-001C — Repository Baseline Checkpoint

Owner: PM/TL
Executor type: independent deterministic coding executor
Status: READY

## Objective

Create the first local Git commit containing the reviewed rebuild scaffold, locked contracts, work orders, and approved WO-001 toolchain baseline. This enables isolated executor worktrees and conventional diff review.

## Exact scope

Repository only: `D:\Projects\studioflow-rebuild`.

## Source files

- current repository working tree after PM-approved WO-001, WO-001A, and WO-001B;
- `.gitignore`;
- `scripts/work-orders/WO-001*.md`;
- `docs/09-EXECUTION-PLAN.md`.

## Target

- Git index and one local commit on current `main`.

No working-tree file content may be edited by this work order.

## Locked decisions

- Commit message: `chore: establish rebuild baseline`
- No remote is created or contacted.
- No branch is created, renamed, or deleted.
- Ignored/generated/cache/secret files must not be committed.

## Exact allowed actions

1. Verify repository root is exactly `D:/Projects/studioflow-rebuild` and branch is `main`.
2. Run the acceptance checks below before staging.
3. Stage all non-ignored repository files with `git add -A`.
4. Inspect the complete staged file list.
5. Commit only if the staged set is clean and matches this work order.
6. Report commit hash and staged/committed file count.

## Forbidden actions

- No file edits, formatting, generation, deletion, or movement.
- No `.env`, real secret, `node_modules`, `.next`, `src/generated`, `*.tsbuildinfo`, log, coverage, or dist file in the commit.
- No Git config change, remote, push, tag, merge, rebase, or additional commit.
- Do not stage anything outside the exact repository root.

## Acceptance criteria and checks

Before staging:

- `npm test`
- `npm run typecheck`
- `npm run check:boundaries`
- `npx prisma validate`
- `npm run build`

After staging, verify:

- `git diff --cached --name-only` contains only intended repository source/docs/config/lock files;
- all ignored/generated/cache/secret paths listed above are absent;
- `git diff --cached --check` passes;
- staged `package.json` uses Next 16.3.2 and has `postinstall`;
- staged `tsconfig.json` has the two approved Next corrections;
- staged `.gitignore` contains generated Prisma and `*.tsbuildinfo` rules.

After commit:

- `git status --short` is empty;
- `git log -1 --oneline` shows the exact commit message;
- `git rev-parse --show-toplevel` remains the rebuild repository.

## Stop / escalation conditions

- Git author identity is missing or would require changing Git configuration.
- Any acceptance command fails.
- Any unexpected, secret, parent-repository, generated, or cache file is staged.
- Working-tree content changes during this work order.
- Commit hooks request additional changes.
