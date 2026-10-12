# M2 Ideas and Presentation Coupling Report

Status: LOCKED FOR M3 (Lead review required before runtime work)
Date: 2026-10-12
Evidence baseline: `53a2d2a` (`main`)
Modules: `studioflow`, `ideas`, `presentation`

## Decision

Ideas and Presentation will be extracted as sibling optional modules in two serial revisions: Ideas first, then Presentation. Each receives its own app directory, runtime, public door, manifest, Prisma schema file and PostgreSQL schema. Existing URLs and permission ids remain compatible. StudioFlow continues to own projects, project access, Schedule, phases/workspace media and archive policy.

No optional module may import StudioFlow internals or use StudioFlow-owned Prisma delegates after extraction. Cross-module reads and commands go through typed public functions composed at the application root. Cross-module database relations become tolerant plain ids. User-visible module gates remain built in → enabled → RBAC; internal retention and cleanup hooks run even while a module is disabled so retained data does not become unmaintainable.

## Current ownership and coupling inventory

### Ideas

| Edge | Current implementation and meaning | M3 owner/boundary |
|---|---|---|
| Composition | StudioFlow creates Ideas beside Schedule and Presentation and injects their private services. | `ideas/runtime` composes `createIdeasService` with StudioFlow and Presentation public ports. StudioFlow service no longer exposes `.ideas`. |
| Manifest/permission | Both optional manifests live in StudioFlow public code. Ideas owns `studioflow.ideas.manage`. | Move the manifest to `ideas/public`; retain the permission id and registry ownership so stored grants remain valid. Manifest still requires `studioflow`. |
| Personal cards | `SfIdeaCard` lives in `studioflow`; ownership is the plain Platform user id and another user receives not-found. | `IdeaCard` in schema `ideas`; preserve ids, owner ids, text, object keys, byte/type facts and timestamps. Platform user remains a plain id, never an FK. |
| Usage history | `SfIdeaUsage.option_id` has a cascading FK to `SfScheduleOption`; card reads join live project/name/code/label and deleted options disappear. | `IdeaUsage.option_id` is a plain indexed id. Batch-resolve live usage facts through StudioFlow public read; omit missing options and remove dangling rows idempotently. No snapshot is added because current accepted meaning is a live link that disappears, not historical evidence. |
| Project targets | Ideas directly queries projects, interprets PIC/override rules, and calls private Schedule access. | StudioFlow public `listWritableScheduleTargets` is the sole policy owner and returns only `{id,name}`. Ideas never reproduces PIC rules. |
| Schedule choices | Ideas directly queries entries/options and formats Schedule codes. | StudioFlow public `listSchedulePlacementEntries` returns display-ready entry facts. |
| Place in Schedule | Ideas copies to a Schedule-prefixed object, opens a StudioFlow transaction, calls private Schedule writers and inserts its usage in the same transaction. | StudioFlow public `placeExternalImageInSchedule` validates access, copies the source object, writes Schedule/audit atomically, and returns placement facts. Ideas then records usage in its own transaction. If that second write fails, Schedule remains valid; the command returns success plus logs/retries the missing non-authoritative usage. Repeating with the same operation id must not duplicate a Schedule option. |
| Phase-note source | Ideas directly reads `SfPhaseNoteImage`, project name and storage metadata. | StudioFlow public `readPhaseNoteImageSource` validates project/phase/image and access, returning only `{key,contentType,bytes,projectName}`. Workspace later replaces this implementation without changing the consumer contract; the public name then becomes `readWorkspaceImageSource` with a compatibility removal in the Workspace revision. |
| Save to Ideas | Direct note read, storage copy, Ideas insert and audit. | Ideas action calls the StudioFlow source read, then the Ideas-owned copy/create command. |
| Note/card to Schedule | Ideas owns both orchestration and Schedule internals. | Ideas-owned action reads its card or StudioFlow source, then calls `placeExternalImageInSchedule`. |
| Moodboard | Ideas calls private Presentation `addStoredImageToMoodboard`; note-image moodboard is also routed through Ideas actions. | Presentation public command `addStoredImageToMoodboard` is the only writer. The note/workspace UI uses a composition-owned coordinator so StudioFlow does not require Ideas merely to reach Presentation. |
| Storage | Ideas uses shared storage plus StudioFlow-private image constants and cleanup helpers; keys use `studioflow/ideas`. | Move validation/cleanup into Ideas, reuse domain-neutral platform storage APIs, and write new keys under `ideas/cards`. Existing keys are preserved and remain readable/cleanable. No file is copied during table migration. |
| Audit | Events are written with app id `studioflow` and actions `studioflow.idea.*`. | Preserve historical actions for compatibility in M3; new events use app id `ideas` and `ideas.card.*` / `ideas.usage.*`. Do not rewrite audit history. |
| Routes/UI | `/studioflow/ideas`, its actions, board and dialogs import StudioFlow runtime/private types. Notes imports Ideas route actions. | Keep URL, but assign that route subtree to app `ideas`. Route/actions import only `ideas/runtime` and declared public ports. Shared cross-module image actions move to a composition coordinator. |
| Tests/gates | StudioFlow integration tests and module-gate tests cover ownership, copy rollback, permissions and disable behavior; browser specs cover upload/use. | Move service tests with the module; retain shell gate and end-to-end routes as integration evidence. |

