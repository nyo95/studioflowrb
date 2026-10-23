# Project book (Notes v3) — Decision Record

Status: ACCEPTED (owner, 2026-10-23; recorded by the Lead in R9.239).
Scope: StudioFlow project notes, client feedback, to-dos, material tries, discussion, the Ideas module (switched
off) and the Workspace board. UI direction: `DESIGN.md` §6.2 and §6.3; mockup https://claude.ai/artifact/5sChwEHLG1ta1wmzTpDcBS
(v2 artboards).

## Why

The owner's diagnosis: the Workspace board is too free, Notes feel like a chat, and the real cost is the coupling
to phases: every note asks which phase and round, so keeping notes and phase status current becomes clerical work.
The owner's office only needs Schedule, MOM, Presentation and the phase tracker; the notes tools are the owner's
own working tools.

## Locked decisions

1. **One Project book per project, not tied to phases.** Writing never asks for a phase. A phase label is set
   silently when exactly one phase is active, otherwise left empty; it stays editable and never required.
2. **Five kinds, fixed sections, one composer:** to-do, client feedback, material try, discussion, free note. No
   free canvas, no block editor, no Todoist sync. The Workspace board (`workspace-board` module) is retired.
3. **Write once, status follows.** Recording client feedback for the round that is with the client answers that
   round (reuses the existing `recordClientAnswer` behaviour); when two rounds are out, the composer asks which,
   in one click. Each feedback point can become a to-do; the round shows "n of m handled". Revise / approve is
   offered right after, or later from Home.
4. **To-dos extend the existing checklist** (assignee, due date, link to the feedback point it came from); Home
   gains "My tasks" across projects. No separate task model.
5. **Privacy.** The book is readable and writable only by the project's PIC designer and PIC drafter and the people
   a PIC invites to that book. Managers, override holders and the Platform Owner do not read it. **Exception:**
   workflow records (the client's answer and site-visit records written by a phase step) stay visible to everyone
   who may see the project's work sections today, because they are the project's official history.
6. **An invited member** may open that project's page (head, stage strip, the book) and read and write the book;
   the invitation grants no phase, schedule, MOM or presentation edit. Invitations are audited and removable by a
   PIC.
7. **Material tries** take over Ideas' role: per project, image-first, status try / promoted / discarded. **Promote** creates
   the Schedule item or option (it gets its code only then). SketchUp sends materials here first (the SketchUp
   contract, WO-SKETCHUP-02/03, is revised accordingly before it is built further).
8. **"Use in schedule" on a note image** moves out of Ideas into StudioFlow, for book readers who may edit the
   Schedule.
9. **Discussion** threads attach to a to-do, a feedback point or a material try. `@person` notifies through the
   existing in-app notifications; `#code` keeps linking Schedule items.
10. **Ideas is switched off, not removed** (owner, 2026-10-23, amended the same day): the Developer turns the
    `ideas` module Off; its data, schema and code stay untouched, and every Ideas entry point behaves as it does
    for a module that is Off. Deleting it is a later, separate owner decision once the Project book has proven
    itself.
11. **Not a new module.** The Project book is the rework of existing StudioFlow Notes and Checklist, which live in
    the `studioflow` schema and are bound to phases and the Schedule; it stays inside StudioFlow (EXTEND), recorded
    here as the deliberate exception to "every new capability is born as a module".

## Branch (owner, 2026-10-23)

All Project book work happens on the branch **`feat/project-book`**, cut from `main` at R9.235 (the version the
owner runs). `main` receives nothing from this program until the owner has tried the branch and explicitly asks for
the merge. Revisions on the branch continue the ledger (R9.236 onward); every Executor and Lead session checks out
`feat/project-book`, commits there, and pushes only that branch when the owner asks.

## Program (one Work Order each; backend by Codex, then the Lead's UI)

| Slice | Content | Status |
|---|---|---|
| WO-SF-BOOK-01 | Privacy (PIC + invited members, workflow-record exception), member invitations, note-image "Use in schedule" moved into StudioFlow | READY in `PLAN.md` |
| WO-SF-BOOK-02 | To-dos on the checklist: assignee, due date, feedback link; "My tasks" read | planned |
| WO-SF-BOOK-03 | Feedback composer: points, point → to-do, handled count; round answered from the book | planned |
| WO-SF-BOOK-04 | Material tries: kind, status, promote to Schedule, discard | planned |
| WO-SF-BOOK-05 | Discussion anchors and `@person` notifications | planned |
| WO-SF-BOOK-06 | Ideas Off (verify every entry point hides; no deletion) and retire the Workspace board | planned |
| WO-SKETCHUP-04 | SketchUp sends materials as tries; promote allocates the code | planned |
| Lead UI | UI Engine `MaterialTile`, `TypedComposer`, `ProgressRing`; the Project page and Home per §6.3, one UI revision after each backend slice | planned |
