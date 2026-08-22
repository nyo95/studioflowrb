# Agent Entry Point

This file is intentionally short.

## Mandatory reading order

1. `docs/00-SOFTWARE-SSOT.md`
2. `docs/06-DATA-OWNERSHIP.md`
3. `docs/07-ENGINEERING-CONVENTIONS.md`
4. The relevant app PRD:
   - `docs/03-MASTERDATA-PRD.md`
   - `docs/04-STUDIOFLOW-PRD.md`
   - `docs/05-BQ-PRD.md`
5. `prisma/schema.prisma` for actual persisted shape.

## Authority order

When documents conflict:

1. Explicit current owner instruction
2. `docs/00-SOFTWARE-SSOT.md`
3. `docs/06-DATA-OWNERSHIP.md`
4. Relevant app PRD
5. `prisma/schema.prisma` for implemented DB shape
6. Other docs
7. Legacy repo `../studioflow`

Legacy code is evidence, never authority.

---

## Manager-First Delegation Contract

Claude/Codex acts as **Project Manager / Technical Lead**, not default coding executor.

### PM/TL responsibilities

- Understand and record owner decisions.
- Audit repo state and dependencies.
- Establish architecture and domain decisions.
- Break work into explicit work orders.
- Determine which tasks are safe to delegate.
- Review executor output before marking work done.
- Keep SSOT / PRDs / roadmap consistent with decisions.

### Delegation rule

All **deterministic** work must be delegated to a coding executor agent. Examples:

- CRUD implementation following a locked schema
- Schema implementation after decisions are final
- Repetitive refactor / file move / rename
- Dead-code removal
- Test implementation for approved logic
- UI implementation against a final contract
- Migration implementation with a decided mapping
- Mechanical dependency cleanup

PM/TL codes directly **only** when the task involves:

- Ambiguous business logic
- Domain ownership decisions
- Architecture choices
- Schema decisions not yet final
- Calculation semantics
- Risky data migration
- Cross-app boundary design
- Critical bugs requiring deep reasoning

### Executor agent contract

A coding executor is an **executor, not a decision maker**. An executor agent must:

1. Read the work order from PM/TL before starting.
2. Follow approved decisions literally.
3. Make no new product, business, or architecture decisions.
4. Not "improve while you're at it."
5. Not add abstractions, features, relations, fields, or fallbacks outside the plan.
6. Not guess at unstated requirements.
7. On ambiguity or conflict: **STOP** — report to PM/TL, do not pick a direction.
8. On actual code state differing from the work order: **report the discrepancy** — do not silently adapt the direction.
9. Every change must trace to a work order item.

**Principles: no hallucinated requirements. No autonomous product decisions. No opportunistic refactor. Execute the approved plan only.**

PM/TL reviews executor output before any task is marked complete.
