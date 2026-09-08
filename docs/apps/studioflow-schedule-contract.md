# Schedule Contract — StudioFlow

Status: **DEFERRED DOMAIN BRIEF — not an approved contract, not a work order**

Authority: legacy audit evidence plus owner scope confirmation that Library and
Product Schedule belong to StudioFlow. The audit roadmap classifies the legacy
implementation **DEFER** and requires a standalone contract before any code.
This document is that contract's starting point, not its conclusion. It exists
so the domain can be reasoned about without blocking the project core.

Nothing here is implementable. No model, permission, or route below may be
built until the owner locks §7.

## 1. Business purpose and users

A Product Schedule is the studio's answer to *"what actually goes in this
project"* — which brand and which product for each position, at what quantity,
with what alternatives the client may still choose between.

| User | Need |
|---|---|
| Designer | Select products per area; offer the client two or three real alternatives |
| Client | Choose among presented options; see what was selected |
| Owner | See commitment before it becomes a purchase |

It is a **selection and specification** record, not a purchase order and not an
estimate. BQ answers cost; the schedule answers choice. The two are not linked
([`studioflow.md`](studioflow.md) §4).

## 2. Flow, lifecycle, and consequence

Provisional, pending §7:

```
entry created (empty position)
   → options added (1..n, each a catalog or manual product)
   → one option selected
   → selection presented to client
   → client confirms  →  entry LOCKED
```

The only consequence worth contracting today is the last one: once an entry is
locked, its selected option's catalog facts must never change, even if Master
Data later edits that product. That is the immutable-snapshot requirement the
audit roadmap names.

## 3. Minimal data model

Deliberately smaller than legacy. Provisional.

| Model | Owns |
|---|---|
| `ScheduleEntry` | A position in the project: category, area/room, quantity, unit, note, state |
| `ScheduleOption` | A candidate product for one entry, with its Master Data snapshot and a selected flag |

Ownership is StudioFlow. `ScheduleEntry` belongs to a Project; whether it also
belongs to a Phase is open (§7.3).

**Snapshot rule.** Each option stores the Master Data brand and SKU identifiers
as plain values plus the display facts frozen at selection time. No foreign key
crosses into `master_data`.

Legacy's negative temporary sequence values and two-step renumbering are
**PURGE**: they exist only because a user-visible code was used as the
uniqueness mechanism. A stable internal identifier plus a separate, freely
editable `sort_order` removes the whole class of problem.

Audit trail: entry lock and unlock, option selection change. Not option
add/remove — high frequency, low consequence.

## 4. Access

Provisional vocabulary, to be registered only when this contract is approved:

| Action | Proposed permission |
|---|---|
| Read the schedule | `studioflow.project.read` (reuse) |
| Create / edit entries and options | `studioflow.schedule.manage` |
| Lock an entry against client confirmation | `studioflow.schedule.confirm` |

`schedule.confirm` is proposed as a separate permission because locking is the
irreversible, client-facing act — the same trust boundary as
`iteration.review`, and plausibly held by the same people.

## 5. Dependencies

- **Master Data**: read-only, through the public read port, for brand and SKU.
  This is the *only* live cross-app read StudioFlow has, and the reason
  [`studioflow.md`](studioflow.md) §4 exists.
- **BQ**: none.
- **Core / UI Engine**: consumed as-is. A schedule table is a table; it needs no
  new shared component.

## 6. Legacy classification

| Legacy behavior | Disposition |
|---|---|
| Entry + option structure with catalog snapshots | **KEEP** — the sound part of legacy schedule |
| Option approval workflow | **FIX** — recontract as entry lock, not per-option approval |
| Negative temporary sequences, two-step renumbering, code normalization as the consistency mechanism | **PURGE** — replaced by stable id plus `sort_order` |
| `ScheduleTemplate` seeding empty row skeletons per category | **DEFER** — legacy A6 shows it never delivered its intent; templates filled rows but not products |
| `ScheduleBundle` (packages of chosen products) | **DEFER** — never existed in legacy; a new feature, not a rebuild |
| Excel/CSV import | **DEFER** |
| SketchUp plugin as an entry source | **DEFER** — see [`studioflow.md`](studioflow.md) §6 |

## 7. Decisions the owner must make before this is implementable

1. **Is an entry scoped to a phase, or to the project?** Legacy tied schedule to
   phases. If selection genuinely spans phases, it is project-scoped and phase is
   at most a filter.
2. **Do clients choose among options, or does the studio present one selection?**
   This decides whether `ScheduleOption` is a real presented alternative or
   merely the studio's internal shortlist. It changes the model.
3. **What is the position identity?** Room-based, category-based, or free text.
   The audit roadmap names stable item identity as the precondition for this
   whole domain.
4. **Does a locked entry participate in project archival retention?**

Until 1–3 are answered, §2 and §3 are guesses and must be treated as such.
