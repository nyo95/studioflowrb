# WO-SF-SCHEDULE-MARKS-01 — Hide and highlight Product Schedule items

Module: `studioflow` (Product Schedule).
Target revision: plan R9.212; backend (Codex) R9.213; UI (Lead) R9.214.
Risk: low-medium — two additive columns on schedule items and two bulk commands.
Owner decisions: 2026-10-23.

## Why

The studio wants to tidy the schedule without deleting anything (hide an item) and to mark items that need
attention (colour a List row / a Board card), the way it already does in its Google Sheet.

## Locked decisions

1. Both marks belong to the **item** (`SfScheduleEntry`), not to an option, and are **shared**: everyone who opens the
   project's schedule sees the same hidden items and colours. They are stored in the database, not in the browser.
2. **Hidden** (`hidden Boolean @default(false)`): a hidden item keeps its code, options, decision, photos and every link
   (Presentation, SketchUp, notes). Nothing else changes: codes are not re-used and numbering does not shift.
3. **Highlight** (`highlight String?`): one of a fixed palette, or null for none. Keys, in this order:
   `yellow`, `green`, `blue`, `red`, `purple`. The domain exports the list (`SCHEDULE_HIGHLIGHTS`) and its type; the
   service refuses any other value (`SCHEDULE_HIGHLIGHT_INVALID`). The UI owns the actual colours.
4. Both commands take **several items at once** (selection) as well as one: `setEntriesHidden({ projectId, entryIds, hidden })`
   and `setEntriesHighlight({ projectId, entryIds, highlight })`. Every id must belong to the project
   (otherwise not found, nothing written); an empty list is refused. Each changed item writes an audit event
   (`studioflow.schedule.entry-hidden` / `entry-unhidden` / `entry-highlighted`) with `changes`. Unchanged items are skipped.
5. Permission: the same as editing a schedule item (`updateEntry`); archived projects are read-only as everywhere else.
6. `ScheduleEntryView` gains `hidden: boolean` and `highlight: ScheduleHighlight | null`; `listSchedule` returns hidden
   items too (filtering is the screen's job). Duplicate/apply-template/import never set either mark; a new item starts
   visible with no highlight. Re-import of an existing code keeps both marks.
7. **Print** asks each time whether hidden items are included (owner); the default is to leave them out. **Progress**
   ("x of y final" and the filter counts) leaves hidden items out. Both are Lead UI work in R9.214.
8. Out of scope: the schedule MCP / composer, SketchUp and Presentation reads are unchanged (they ignore the marks).

## Executor scope (R9.213)

- Prisma: `hidden` and `highlight` on `SfScheduleEntry`; one additive migration (defaults: `false`, null).
- Domain: `SCHEDULE_HIGHLIGHTS`, `ScheduleHighlight`, the two view fields.
- Service: the two bulk commands per decisions 4-5; `listSchedule` maps the fields; import/duplicate paths untouched
  except that re-import must not clear them.
- Server actions `setScheduleEntriesHiddenAction` and `setScheduleEntriesHighlightAction` (zod: 1..500 uuids; highlight
  enum or null), revalidating like the other entry actions.
- Minimal wiring: none required in the board beyond what typecheck needs; the Lead builds the menus and filters.
- Tests: both commands (one and many, unchanged skipped, foreign id refused with nothing written, archived refused,
  invalid colour refused, audit written), view mapping, re-import keeps the marks.
- Changelog R9.213. Apply the migration to the selected location's dev and test databases.

## Lead scope (R9.214)

- List row and Board card menus (… and right-click): Hide / Unhide, and Highlight with the five colours plus "No colour".
  Selection panel: hide, unhide, highlight several at once.
- A visibility control: "Visible" (default), "Show hidden" (hidden items shown faded), "Hidden only"; and a colour filter.
- Highlighted List rows get a tinted background with a colour edge; Board cards get a coloured frame.
- Progress counts skip hidden items. Print / PDF asks "Include hidden items?" and passes the answer to the print page,
  which leaves hidden items out unless asked to include them.

## Acceptance

- Hiding PT-05 removes it from the List and Board for every user, keeps its code, and drops it from "x of y final";
  "Hidden only" shows it, and Unhide brings it back unchanged.
- Colouring three selected rows yellow shows the same colour on the Board cards and for another user.
- Print without hidden items leaves PT-05 out; print with them includes it.