### Presentation

| Edge | Current implementation and meaning | M3 owner/boundary |
|---|---|---|
| Composition | StudioFlow creates Presentation and exposes `.presentation`; Ideas receives its private writer. | `presentation/runtime` owns the service. Consumers use `presentation/public`; StudioFlow service no longer exposes `.presentation`. |
| Manifest/permission | Manifest lives in StudioFlow public code; permission is `studioflow.presentation.manage`. | Move manifest to `presentation/public`; retain the permission id and `requires: ["studioflow"]`. |
| Project boards | `SfPresentationBoard.project_id` cascades from `SfProject`. | `PresentationBoard.project_id` becomes a plain indexed id in schema `presentation`. Reads validate the project through StudioFlow public access. Project deletion is not currently a product command; any future hard delete must call the module lifecycle hook first. |
| Slides/images | Slides cascade from boards; unique object keys and ordering are module-local. | Move intact to Presentation schema; keep ids, keys, ratios, order and timestamps. New keys use `presentation/<projectId>`; old keys stay valid. |
| Schedule annotations | Annotation FK points to `SfScheduleEntry` with `SET NULL`; reads join the live final/first option. | Keep a nullable indexed plain id. Batch-resolve choices/current labels through StudioFlow public reads; a missing entry renders as no linked item and is cleared opportunistically. No historical snapshot is added because accepted behavior currently clears the live link. |
| Project access/writability | Presentation imports private project access and writable-project helpers. | StudioFlow public `requireProjectDocumentRead` and `requireProjectDocumentWrite` are the sole gates. Reads must validate project access as well as `studioflow.project.read`; current list/get calls rely on their page caller and will be tightened during extraction. |
| Navigation count | StudioFlow project layout calls the private Presentation service directly. | Presentation public `countProjectBoards` is called by the shell only when built/enabled; unavailable returns zero without breaking the project header. |
| Schedule choices | Presentation directly queries entries/options and formats codes. | StudioFlow public `listPresentationScheduleChoices` supplies `{id,code,productName}` and `resolvePresentationScheduleLinks` supplies current facts in batches. |
| Moodboard writer | Ideas and Notes call a private Presentation method that creates/fetches Moodboard and copies an image. | Public idempotent command `addStoredImageToMoodboard`; it enforces Presentation permission, project access and writability itself. |
| Archive retention | StudioFlow purge directly deletes Presentation slides, counts them and cleans their object keys in the StudioFlow transaction. | Presentation public system hook `purgeArchivedProjectAssets` is idempotent, audits its own rows and removes its unique object keys. The composition-root retention coordinator invokes it even when Presentation is disabled, then invokes StudioFlow core purge. A failed hook leaves the project eligible for retry; no module data is silently skipped. |
| Audit | Events use app id/action prefix `studioflow.presentation.*`. | Preserve history; new events use app id `presentation` and `presentation.*`. No sensitive note text in metadata. |
| Routes/UI/print | Project and print routes live under StudioFlow URLs and import StudioFlow runtime; actions are mixed into the large StudioFlow actions file. | Keep URLs but assign presentation route subtrees to app `presentation`; move actions/components to that app and import only its runtime plus StudioFlow public facts. Print uses the same public read. |
| Tests/gates | StudioFlow service integration, module-gate, upload, print and acceptance specs cover behavior. | Move service tests; retain route gates, print parity and browser coverage. |

