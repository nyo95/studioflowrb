# WO-001A — Baseline Hardening Follow-up

Owner: PM/TL
Executor type: deterministic coding executor
Status: COMPLETE — completed with WO-001B correction; PM acceptance review passed 2026-08-23

## Reason

PM review of WO-001 found a reproducibility gap and a direct high-severity Next.js advisory. `npm audit` reports that the pinned Next 16.2.1 line is affected and identifies 16.3.2 as the non-major fix.

## Target files

- `package.json`
- `package-lock.json`
- `.gitignore`

## Exact allowed changes

1. Upgrade only `next` and `eslint-config-next` from 16.2.1 to exact 16.3.2.
2. Add `postinstall: prisma generate` so a fresh `npm ci` produces the generated client before typecheck/dev use.
3. Ignore `/src/generated/prisma/` because it is deterministic build output.
4. Ignore `*.tsbuildinfo` because it is compiler cache output.
5. Recreate the lockfile through npm and run the acceptance commands.

## Forbidden changes

- No other dependency upgrade/downgrade or audit auto-fix.
- Do not downgrade Prisma. The reported `deepmerge-ts` issue is in Prisma CLI/config tooling and has no compatible Prisma 7 fix offered by npm audit; it is recorded for monitoring rather than changing the locked Prisma 7 architecture.
- No source, schema, migration, configuration, Git, or generated-client edits.

## Acceptance criteria

- A clean `npm ci` runs `postinstall` and generates `src/generated/prisma`.
- `npm audit --json` no longer reports `next`, Next's nested `postcss`, or Next's nested `sharp` vulnerabilities.
- Remaining audit findings are limited to the Prisma CLI/config dependency chain already recorded above.
- `npx prisma validate`, `npm test`, `npm run typecheck`, `npm run check:boundaries`, and `npm run build` pass.
- `git status --short --ignored` shows generated Prisma output and TypeScript build info as ignored.

## Stop conditions

- Next 16.3.2 requires a React, TypeScript, or application-source change.
- npm changes any dependency outside the allowed Next packages and their transitive lockfile resolution.
- Prisma generation requires a real secret/database connection.
