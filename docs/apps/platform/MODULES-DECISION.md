# Installable Modules — Decision Record

Status: ACCEPTED (owner, 2026-10-09; recorded by the Lead in R8.494).
Amended: owner, 2026-10-10 (D5 web console, D7 dropped, D10 updates; R8.501).
Amended: owner, 2026-10-10 (scope reset: web console cancelled, M5 code-stripped
builds deferred; R8.502).
Scope: how StudioFlowRB becomes a platform of separately versioned, separately
switchable modules, so a customer runs only what it has, and a new capability can
be used on its own first and injected later.

**Purpose (owner, 2026-10-10).** The module system exists for decoupling,
versioning, switching modules on/off and controlled updates, so production at
the office never receives development automatically. It is **not** a licensing,
DRM, anti-copy or anti-tamper system: StudioFlowRB is custom internal software
for one office, protected by a private repository and the owner's agreement
with the office, not by technical locks. Do not add licence servers, signed
entitlements, per-customer encryption, code obfuscation or hardened owner
consoles without a new explicit owner decision.

## Why now

Every capability added inside StudioFlow makes a later split more expensive. The
evidence on 2026-10-09: Ideas Board and Presentation live in `src/apps/studioflow/`
and in the `studioflow` schema, with database relations into the Schedule
(`SfIdeaUsage.option_id → SfScheduleOption`, `SfPresentationAnnotation.schedule_entry_id
→ SfScheduleEntry`, cascade deletes) and direct imports of Schedule internals
(`ideas/service.ts` imports `../schedule/sync`, `../schedule/service`,
`../presentation/service`). Neither can be removed today without editing StudioFlow.
The app-level split (own schema, `public/` doors, `check:boundaries`) already
exists and is the base this decision extends.

## Decisions

**D1. What "install" means.** Two layers, never mixed:

1. **Built in** (build time): the modules listed in the composition root are part
   of a build. A module not listed is *not installed*. Packaging a customer
   build without a module's code is a later phase (M5); until then "not
   installed" is enforced at runtime (routes 404, actions refuse, nav hidden).
2. **State** (runtime, per server): `ENABLED` or `DISABLED`, stored by Platform.

Dropping a code package into a running server (WordPress-style) is **not** done:
Next.js compiles routes at build time, and runtime code loading would be costly
and unsafe. A new module reaches a customer as a new build plus an update.

**D2. A module is a business capability**, not a component. Good: StudioFlow,
Master Data, BQ, Ideas Board, Presentation, SketchUp, AI Assistant, Automation,
Advanced Reporting. Not a module: a button, a filter, the notes composer.
Existing apps are modules too. A module keeps today's layout
(`src/apps/<id>/`, its routes, its own `prisma/schema/<id>.prisma` and Postgres
schema); folders are not reshuffled.

**D3. Every module has a manifest** in its `public/` door, registered by the
Shell (today `src/app/app-registrations.ts`): `id`, `name`, `version` (semver
`MAJOR.MINOR.PATCH`), `kind` (`core` = cannot be disabled, `optional`),
`parent` (optional: the app it extends, e.g. `ideas` → `studioflow`),
`requires` (other modules it reads through their `public/`), permissions,
and launcher/nav metadata. Platform validates the
graph at boot (unknown id, cycle, a required module missing → boot fails).

**D4. Gates, in this order:** built in → enabled → RBAC (entitlement dropped, D7).
RBAC decides *who* may use a module; it never decides *whether the customer
has it*. A disabled module: its nav entries and launcher tile are hidden, its
pages return not-found, its server actions and integration routes refuse with
`MODULE_DISABLED`, its background jobs skip, other modules' reads of it return
"not available" instead of failing. **Its data is kept.** Removing data is a
separate, explicit, audited purge by the System Owner, never a side effect.

**D5. Two kinds of authority.**

- **Company Administrator** (the business): users, roles, projects, company
  data, every enabled module. This is the existing `platform-owner` role,
  shown as "Company Administrator". It stays an ordinary RBAC role.
- **System Owner** (the developer): install/enable/disable modules, versions,
  purges, recovery. **System Owner rights are not RBAC
  permissions.** They are not in the permission vocabulary, so no role can
  hold them and no Company Administrator can grant them, including to
  themselves. System operations are audited with a `system` actor; the app
  UI (Settings > Modules) shows module state read-only.