## Locked StudioFlow public contract

M3 adds a server-only public gateway under StudioFlow's existing `public/` door. Inputs carry the existing grants/actor types; outputs are explicit snapshots and never Prisma rows.

### Project and Schedule reads

- `readProjectDocumentContext({grants, actorId, projectId})` → project display facts, archived/completed state and existing access result.
- `requireProjectDocumentWrite({grants, actor, projectId})` → actor id after the canonical permission, PIC/override, archived and completed checks.
- `listWritableScheduleTargets({grants, actor})` → `{id,name}[]`.
- `listSchedulePlacementEntries({grants, actor, projectId})` → `{id,section,category,code,productName,optionCount}[]`.
- `listPresentationScheduleChoices({grants, projectId})` → `{id,code,productName}[]` after project read validation.
- `resolveScheduleUsages({grants, optionIds})` → live `{optionId,projectId,projectName,entryId,code,label}[]`; absent ids are deliberately omitted.
- `resolvePresentationScheduleLinks({grants, projectId, entryIds})` → live `{entryId,code,productName}[]`; absent/wrong-project ids are omitted.

### Commands and source media

- `placeExternalImageInSchedule({grants,actor,operationId,projectId,target,option,source})` → `{optionId,entryId,code,label}`. StudioFlow owns validation, destination copy, Schedule transaction, rollback and audit; `operationId` provides retry idempotency.
- `readPhaseNoteImageSource({grants,actor,projectId,phaseId,imageId})` → authorized immutable storage facts and project name. The Workspace revision replaces the storage lookup behind a workspace-oriented public function and updates callers in the same revision.
- `notifyScheduleOptionDeleted({optionId})` and `notifyScheduleEntryDeleted({entryId})` are composition events delivered after the StudioFlow commit to idempotent module cleanup hooks. Public reads remain missing-id tolerant, so a failed notification cannot expose stale data.

### Module lifecycle

- Ideas public: card service/actions, `removeScheduleOptionUsage(optionId)`, `removeMissingUsages()`, manifest.
- Presentation public: board service/actions, `countProjectBoards(projectId)`, `addStoredImageToMoodboard(...)`, `clearScheduleEntryLink(entryId)`, `purgeArchivedProjectAssets(projectId)`, manifest.
- Composition coordinators may call public functions from both modules, but no app public function receives another app's transaction/client or imports its runtime.

## Route and boundary changes

- Add apps `ideas` and `presentation` to the normal app inventory.
- Extend route ownership mapping for retained URLs: platform `studioflow/ideas/**` belongs to Ideas; platform `studioflow/projects/[projectId]/presentation/**` and document `studioflow/print/projects/[projectId]/presentation/**` belong to Presentation.
- The boundary checker must support these explicit longest-prefix route owners in both `(platform)` and `(document)` groups. This is ownership metadata, not an import allow-list.
- Remove Ideas/Presentation internal folders from StudioFlow after each extraction. No compatibility barrel may re-export their internals.
- Add database-boundary tests proving Ideas/Presentation code cannot access StudioFlow Prisma delegates and StudioFlow cannot access their delegates.

