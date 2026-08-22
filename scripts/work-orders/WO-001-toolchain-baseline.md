# WO-001 — Toolchain Baseline

Owner: PM/TL
Executor type: deterministic coding executor
Status: COMPLETE — executor finished; PM acceptance review passed 2026-08-23

## Scope

Make the existing scaffold reproducibly installable and make baseline verification run against the repository's declared Prisma version.

## Source files

- `package.json`
- `.env.example`
- `prisma/schema.prisma`
- legacy evidence only: `../studioflow/prisma.config.ts`, `../studioflow/package.json`

## Target files

- `package.json`
- generated package lockfile
- `prisma.config.ts`
- `prisma/schema.prisma`
- `.env.example` only if `DIRECT_URL` is absent
- `scripts/run-tests.mjs`

## Exact allowed changes

1. Use npm and the versions already declared in `package.json`.
2. Add only the Prisma 7 runtime/config dependencies required by the adopted adapter convention: `@prisma/adapter-pg`, `pg`, `dotenv`, and `@types/pg` in the appropriate dependency groups.
3. Add the locked UI foundation dependencies using the versions already proven in the legacy repository: Tailwind CSS 4, `@tailwindcss/postcss`, `radix-ui`, `class-variance-authority`, and `lucide-react`.
4. Add `tsx` as the minimal TypeScript test-loader dependency and a small `scripts/run-tests.mjs` that discovers `src/**/*.test.ts(x)` and invokes Node's built-in test runner with the loader. No test framework.
5. Add the package `test` script for that runner.
6. Add `prisma.config.ts` using `DIRECT_URL || DATABASE_URL` for CLI operations.
7. Remove `url` from the Prisma datasource block.
8. Give the `prisma-client` generator an explicit output at `../src/generated/prisma`.
9. Install dependencies and create the npm lockfile.
10. Add no application or domain code.

## Forbidden changes

- No Prisma models, fields, enums, relations, indexes, or migrations.
- No DB client implementation.
- No dependency upgrades beyond versions already selected in `package.json` or the matching versions evidenced by the legacy package; `tsx` is the only new runner dependency.
- No copied legacy scripts or seed data.
- No environment secrets or real connection strings.
- No commits, branches, remotes, or other Git configuration changes.

## Acceptance criteria

- `npm ci` succeeds from the generated lockfile.
- `npx prisma validate` succeeds without accessing the legacy repository.
- `npx prisma generate` succeeds and writes only to `src/generated/prisma`.
- `npm run typecheck` succeeds.
- `npm test` invokes the built-in Node test runner through the TypeScript loader; with no tests yet it reports zero tests and exits successfully.
- `npm run check:boundaries` succeeds.
- `git diff` contains only the allowed target files, excluding generated client output if it is ignored by the agreed repository policy.

## Stop conditions

- Prisma validation exposes a schema conflict unrelated to datasource/generator configuration.
- npm resolves materially different framework or Prisma versions.
