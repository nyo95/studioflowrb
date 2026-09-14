# Active Plan

Plan ID: SF-A-DAILY-WORK-AND-PROJECT-OPERATIONS
Scope: StudioFlow recovery backbone, canonical project operations, and Today work
Status: READY
Priority: P1
Owner: Repository owner
Last updated: 2026-09-14

## Outcome

Replace the frozen StudioFlow compatibility surface with the first modular,
project-owned recovery slice: canonical `/studioflow/projects/...` navigation;
StudioFlow Clients and Projects; reversible project archive/restore; phase
template and per-project phase administration; project general todos; first-
class General and Phase Requirements; and one Activity Center as the canonical
Today surface for project-owned work.

## Context and Evidence

- PF-8 is accepted in R8.61. D-SF-01 through D-SF-07 are ratified in
  `docs/apps/studioflow/D-SF-RECOVERY-DISCOVERY.md`; `/studioflow/projects/...`
  is canonical and legacy `/projects/...` may have only controlled temporary
  redirects.
- `studioflow-project-contract.md` owns Client, Project, Phase, task, lifecycle,
  audit, and requirements semantics. `studioflow.md` owns permission vocabulary
  and cross-app boundaries.
- SF-A absorbs KB-016, KB-017, KB-018, and KB-023. Activity Center is the
  single Today surface: general project todos appear there grouped by project;
  no duplicate Today or Upcoming route is created.

## Locked Decisions

- StudioFlow owns Clients, Projects, workflow settings, phases, requirements,
  and task projections. Platform owns authentication/RBAC/audit/storage
  mechanics; Master Data is a public read-only Brand port only; BQ remains
  unrelated.
- Archive/restore is reversible and audited. No destructive deletion, retention
  policy, legacy data migration, project membership authorization, role enum,
  Schedule/Product Catalogue, MOM, delivery/client-answer exchange, SketchUp,
  Google Drive, or collaboration work is authorized.
- Pages call StudioFlow services; no page-local Prisma or authorization policy.
  Every mutation uses its app service transaction and platform audit envelope.
- Requirements are first-class records, distinct from todos/tasks and files.
  `RequirementTemplate` seeds a project snapshot transactionally; a
  `ProjectRequirement` is then independent, scope-immutable, and is General
  only when `phase_id` is null. Existing `SfFile` records may be linked as
  same-project evidence; SF-A adds no upload path. Satisfaction requires a
  note and records actor/time; evidence is optional. Reopen, archive/restore,
  and evidence unlink require reasons. §7.1.1 of the Project Contract is the
  exhaustive Requirements decision.
- Phase and Requirement-template changes never rewrite an existing project
  snapshot; template keys stay immutable after use; a project phase may be
  removed only while it holds no rounds and no Phase Requirements. Canonical
  CRUD routes are `/studioflow/projects/[projectId]/requirements`,
  `/studioflow/projects/[projectId]/phases/[phaseId]/requirements`, and the
  corresponding StudioFlow settings routes. Compatibility redirects are
  temporary and no parallel route tree is allowed.

## Acceptance Criteria

- Authorized users can create/read/update/archive/restore Clients and Projects,
  administer template and project phases under the contract guards, and manage
  General/Phase Requirement templates and project snapshots through canonical
  routes. Requirement tests prove snapshot independence, immutable used keys,
  project/phase/file scope guards, satisfaction/reopen metadata, and
  archive/evidence lifecycle rules.
- Activity Center shows open project-owned work, including general todos, in one
  project-grouped Today surface. Upcoming remains absent.
- Permissions, audit, validation/error states, phase/project scope integrity,
  archive read-only behavior, and browser navigation are covered. KB-016/017/
  018/023 are closed only when their observable contract behavior is proven.
- Master Data/BQ behavior and Foundation boundaries remain unchanged.

## Verification

- Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, this plan, the two StudioFlow
  contracts, D-SF discovery, and affected current implementation before edits.
- Use only the disposable rebuild test database after explicit target validation.
  Add migrations only where the contract requires persistence; make them
  additive and verify fresh deployment.
- Run focused tests plus `npm test`, typecheck, lint, boundary and legacy-runtime
  checks, production build, migration validation where applicable, and whitespace
  review. Record each unfixed observed defect in `docs/knownbug.md`.

## Reviewer Acceptance

Using authorized and limited-grant kantor fixtures at desktop and 375 px, walk
Client/Project create-edit-archive-restore, phase template/project phase guards,
general todo and Requirement creation/read states, Activity Center grouping, and
canonical plus compatibility redirects. Verify denied grants and signed-out
access fail safely. Do not claim acceptance without this browser evidence.

## Risks and Recovery

- SF-A is one coherent backbone cutover. If a contract gap needs a new product,
  authorization, retention, or destructive-data decision, stop and return it as
  a blocker rather than guessing.
- Retain the frozen compatibility behavior until the canonical route/workflow
  replacement passes; remove dead redirected controls only once no supported
  surface relies on them.

## Executor Prompt

You are the Executor. Location: kantor. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, and this `PLAN.md`, then implement the entire READY
SF-A daily-work and project-operations outcome. Preserve unrelated owner work,
respect the ratified StudioFlow contracts and recovery boundaries. In
particular, implement §7.1.1 exactly: snapshot active General and per-phase
RequirementTemplates transactionally; make ProjectRequirements immutable in
scope; use existing same-project `SfFile` records as optional evidence only;
enforce the stated satisfaction, archive, evidence, and route guards; and do
not add a new permission, upload flow, checklist, or parallel CRUD surface.
Run the required checks only against the approved disposable rebuild database,
update the changelog/ledgers, and create one local revision commit. Stop only
for a material locked-decision conflict, unsafe boundary, or failed mandatory
evidence; otherwise report the commit, checks, limitations, and remaining
unrelated dirty files.
