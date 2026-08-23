# WO-003 — Dependency and Legacy-Runtime Enforcement

Owner: PM/TL
Executor type: deterministic coding executor
Status: CORRECTION REQUIRED — commit `d55c62d` awaits WO-003A

Mandatory shared context: `scripts/work-orders/00-EXTERNAL-EXECUTOR-CONTEXT.md`

Rebuild context: this enforcement protects the clean rebuild from legacy runtime coupling and ownership leakage. The legacy repository may be available for manual evidence extraction but is never a runtime source.

## Scope

Make the documented dependency law executable for the current TypeScript source tree and distinguish legacy availability from forbidden runtime coupling.

## Source files

- `docs/06-DATA-OWNERSHIP.md`
- `docs/07-ENGINEERING-CONVENTIONS.md`
- `tsconfig.json`
- `scripts/check-boundaries.mjs`
- `scripts/check-legacy-link.mjs`

## Target files

- `scripts/check-boundaries.mjs`
- a renamed or additional legacy runtime-coupling checker under `scripts/`
- `package.json` scripts
- focused checker fixtures/tests if the chosen lightweight approach needs them

## Exact allowed changes

1. Detect cross-app imports through all configured aliases, including `@/apps/<app>/...`.
2. Permit cross-app imports only through the target app's `public` surface.
3. Reject Platform imports from any app folder.
4. Resolve and reject relative imports that cross an app boundary into another app's non-public folder.
5. Scan production TypeScript/JavaScript source and configuration for runtime references to the sibling `../studioflow` path.
6. Keep a separate optional command that checks whether the legacy repository is available for migration work.
7. Produce actionable messages naming the importing file and violated rule.

## Forbidden changes

- No third-party dependency-enforcement framework.
- No source-file import rewrites.
- No changes to the dependency law.
- No scanning of `node_modules`, generated clients, build output, or documentation as runtime source.
- No filesystem deletion or movement.

## Acceptance criteria

- Fixtures or equivalent checks prove rejection of:
  - app → other app/domain;
  - app → other app/application;
  - app → other app/infrastructure;
  - app → other app/ui;
  - platform → app;
  - runtime reference to `../studioflow`.
- A legal app → other app/public import passes.
- Same-app imports and app → platform imports pass.
- `npm run check` runs typecheck plus the strengthened boundary and legacy-runtime checks.

## Stop conditions

- An import form cannot be resolved safely without selecting a new build/module-resolution architecture.
- Current code reveals a documented exception not present in the SSOT.
