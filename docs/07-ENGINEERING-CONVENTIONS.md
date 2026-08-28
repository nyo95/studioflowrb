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
Use `D:\Misc\ProjectsHUB\studioflow` as the owner-designated read-only behavioral reference. Before citing it, record its branch, commit, and dirty state; distinguish committed evidence from uncommitted evidence. It remains evidence, not authority, and no runtime/build/test dependency may point to it. Do not copy whole folders or source text wholesale.
For every capability:
1. identify current behavior
2. identify business owner
3. classify KEEP/MERGE/REWRITE/PURGE/LEGACY
4. identify destination
5. extract tests/business rules first where possible
6. migrate implementation
7. remove accidental dependency on legacy structure

The detailed procedure and stop conditions are in `16-LEGACY-MIGRATION-PLAYBOOK.md`.

## Schema rule
No Prisma model is added until its ownership is present in `06-DATA-OWNERSHIP.md` and its business purpose exists in the relevant PRD.

## Documentation rule
PRDs describe current intended product. Changelog/history should never be mixed into normative PRDs.

Use the evidence labels from `README.md`. When schema/code conflicts with a current PRD, record an implementation gap; do not rewrite the PRD to match the accident.
