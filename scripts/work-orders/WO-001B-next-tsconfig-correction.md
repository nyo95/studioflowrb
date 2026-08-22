# WO-001B — Next 16.3.2 TypeScript Correction

Owner: PM/TL
Executor type: independent deterministic coding executor
Status: COMPLETE — executor finished; PM acceptance review passed 2026-08-23

## Objective

Accept only the two TypeScript configuration changes that Next 16.3.2 proved mandatory during WO-001A, then verify the build no longer mutates repository configuration.

## Context and locked decision

WO-001A upgraded Next to the security-fixed 16.3.2 line. Its build compiled successfully but automatically changed `tsconfig.json`, which was outside that work order and correctly triggered a stop. PM/TL reviewed the exact automatic delta and approves only those two framework-required changes.

## Source files

- `scripts/work-orders/WO-001A-baseline-hardening.md`
- current `tsconfig.json`
- Next 16.3.2 build output from the WO-001A executor

## Target files

- `tsconfig.json`

## Exact allowed changes

1. Change `compilerOptions.jsx` from `"preserve"` to `"react-jsx"`.
2. Add `".next/dev/types/**/*.ts"` to the `include` array while retaining every existing include entry.
3. Preserve all other compiler options, path aliases, includes, excludes, and formatting as closely as practical.

## Forbidden changes

- No package, lockfile, source, schema, migration, generated file, environment, Git, or other configuration change.
- No new TypeScript option beyond the two exact changes above.
- No manual edit to `.next` or generated Prisma output.

## Acceptance criteria and checks

1. Record the hash/content of `tsconfig.json` before build.
2. Run `npm run build`; it must pass.
3. Confirm `tsconfig.json` is byte-identical before and after the build.
4. Run `npm test`, `npm run typecheck`, and `npm run check:boundaries`; all must pass.
5. Confirm `npm audit --json` remains limited to the previously accepted Prisma CLI/config chain (`prisma`, `@prisma/config`, `deepmerge-ts`) and has no Next finding.
6. Report the exact `tsconfig.json` delta and every command result.

## Stop / escalation conditions

- Next changes or requests any additional TypeScript setting.
- Build requires a source or dependency change.
- Any acceptance command fails.
- Audit adds a new non-Prisma finding.