- **Web console cancelled (owner, 2026-10-10, R8.502).** The `/system` web
  console with authenticator sign-in (R8.501, WO-SYSTEM-01) is not built: it
  was more protection than one office needs. System Owner operations stay a
  server command, documented step by step for a non-programmer in
  `docs/operations/MODULES-RUNBOOK.md`. Switching a module is rare.

**D6. Versions.** Each module carries its own semver in the manifest; Platform
records the version each module last ran with. Patch = fixes, minor =
compatible additions, major = a new product line (may need a migration and an
upgrade agreement). Release tags are `<module>@x.y.z`; a maintenance branch
(`<module>/1.x`) is opened only when a customer stays on an old major while
development moves on. One monorepo, never one codebase per customer.
Migrations stay in the one Prisma history (Prisma has a single migration
folder); a module's migration directories are named with its id
(`<timestamp>_<module>_<what>`) so a module's history can be listed.

**D7. Entitlement — DROPPED (owner, 2026-10-10).** No licence server, no
licence file, no signed entitlement and no per-module licence. A module runs when it is built in and the System Owner
switched it on. The gates are built in → enabled → RBAC.

**D8. New capabilities are born as modules** (effective now). Any new business
capability gets its own module id, manifest, schema and `public/` door from its
first commit, and reaches other modules only through their `public/`. It may
not add database relations into another module's schema; it stores plain ids
plus the snapshot it needs, and handles "the thing I point to is gone" itself.

**D9. Ideas Board is the pilot extraction** (M3), then Presentation. The
StudioFlow → module edges become calls through StudioFlow's `public/`
(e.g. "add this card to a Schedule option" goes through the existing Schedule
writer behind a public function), and the two foreign keys become plain ids
with a cleanup on delete.

**D10. Updates (owner, 2026-10-10).** A finished module or app version is
published by the owner as a GitHub release. The receiving server only decides
**install now or not**: a server command shows the available versions with
what changed, and installing one backs up the database first, installs the
release, migrates, rebuilds and restarts, and goes back to the previous version
and backup automatically if any step fails. The office stays on the version
agreed with it; a new major (e.g. Phase 2.x) reaches it only when agreed.

**Going back to an older version** (audit 2026-10-10, R8.503): the database
moves forward only. A downgrade is never "install the older code on the current
database"; it is restoring the backup taken right before the upgrade together
with the code that ran on it. The updater refuses to install a version older
than the one the database last ran. `module_state.last_version` is a display
value that boot overwrites with the running code's version
(`synchronizeModuleVersions`); it is not evidence that an upgrade or downgrade
succeeded and must not be used as the compatibility check. WO-SYSTEM-02 keeps
the code version, the applied migration history and the backup it pairs with as
separate facts, and checks before installing. Nothing installs by itself. The
exact mechanism depends on how the office server runs the app and is planned
in WO-SYSTEM-02.

## Phases

| Phase | What | Lane |
|---|---|---|
| M0 | This record, harness rules (D8) | Lead, R8.494 |
| M1 | Module manifest + registry, runtime state ENABLED/DISABLED, the four-gate check without entitlement, `MODULE_DISABLED`, System Owner command, read-only Modules page; Ideas and Presentation registered as optional modules of StudioFlow and gated | Executor backend, Lead UI page |
| M2 | Discovery report: every coupling of Ideas and Presentation, the exact public functions StudioFlow must expose, the migration that moves their tables, cost | Executor report, Lead locks |
| M3 | Ideas Board extracted to its own module and schema; Presentation next | Executor |
| M4 | ~~Signed entitlement~~ dropped (D7, 2026-10-10) | — |
| S1 | ~~System Owner web console~~ cancelled (owner 2026-10-10); runbook for the server command instead | Lead, R8.502 |
| S2 | Updates from GitHub releases with backup and automatic roll-back, as a server command (WO-SYSTEM-02, D10) | Lead plans after the office-server facts |
| M5 | Release tags and a Windows service installer. Customer builds that leave out code: deferred, not planned (owner 2026-10-10) | Lead plans, later |

## Non-goals now

Runtime code download, a public plugin marketplace, per-module databases,
microservices, per-customer forks, licensing, DRM, anti-copy or anti-tamper
mechanisms, a hardened web console for the System Owner.

## Harness impact

`AGENTS.md` (Modules paragraph), `docs/agent/EXTENSIONS.md` (an extension is an
optional module; D8), `docs/MODULE-BOUNDARIES.md` (module layer),
`docs/agent/PLAN-TEMPLATE.md` (each plan names its module). The boundary
checker gains a manifest rule in M1.
