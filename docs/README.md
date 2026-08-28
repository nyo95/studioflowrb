# Rebuild Documentation Map

Status: ACTIVE
Owner direction: 2026-08-28

This repository is the implementation home for the rebuilt StudioFlow platform. The legacy checkout at `D:\Misc\ProjectsHUB\studioflow` is read-only product evidence. It is not a runtime dependency, a package source, or a folder-copy source.

## Reading order

1. `00-SOFTWARE-SSOT.md` — platform constitution and ownership.
2. `06-DATA-OWNERSHIP.md` — dependency and snapshot law.
3. `CORE.md`, `DESIGN.md`, and `UI_ENGINE.md` — shared technical and UI contracts.
4. The relevant app PRD: `03-MASTERDATA-PRD.md`, `04-STUDIOFLOW-PRD.md`, or `05-BQ-PRD.md`.
5. The matching detailed app dossier in `docs/apps/`.
6. `07-ENGINEERING-CONVENTIONS.md` and `16-LEGACY-MIGRATION-PLAYBOOK.md` before migration work.
7. `15-RULE-AUDIT.md` before treating an existing implementation claim as product truth.

## Evidence labels

| Label | Meaning |
|---|---|
| `DECIDED` | Explicit current owner decision or an uncontradicted canonical contract. |
| `IMPLEMENTED` | Present in the rebuild code/schema. This does not by itself make it correct. |
| `TESTED` | Verified by a named automated or manual check in the stated environment. |
| `CONFLICTED` | Two current-looking sources disagree; implementation must stop until the canonical decision is applied. |
| `INFERRED` | Reasonable interpretation from code or workflow, not an owner decision. |
| `OPEN` | A product or operational decision is still required. |
| `LEGACY` | Evidence from the reference application; not automatically a rebuild requirement. |
| `PURGE` | Behavior or structure deliberately excluded from the rebuild. |

Documentation must not turn `IMPLEMENTED` or `LEGACY` into `DECIDED` without evidence.

## Canonical app dossiers

- `apps/masterdata.md` — canonical data, pricing, catalog, import/export, and public reads.
- `apps/studioflow.md` — project delivery workflow and project-owned extensions.
- `apps/bq.md` — estimating worksheet, immutable snapshots, calculations, and recipe library.

Each dossier records product flow, conceptual schema, UI/UX, public boundary, permissions, migration scope, and unresolved gaps. Prisma remains implementation evidence; it cannot silently overrule these product contracts.

## Change discipline

- Shared technical behavior goes to Platform Core only when its meaning is domain-independent.
- Reusable presentation and interaction behavior goes to UI Engine before app-local duplication.
- Business policies stay with their owning app even when several apps consume their results.
- Cross-app imports use only `other-app/public`.
- A migration copies behavior and invariants, not legacy source structure or source text.
- Known conflicts are documented as gaps and corrected through an explicit migration slice with tests.
