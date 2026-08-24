# 07 — Engineering Conventions

## Folder convention per app

```text
domain/          pure business rules
application/     use-cases/orchestration
infrastructure/  persistence/external adapters
ui/              app-specific UI
public/          only legal cross-app import surface
```

## Centralization test
Move code to Platform Utilities/Core when:
- used by 2+ apps, and
- meaning is identical across those apps, and
- it does not encode one app's business policy.

Otherwise keep it local.

## `shared/` rule
`src/shared` is quarantine, not a destination. New production logic should almost never start there.

## Legacy extraction
Use only the immutable legacy evidence snapshot at `https://github.com/nyo95/studioflow/commit/548fbd6bd00ef9fd7d53df66a3561a32fbb56944`. Do not treat a local `../studioflow` checkout as authority and do not copy whole folders from any legacy source.
For every capability:
1. identify current behavior
2. identify business owner
3. classify KEEP/MERGE/REWRITE/PURGE/LEGACY
4. identify destination
5. extract tests/business rules first where possible
6. migrate implementation
7. remove accidental dependency on legacy structure

## Schema rule
No Prisma model is added until its ownership is present in `06-DATA-OWNERSHIP.md` and its business purpose exists in the relevant PRD.

## Documentation rule
PRDs describe current intended product. Changelog/history should never be mixed into normative PRDs.
