# WO-003A — Enforcement Parser and Test Integration Correction

Owner: PM/TL
Executor type: external deterministic coding executor
Status: READY FOR EXTERNAL EXECUTOR — correction required for commit `d55c62d`

Mandatory shared context: `scripts/work-orders/00-EXTERNAL-EXECUTOR-CONTEXT.md`

Rebuild context: preserve the approved enforcement behavior from WO-003 while correcting only proven parser/test-integration defects. Do not redesign the dependency law.

## Objective

Correct WO-003's proven false positives and make its fixture suites remain part of the canonical test run after application/source tests are added.

## Exact scope

Surgical correction of commit `d55c62ddec98ba7e133bd8286cd278dd8d133d8d`. Preserve its dependency law, alias resolution, path classification, actionable messages, legacy availability command, and passing legal/illegal cases.

## Source files

- `scripts/work-orders/WO-003-boundary-enforcement.md`
- `docs/06-DATA-OWNERSHIP.md`
- `scripts/check-boundaries.mjs`
- `scripts/check-legacy-runtime.mjs`
- `scripts/test-boundaries-checker.mjs`
- `scripts/test-legacy-runtime-checker.mjs`
- `scripts/run-tests.mjs`
- `package.json`

## Target files

- `scripts/check-boundaries.mjs`
- `scripts/check-legacy-runtime.mjs`
- `scripts/test-boundaries-checker.mjs`
- `scripts/test-legacy-runtime-checker.mjs`
- `scripts/run-tests.mjs`
- `package.json` only if test-script wiring must change

## Locked decisions

1. Dependency rules remain exactly `app -> platform` and `app -> other-app/public`; `platform -> app` and cross-app internal imports remain forbidden.
2. Import extraction must be syntax-aware using the already-installed TypeScript compiler API. A third-party enforcement framework is not permitted.
3. Static string specifiers must be detected for import declarations, export-from declarations, import-equals external modules, dynamic `import()`, and `require()`.
4. Comment text and ordinary string contents that merely resemble import syntax are not imports and must not create boundary violations.
5. Legacy-runtime scanning remains resolution-aware. In TypeScript/JavaScript/config source it inspects active string-like values, not comments. In `.env*`, comment-only lines are ignored.
6. `check:legacy` remains the separate optional legacy-repository availability command.
7. The two WO-003 fixture suites must run through `npm test` even when one or more `src/**/*.test.ts(x)` files exist. Do not rely on Node's empty-argument auto-discovery behavior.

## Exact allowed changes

1. Replace regex-only import extraction with syntax-aware extraction while retaining the current exported checker API where practical.
2. Make legacy-runtime source/config scanning ignore comments without hiding actual active path values.
3. Add focused regression fixtures for every false-positive case listed in the acceptance criteria.
4. Update the repository test runner or package script wiring only enough to include the WO-003 fixture suites deterministically.
5. Preserve all previously passing WO-003 rejection and legal-import fixtures.

## Forbidden changes

- No dependency-law change, source import rewrite, application code change, or new dependency.
- No scan of documentation, `node_modules`, `.next`, generated clients, or build output.
- No removal or repurposing of `check:legacy`.
- No broad test-runner redesign or test framework.
- Do not touch `AGENTS.md`, `next-env.d.ts`, Prisma, app code, Core, UI Engine, or another work order.
- Do not amend or rewrite commit `d55c62d`; produce a separate correction commit.

## Acceptance criteria

- A commented forbidden import is not reported.
- An ordinary string containing text such as `from "@masterdata/domain/x"` is not reported.
- A commented sibling-legacy path from a deeply nested source file is not reported.
- An active string/import/config value resolving to the sibling `../studioflow` repository is still reported.
- Import/export/require/dynamic-import violations and all previously required WO-003 cases remain covered.
- A legal cross-app public import, same-app import, and app-to-platform import still pass.
- `npm test` explicitly runs both WO-003 fixture suites when a temporary or fixture `src/**/*.test.ts` is present.
- `npm run test:boundaries`, `npm run test:legacy-runtime`, `npm run check`, and `git diff --check` pass.

## Stop / escalation conditions

- Syntax-aware parsing requires a dependency beyond the installed TypeScript package.
- Correct parsing requires changing TypeScript/module-resolution architecture.
- A documented dependency exception is discovered.
- Any required correction would touch application/domain implementation or broaden legacy scanning into documentation.
