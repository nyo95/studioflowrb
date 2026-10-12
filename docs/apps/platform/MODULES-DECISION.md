# Installable Modules — Decision Record

Status: ACCEPTED (owner, 2026-10-09; recorded by the Lead in R8.494).
Amended: owner, 2026-10-10 (D5 web console, D7 dropped, D10 updates; R8.501),
and 2026-10-11 (D5 terminology: Platform Owner and Developer; R8.503; core-app
bundle and Developer-controlled module permission ceiling; R8.504; isolated
Developer web console delivered in R8.506; locked Platform Owner authority and
task-based custom-role matrix in R8.507).
Scope: how StudioFlowRB becomes a platform of separately versioned, separately
switchable modules, so a customer runs only what it has, and a new capability can
be used on its own first and injected later.

**Purpose (owner, 2026-10-10).** The module system exists for decoupling,
versioning, switching modules on/off and controlled updates, so production at
the office never receives development automatically. It is **not** a licensing,
DRM, anti-copy or anti-tamper system: StudioFlowRB is custom internal software
for one office, protected by a private repository and the owner's agreement
with the office, not by technical locks. Do not add licence servers, signed
entitlements, per-customer encryption or code obfuscation without a new
explicit owner decision. The Developer console is an operational control, not
a licensing or copy-protection mechanism.

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

**D2. A module is a business capability**, not a component. Good: Ideas Board,
Presentation, SketchUp, AI Assistant, Automation, Advanced Reporting. Not a
module: a button, a filter, the notes composer. **StudioFlow, Master Data and
BQ are one core application bundle:** their manifests describe dependencies
and versions, but they are always built in and cannot be switched off. The
Developer switches only optional modules within those apps. A module keeps today's layout
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
separate, explicit, audited purge by the Developer, never a side effect.
The Role matrix shows only permissions owned by modules currently enabled by
the Developer. A crafted Role request for a disabled-module permission is
refused server-side. Existing grants for a module switched Off remain stored
but grant nothing; they return when the Developer switches the module On, so
an operational switch never destroys the Platform Owner's role design.

**D5. Two kinds of authority.**

- **Platform Owner** (the business): users, custom roles, projects and company
  data. The exact system role `platform-owner`, shown as "Platform Owner",
  automatically receives every non-position permission currently allowed by
  the Developer module ceiling. Its access is not editable, and custom roles
  cannot hold `platform.*` authority. The owner may grant app work only within
  that Developer-controlled ceiling; Designer/Drafter positions remain explicit.
- **Developer**: install/enable/disable modules, versions, purges, recovery.
  **Developer rights are not RBAC
  permissions.** They are not in the permission vocabulary, so no role can
  hold them and no Platform Owner can grant them, including to
  themselves. System operations are audited with a `system` actor; the app
  UI (Settings > Modules) shows module state read-only.
- **Amended 2026-10-10 (owner):** the owner is not a programmer and must be
  able to run the system without an AI assistant, so Developer operations
  get a **web console** (`/system`) in addition to the server command. It is
  not an app account and not an RBAC role: it has its own sign-in, an
  **authenticator app code** (TOTP, RFC 6238, scanned once as a QR) with
  printed recovery codes, its own short session, and it is reachable from
  anywhere (owner's choice), so it is protected by lockout after repeated
  wrong codes, replay refusal, short sessions and an audit row for every
  sign-in attempt and change. Enrolment and reset of the authenticator stay a
  server command (`npm run studioflow -- developer setup|reset`), so nobody who
  only reaches the web can claim the console.

**D6. Versions.** Each module carries its own semver in the manifest; Platform
records the version each module last ran with. Patch = fixes, minor =
compatible additions, major = a new product line (may need a migration and an
upgrade agreement). Release tags are `<module>@x.y.z`; a maintenance branch
(`<module>/1.x`) is opened only when a customer stays on an old major while
development moves on. One monorepo, never one codebase per customer.
Migrations stay in the one Prisma history (Prisma has a single migration
folder); a module's migration directories are named with its id
(`<timestamp>_<module>_<what>`) so a module's history can be listed.

**D7. Entitlement — DROPPED (owner, 2026-10-10).** No license file and no
per-module licence. A module runs when it is built in and the Developer
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
**install now or not**: the Developer console shows "version X available"
with what changed, and **Install** backs up the database first, installs the
release, migrates, rebuilds and restarts, and goes back to the previous version
and backup automatically if any step fails.

**Going back to an older version** (audit 2026-10-10): the database moves
forward only. A downgrade is never "install the older code on the current
database"; it restores the backup taken immediately before the upgrade together
with the code that ran on it. The updater must refuse an older application over
a newer database. `module_state.last_version` is display-only because boot
updates it to the running manifest version; it is not proof that an upgrade or
downgrade succeeded. The updater must track the code version, applied migration
history and matching backup as separate facts before installing.

Nothing installs by itself. The exact mechanism depends on how the office
server runs the app and is planned
in WO-DEVELOPER-02.

## Phases

| Phase | What | Lane |
|---|---|---|
| M0 | This record, harness rules (D8) | Lead, R8.494 |
| M1 | Module manifest + registry, runtime state ENABLED/DISABLED, the four-gate check without entitlement, `MODULE_DISABLED`, Developer command, read-only Modules page; Ideas and Presentation registered as optional modules of StudioFlow and gated | Executor backend, Lead UI page |
| M2 | Discovery report: every coupling of Ideas and Presentation, the exact public functions StudioFlow must expose, the migration that moves their tables, cost | Executor report, Lead locks |
| M3 | Ideas Board extracted to its own module and schema; Presentation next | Executor |
| M4 | ~~Signed entitlement~~ dropped (D7, 2026-10-10) | — |
| S1 | Developer web console: authenticator sign-in, modules On/Off (WO-DEVELOPER-01) | Executor backend, Lead UI |
| S2 | Updates from GitHub releases with backup and automatic roll-back (WO-DEVELOPER-02, D10) | Lead plans after the office-server facts |
| M5 | Customer build profiles that leave out code, release tags, Windows service installer | Lead plans, later |

## Non-goals now

Runtime code download, a public plugin marketplace, per-module databases,
microservices, per-customer forks.

## Harness impact

`AGENTS.md` (Modules paragraph), `docs/agent/EXTENSIONS.md` (an extension is an
optional module; D8), `docs/MODULE-BOUNDARIES.md` (module layer),
`docs/agent/PLAN-TEMPLATE.md` (each plan names its module). The boundary
checker gains a manifest rule in M1.