## Forward migration design

The checker normally forbids a migration touching two app schemas. Extraction is the one operation that cannot be both atomic and single-schema: moving an existing table with ids, constraints and data necessarily names source and destination schemas. M3 therefore adds exactly one named, owner-recorded migration-isolation exception per extraction. The exception is limited to `ALTER ... SET SCHEMA`, constraint removal/recreation, index/sequence renaming and verification guards for the named module tables; it may not mutate unrelated StudioFlow rows.

### Ideas migration

1. Create schema `ideas` and move `sf_idea_card` and `sf_idea_usage` atomically, preserving ids, data, timestamps and object keys.
2. Drop only the usage → StudioFlow Schedule option FK. Keep the card → usage cascade inside Ideas; recreate module-local names/indexes in schema `ideas`.
3. Add no duplicate table and copy no object. Guard row counts and reject orphan card usages before commit. Existing Schedule option ids remain plain values.
4. Update Prisma ownership in the same revision; generated client maps the moved tables only from `ideas.prisma`.
5. Verify counts, per-card usage counts, ids, owners, text, keys, types, bytes and timestamps before removing the StudioFlow model declarations.

### Presentation migration

1. Create schema `presentation` and atomically move the label-side enum plus board, slide and annotation tables, preserving all ids/data/order/keys/timestamps.
2. Drop only board → StudioFlow project and annotation → StudioFlow Schedule entry FKs. Keep board → slide and slide → annotation cascades inside Presentation.
3. Add no duplicate table and copy no object. Guard that every board project and non-null annotation entry exists at migration time; runtime becomes tolerant afterwards.
4. Recreate module-local indexes/constraints and update Prisma ownership in the same revision.
5. Verify board/slide/annotation counts, ids, links, keys, ratios, order and timestamps before removing StudioFlow declarations/relations.

Rollback means restoring the pre-upgrade database backup with the matching code, per D10. There is no reverse migration and no period with two writable sources.

## Implementation sequence and cost

1. **Ideas extraction — high, one Executor revision.** Public StudioFlow Schedule/media gateway, idempotent placement, own schema/runtime/public manifest, retained route ownership, action/UI mechanical moves, usage cleanup, storage/audit update and focused/integration tests.
2. **Ideas Lead acceptance — medium.** Boundary/schema review and browser journeys: private card CRUD, note-image save, Schedule new/option placement, moodboard with Presentation on/off, copy rollback and permission gates.
3. **Presentation extraction — high, one Executor revision.** Public project/Schedule gateway completion, own schema/runtime/public manifest, route/actions/UI mechanical moves, print, navigation count, moodboard writer, archive-retention hook and tests.
4. **Presentation Lead acceptance — medium.** Schema/boundary review plus board/slide/pin/print/moodboard/retention browser and migration acceptance.
5. **Workspace backend may start only after both PASS.** Its image actions target these public commands and never recreate private module coupling.

## Mandatory M3 verification

- Full migration chain on disposable rebuild PostgreSQL plus pre/post row-and-field equality queries.
- Existing stored grants and module state continue to work with unchanged ids.
- Disabled routes/actions fail before auth/validation; internal cleanup hooks remain callable by the trusted composition coordinator.
- Ideas privacy, project assignment/override, archived/completed refusal and Presentation access remain unchanged.
- Schedule deletion produces no visible dangling Idea usage or Presentation link, including simulated cleanup failure/retry.
- Upload/copy rollback, replacement/delete cleanup, archive purge and failed-object cleanup ledger remain correct.
- Unit/integration suites, typecheck, lint, architecture boundaries, legacy-runtime, production build, focused browser acceptance and whitespace checks.

## Explicit non-goals

No permission rename, new role, Schedule/MOM extraction, cross-module database FK, shared transaction/client, new event framework, new storage provider, URL redesign, Workspace implementation, deployment, push or release.
