# Active Plan

Plan ID: WO-SF-IDEAS-01 (personal Ideas board, backend)
Scope: StudioFlow Ideas cards and their use in a project's Product Schedule; one Core storage extension (`copy`).
Target revision: R8.450 (one Executor commit). R8.449 is this plan.
Status: BUILT — backend implemented by the Lead in R8.450 at the owner's request ("kamu eksekusi aja"); the board UI is next (Lead).
Priority: P2
Owner: Product Owner. Decisions approved in chat on 2026-10-08 (BACKLOG `[PLANNED][P2] Ideas board`).
Last updated: 2026-10-08

Previous plan WO-SF-NOTEFEED-01 was built by the Lead (R8.446).

## Outcome

Every StudioFlow user has a private board of image cards. A card is created from
one image alone (screenshot, download, picked file); title, source link and note
are optional and may stay empty forever. A card can be used in the Product
Schedule of any project the user holds, either as a new schedule item or as an
extra option on an existing item. Using it creates an independent copy in the
schedule; the card only remembers where it has been used.

Domain ownership (owner, 2026-10-08): Ideas = USER, Product Schedule = PROJECT,
Master Data = COMPANY, SketchUp = MODEL facts. Ideas is not a sub-feature of the
schedule in data, only close to it in the UI.

## Locked Decisions

1. **Private per user.** Only the card's owner can list, read, edit, delete or
   use it. No manager override, no sharing. Having a board needs only
   `studioflow.access`.
2. **A card is valid with an image and nothing else.** Exactly one image per
   card (PNG/JPEG/WebP, same byte limit and signature sniffing as schedule
   images); the image can be replaced. `title`, `sourceUrl`, `note` are
   nullable. No code, category, qty, status or lifecycle on a card.
3. **Use is a snapshot, never a live link.** Using a card copies its image into
   a **new storage object** under the project's schedule prefix and copies the
   chosen text into the schedule option. Afterwards editing or deleting the card
   never changes the schedule, and editing the schedule never changes the card.
4. **Usage record.** The card keeps one usage row per use (project, entry,
   option). It is shown with the **current** project name and schedule code and
   option label (codes can be renumbered by reorder), so it is read live through
   the option, and it disappears when that option or its project is deleted.
   One card may be used many times, in several projects, even twice in one item.
5. **"Projects the user holds"** = projects where the user passes the existing
   schedule command check: `studioflow.schedule.manage` plus project access of
   kind `document` (assigned designer/drafter or manager override, project not
   completed/archived). Expose this as the target list; enforce it again on use.
6. **Product Schedule stays the only authority for schedule rows.** The Ideas
   code never creates `sf_schedule_entry`/`sf_schedule_option` rows, codes,
   prefixes, increments, option labels or final flags itself. It asks the
   schedule service, through one transaction-aware path shared with the existing
   `createEntry` / `createOption` commands (extract it; do not duplicate it). A
   created option is a normal non-final draft option (never auto-final).
7. **No Master Data coupling.** No brand lookup, no `brandSnapshot`, no write;
   `brandId` stays null on options created from a card. The source URL is stored
   as text only and is never fetched by the server.
8. **Core storage EXTEND:** `ObjectStorage.copy({ fromKey, toKey, contentType })`
   in the Core contract, the filesystem and Supabase adapters, and
   `FakeObjectStorage`, with adapter tests. Domain-neutral; no app policy. This
   is the only shared-layer change.

## Business Rules and Architecture Constraints

- Card fields: `title` ≤ 160, `note` ≤ 2000 (plain text), `sourceUrl` ≤ 2000 and
  only `http:`/`https:` (reject `javascript:`, `data:` and the rest, so the UI can
  render it as a link safely). Trim; empty → null.
- Image intake follows the schedule/note image pattern: validate and sniff, put
  the object first, record it in a transaction, discard the object if the
  transaction fails, release a replaced object after commit through the existing
  StudioFlow asset cleanup (`removeUnreferencedAssets` / `discardObjects`,
  retry ledger). Add the card image column to `isReferenced` in
  `asset-cleanup.ts`. Deleting a card releases its image the same way.
- Use in schedule, input: `cardId`, `projectId`, and either
  - **new item**: `section` (MATERIAL | FIXTURE) and `category` (same rules as
    `createEntry`, including new categories and Fixture-only qty/unit), or
  - **extra option**: `entryId` of an entry in that project;
  plus the option text: `productName` (required by the schedule's existing
  snapshot rule; the UI prefills it from the title, so a card without a title
  needs it typed at use time) and optional `notes` (UI prefills from the card
  note). Other snapshot fields may be passed through as `createOption` accepts
  them, except brand id.
