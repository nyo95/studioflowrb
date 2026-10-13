# Active Plan

Plan ID: PROTO-SF-WORKSPACE-CANVAS (clickable prototype: a Notion-like Workspace that feels as free as Miro)
Scope: a throwaway, self-contained prototype for the owner to try; no product code, no backend, no database
Module(s): none (prototype only; the eventual product work belongs to studioflow core)
Target revision: R8.527 (Codex, prototype commit). The Lead reviews it with the owner, then locks the product plan.
Status: DELIVERED (R8.527, Lead fixes R8.528) — AWAITING OWNER VERDICT
Priority: P1
Owner: owner 2026-10-13 — rejected the board-first columns and the four Lead layout sketches ("kurang oke, lebih mirip Notion tapi feels-nya fleksibel seperti Miro"); asked that Codex build the prototype. Recorded in R8.526.
Last updated: 2026-10-13 (Lead, R8.526)

## What the owner wants to feel

- **Notion:** a page you type into directly. Blocks: heading/topic, text,
  bullet and checklist, image, a "client feedback" block. Type "/" to pick a
  block type; Enter makes the next block; paste an image to drop it in.
- **Miro:** the same blocks are not stuck in one column. They can be dragged
  anywhere on a large surface, placed side by side, resized, grouped inside a
  named **frame** (a topic such as "Client feedback", "Material", "Site"), and
  the surface can be panned and zoomed. Nothing forces a rigid grid.
- **Position:** the owner also found the R8.523 placement wrong. The prototype
  must show where the Workspace lives on the project page, not just the
  surface. Lead suggestion to test (the owner may reject it): the Workspace is
  the main body of the project page, with the phase workflow reduced to a
  compact bar above it (phase strip, current round, "Client answered" /
  "Send to client"), and Requirements, Files and round history behind a
  "Phase details" button with counts.

## What must carry over from the locked product rules

Show these in the prototype so the owner can judge them in context:
- one Workspace per project; every block can carry a **phase label** and a
  **round label** (e.g. "Design 3D · D2") shown as small chips;
- writing while a phase is selected labels new blocks with that phase and its
  current round;
- "Client answered" with text drops a **Client feedback** block into the
  default frame named **"Workspace"**, which can be renamed and moved but not
  deleted;
- **Starred** (star icon) and **Client feedback** are the block terms;
- filters (All · General · a phase · Starred · Client feedback) **dim** the
  non-matching blocks rather than moving them, so positions never jump;
- a narrow screen (375 px) cannot be a free canvas: show what it becomes
  (suggestion: the frames read top to bottom as a document).

## Deliverable

- One self-contained folder `prototypes/workspace-canvas/` with `index.html`
  (plus local `.js`/`.css` if needed). Plain HTML, CSS and JavaScript; it opens
  by double-clicking the file in a browser. No npm package, no CDN, no build
  step, no import from `src/`. It is not linked from the app and not part of
  the Next build (confirm `next build` and the boundary checks ignore it).
- Sample content only, made up but realistic for an interior studio project
  (no real client data copied from the database): five phases with Design 3D
  active at D2, a few client-feedback blocks over D1 and D2, a Material frame
  with an image placeholder and a checklist, a Site frame, one starred block,
  one unlabelled ("General") block.
- Interactions that must really work: type into blocks, "/" block menu, Enter
  for a new block, drag blocks freely and into or out of frames, resize a
  block and a frame, create and rename a frame (the "Workspace" frame refuses
  delete), pan and zoom, star a block, set or clear a phase label, the filters
  dimming, switch the selected phase in the workflow bar, "Client answered"
  adding a feedback block to the Workspace frame, and the 375 px view. State
  may live in memory or `localStorage`; nothing is sent anywhere.
- A short `prototypes/workspace-canvas/README.md`: how to open it, what is
  real and what is faked, and three open questions for the owner.

## Non-goals

No change under `src/`, `prisma/`, routes or navigation; no migration; no new
dependency in `package.json`; no product decision beyond what is listed; no
push. The R8.523 Workspace screen and R8.525 backend stay as they are until the
owner accepts a direction.

## Verification

Open `index.html` in a browser at desktop width and at 375 px and walk every
interaction listed above; `npm run build` and `npm run check:boundaries` still
pass (proving the folder is outside the app); staged and unstaged whitespace.

## Executor Prompt

You are Codex on the same checkout (location: kantor), assigned by the owner to
build a prototype. Read `AGENTS.md`, `PLAN.md` (PROTO-SF-WORKSPACE-CANVAS) and
`CHANGELOG.md` R8.519–R8.526 for context. Build exactly the deliverable in the
plan as one local revision commit R8.527 (confirm the next unused number in
`CHANGELOG.md`): a self-contained clickable prototype in
`prototypes/workspace-canvas/` that feels like Notion (type directly, "/"
blocks, Enter, paste image) and moves like Miro (free drag, side-by-side,
resize, frames as topics, pan and zoom), placed inside a mock project page with
a compact phase workflow bar and a "Phase details" button, carrying the locked
rules (phase and round chips, default "Workspace" frame that cannot be
deleted, Starred, Client feedback, dimming filters, 375 px fallback). Plain
HTML/CSS/JS, no dependency, no change under `src/` or `prisma/`, sample data
only. Verify every interaction at desktop and 375 px, run `npm run build` and
`npm run check:boundaries`, add the README with three open questions, update
`CHANGELOG.md`, commit locally without pushing, and reply with only a
Planner/Reviewer prompt: commit, how to open it, what works and what is faked,
checks, dirty files, and a request for review.
