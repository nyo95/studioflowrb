# Minutes of Meeting Contract — StudioFlow

Status: **DEFERRED DOMAIN BRIEF — not an approved contract, not a work order**

Authority: legacy audit evidence plus owner scope confirmation that MoM belongs
to StudioFlow. The audit roadmap places it after project identity exists. This
document scopes the domain so it can be sequenced; it does not authorize code.

## 1. Business purpose and users

A MoM record is the studio's written account of what was agreed in a meeting,
in a form that can be sent to the client and referred back to when a decision is
later disputed.

| User | Need |
|---|---|
| Designer / owner | Record decisions and actions during or right after a meeting |
| Client | Receive a clean, printable record of what was agreed |

Its value is **evidentiary**. That single property drives every rule below.

## 2. Flow and lifecycle

```
draft  →  issued (printed or sent)  →  superseded by a later MoM
```

An issued MoM is **immutable**. A correction is a new MoM that references the
one it corrects. This mirrors the iteration response rule in the project
contract (§6.1 there) and for the same reason: a record whose purpose is proof
loses that purpose the moment it can be edited after the fact.

Legacy allowed editing after issue. That is **FIX**.

## 3. Minimal data model

| Model | Owns |
|---|---|
| `MomDocument` | Project, meeting date, attendees, state, sequence number |
| `MomPoint` | An ordered discussion point: text, optional decision, optional owner and due date |

Legacy's four-level `ProjectMomDocument` → `ProjectMomItem` → `ProjectMomPoint`
→ `ProjectMomImage` hierarchy is **MERGE** into two levels. The middle level
grouped points into sections; the evidence for a third and fourth level being
used is not in the audit. Reintroduce a level only when a real meeting record
cannot be expressed without it.

Images attach to points and depend on the same blocked storage capability as
project assets ([`studioflow.md`](studioflow.md) §5). MoM images are small and
could ship on the Brand-mark-class capability, but they are **not** a reason to
start MoM before the project core.

Audit trail: issue, supersede. Not draft edits.

## 4. Access

| Action | Proposed permission |
|---|---|
| Read | `studioflow.project.read` (reuse) |
| Create and edit a draft | `studioflow.mom.manage` |
| Issue (make immutable) | `studioflow.mom.issue` |

## 5. Dependencies

Core and UI Engine only. A print view is presentation; it introduces no shared
capability and no dependency on Master Data or BQ.

## 6. Legacy classification

| Legacy behavior | Disposition |
|---|---|
| MoM as an ordered document belonging to a project | **KEEP** |
| Four-level document → item → point → image hierarchy | **MERGE** to two levels |
| Editable after issue | **FIX** — immutable once issued; corrections are new documents |
| Print view | **KEEP** |
| Action items inside MoM points | **DEFER** — decide §7.2 first |

## 7. Decisions the owner must make before this is implementable

1. **Does an action item inside a MoM become a StudioFlow `Task`?** If yes, MoM
   gains a write path into the project core and the two are no longer
   independent modules. If no, MoM stays a self-contained record and the studio
   retypes anything it wants tracked. This is the only decision that changes the
   sequencing.
2. **Is a MoM ever sent to the client from inside the app, or is it printed and
   sent by other means?** Affects whether client-facing delivery
   ([`studioflow.md`](studioflow.md) §7.2) must be solved first.