- On use: copy the image object first (new key under the project's schedule
  prefix), then in **one transaction** create the entry/option through the
  shared schedule path with that image key and insert the usage row; if it
  fails, discard the copied object. All or nothing.
- Audit: `studioflow.idea.created|updated|image-replaced|deleted|used`; the
  schedule audit rows the schedule path already writes stay as they are (add
  `ideaCardId` to their metadata when created from a card).
- Schema: new tables in the `studioflow` schema for cards and usages, in one
  migration. Owner id follows the existing `created_by_id`/`uploaded_by_id`
  convention (platform user id, no cross-schema FK). Usage FKs: card (cascade),
  option (cascade); keep `project_id`/`entry_id` as needed for the read.

## Backend Contract

Service methods (StudioFlow service; names are the Executor's choice), all
scoped to the calling user:

- list my cards, newest first: id, title, sourceUrl, note, signed image URL,
  content type, bytes, createdAt/updatedAt, and usages (project id + current
  name, entry id, current code e.g. `ST-04`, option id + label e.g. `B`).
- create card (image required), update text fields, replace image, delete.
- list use targets: the projects of decision 5, with the minimum the use dialog
  needs (id, name; the existing schedule reads stay the source for entries and
  categories).
- use card in schedule (as above), returning `{ projectId, entryId, optionId, code, label }`.
- Errors as `AppError` with stable codes: card not found (also for another
  user's card — never reveal it exists), invalid URL, image type/size, project
  not held (existing schedule access error), entry not in project.

Server actions and an image upload path (FormData, like phase note images) in
the StudioFlow route layer, validated with zod.

## UI Contract

The board page, the card UI and the use dialog are the Lead's (R8.451+). The
Executor adds **no UI** beyond what is needed to compile; the actions are
exercised by integration tests.

## Boundaries and Non-goals

- No change to Master Data, BQ or any other app.
- No drag-onto-schedule, no sharing, no multiple images per card, no
  categories/tags on cards, no URL preview fetching, no SketchUp/companion
  intake (D-SF-06 stands).
- No change to existing schedule behavior or audit beyond extracting the shared
  creation path and accepting an image key for it.

## Acceptance Criteria

1. A card can be created from an image only, and edited/deleted only by its owner;
   another user (even with every permission) gets not-found on read, edit,
   delete and use.
2. Use as new item allocates the next code by the existing rules; use as extra
   option gets the next option label; neither is final.
3. The option's image is a different storage key from the card's, and the
   object exists; deleting the card afterwards leaves the option image intact;
   replacing the card image leaves it intact; deleting the option leaves the
   card and its image intact and removes that usage.
4. The usage shows the current code after a schedule reorder.
5. Using a card in a project the user does not hold is refused; in a completed
   or archived project too.
6. A failure inside the use transaction leaves no schedule row, no usage row and
   no copied object (fake storage proves it).
7. `sourceUrl` `javascript:alert(1)` is refused; `https://…` is kept as text.
8. `copy` works in the filesystem adapter (bytes and content type match) and
   `FakeObjectStorage`; Supabase adapter compiles and maps to the provider copy.
9. Existing schedule tests still pass unchanged (the shared path is a refactor).

## Verification

`prisma validate`; migration applied to the disposable test database;
`tsc --noEmit`; eslint on `src/apps/studioflow`, `src/platform`, and the
StudioFlow routes; full `npm test` (report the count; none failed, skipped or
cancelled); `npm run build`. Do not run anything against a non-test database
except `prisma migrate deploy` on the selected location's rebuild dev database,
and report it.

## Reviewer Acceptance

None for this commit (no UI). Browser acceptance comes with the Lead's board UI.

## Regression Risks and Recovery

- Extracting the schedule creation path can change code allocation or audit:
  keep existing schedule tests green and add one test that creates via a card
  and via the old command in the same category and checks consecutive codes.
- Storage `copy` across adapters: path safety in the filesystem adapter must
  use the same canonical-path checks as `put`.
- A card image referenced nowhere else must still be released on delete; an
  option image copied from a card is project data and follows project archive
  retention like any other option image.

## Executor Prompt

You are the Backend Executor. Location: ask the owner (rumah or kantor) and load
that env file as `AGENTS.md` says. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, and
this `PLAN.md` (WO-SF-IDEAS-01), then implement the entire READY backend outcome
and nothing beyond it. Inspect current repository evidence, preserve unrelated
owner work, make sound in-scope implementation decisions, run the required
checks, update `CHANGELOG.md`, and create local revision commit R8.450. Stop only
for a material locked-decision conflict or unsafe boundary, using the BLOCKED /
CONFLICT report; otherwise finish the coherent outcome and report the commit,
checks, limitations, and remaining unrelated dirty files.
