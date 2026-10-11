# Active Plan

Plan ID: WO-DEVELOPER-01 (Developer web console: authenticator sign-in, modules On/Off)
Scope: Platform capability `developer-access` (new, domain-neutral) and a `/system` console
Module(s): platform
Target revision: next unused after R8.503 (check `CHANGELOG.md`)
Status: READY
Priority: P1
Owner: owner decisions 2026-10-10 and terminology clarification 2026-10-11, `docs/apps/platform/MODULES-DECISION.md` D5 amendment, D7, D10 (read it first)
Last updated: 2026-10-11 (Lead)

WO-MODULES-M1 is done (R8.495, R8.498 Executor; R8.500 Lead). One walk remains
in `docs/BACKLOG.md` (note-image buttons).

## Outcome

1. The Developer opens `/system` in any browser, types the 6-digit code
   from an authenticator app (or one printed recovery code), and gets a
   console with every module and an On/Off switch for optional modules.
2. The authenticator is enrolled only from the server:
   `npm run studioflow -- developer setup` prints a QR code (and the setup key as
   text) in the terminal plus 10 one-time recovery codes; it refuses when an
   enrolment exists. `npm run studioflow -- developer reset` removes the enrolment,
   every recovery code and every console session.
3. Nobody without the code reaches anything under `/system` except its sign-in
   page; with no enrolment the sign-in page says the console is not set up and
   accepts nothing.
4. Every sign-in success, failure, lockout, recovery-code use, sign-out and
   module change is audited with a `SYSTEM` actor.
5. No app account, role, or permission can open the console or change module
   state; the Platform Owner still sees Settings > Modules read-only.

## Context and Evidence

- Module state writer: `src/platform/core/modules/admin.ts` (`changeModuleState`),
  read API `src/platform/core/modules/state.ts`, CLI `scripts/studioflow.ts`.
- App session pattern to mirror, not reuse: `platform.Session` (SHA-256 of a
  random token is the lookup key) and `src/platform/core/auth/**`.
- `check:boundaries` rule "module state writer import" (R8.498) currently lets
  only `scripts/**` and `src/platform/core/modules/**` import `modules/admin`.
- Audit: `prepareAuditEvent` / `createAuditEventWriter`, actor `{ kind: "SYSTEM", label }`.
- `SESSION_SECRET` is already required at boot (`src/instrumentation.ts`).

## Locked Decisions

1. **New Platform capability** `src/platform/core/developer-access/` (ADD). It owns
   enrolment, TOTP verification, recovery codes, console sessions, lockout and
   the console's module commands. It is not part of `core/auth` and never
   produces a `Principal` or grants.
2. **TOTP** per RFC 6238 implemented with `node:crypto` (HMAC-SHA1, 30 s step,
   6 digits, window ±1 step), constant-time compare. A code's time step is
   stored after success; the same or an older step is refused (replay).
   Issuer "StudioFlowRB", account label "Developer".
3. **Secret at rest**: the 20-byte TOTP secret is stored encrypted with
   AES-256-GCM under a key derived by HKDF-SHA256 from `SESSION_SECRET` with
   info `"studioflow:developer:totp"`. Rotating `SESSION_SECRET` therefore
   requires `developer reset` + `setup`; say so in the CLI help.
4. **Recovery codes**: 10 codes of 10 characters from an unambiguous alphabet,
   shown once, stored as SHA-256 hashes, each usable once.
5. **Schema** (one migration, `platform` schema, name contains `platform_developer_access`):
   `developer_access` (single row, `id` fixed `'developer'`, `totp_secret_enc`,
   `last_step` bigint nullable, `failed_count` int, `locked_until` timestamptz
   nullable, `enrolled_at`), `developer_recovery_code` (`code_hash` PK,
   `used_at` nullable), `developer_session` (`token_hash` PK, `created_at`,
   `last_seen_at`, `expires_at`, `ip` text nullable, `user_agent` text nullable).
6. **Lockout** (the console is reachable from anywhere, owner 2026-10-10): 5
   consecutive wrong codes lock sign-in for 15 minutes for everyone; success
   resets the counter. Responses never say whether the console is enrolled
   beyond the "not set up" state, and never which part of a code was wrong.
7. **Console session**: random 32-byte token in cookie `sf_developer`
   (`HttpOnly`, `Secure` outside development, `SameSite=Strict`, `Path=/system`),
   SHA-256 in the table; idle timeout 15 minutes, absolute 60 minutes; sign-out
   deletes the row. Independent of the app's user session: a signed-in app
   user gets nothing extra, and the console works with no app account.
8. **Routes**: a new top-level route group `src/app/(system)/system/**`
   (`/system/login`, `/system`) outside the `(platform)` shell, `noindex`, never
   linked from app navigation. Every page and server action under it calls one
   guard (`requireDeveloperSession`) first. Module commands from the console
   call `changeModuleState` with actor label `developer-web`.
9. **Boundary rule**: extend the R8.498 rule so `src/platform/core/developer-access/**`
   may import `modules/admin`; `src/app/(system)/**` reaches it only through the
   `developer-access` public API. Add a fixture proving `src/app/(platform)/**`
   still cannot.
10. **Dependency**: `qrcode` (MIT) for the terminal QR in the CLI only (plus its
    types if needed). No other new dependency. The web never shows the secret.
11. Audit actions: `platform.developer.signed_in`, `.sign_in_failed`,
    `.locked`, `.recovery_code_used`, `.signed_out`, `.enrolled`, `.reset`;
    module changes keep `platform.module.enabled|disabled`. Never put a code,
    secret or token in audit metadata or logs.

## UI Contract

Executor: functional minimal pages only — a sign-in form (code field, "use a
recovery code" switch, error/lockout messages) and a console page listing
modules with On/Off for optional modules and a sign-out button, using UI Engine
components. Lead afterwards owns the final layout, copy and the Indonesian/English
wording, and the confirmation dialog on Off.

## Boundaries and Non-goals

No updates from GitHub (WO-DEVELOPER-02), no licence (D7 dropped), no purge, no
change to app login, RBAC, or Settings > Modules. No email/SMS. No second owner.

## Acceptance Criteria

- Unit: TOTP against the RFC 6238 SHA-1 test vectors (8-digit vectors truncated
  per the RFC algorithm, plus own 6-digit cases); window ±1; replay refused;
  encryption round-trip and a wrong key failing; recovery code single use.
- Integration (disposable DB): setup refuses a second enrolment; sign-in with a
  valid code creates a session and an audit row; 5 wrong codes lock for 15
  minutes (inject the clock) and audit `.locked`; a used recovery code is
  refused the second time; an expired or idle session is refused; reset removes
  enrolment, codes and sessions; a console module change writes state + one
  audit row with label `developer-web`; every `/system` page and action
  refuses without a session (pages redirect to `/system/login`, actions return
  an auth error); an app user session with every permission is refused.
- No permission id in the registry mentions `system` or `module` (existing test
  extended).
- `check:boundaries` passes with the new fixture.

## Verification

`npm run typecheck`, eslint, `npm test`, `check:boundaries`,
`check:legacy-runtime`, `prisma migrate` on a verified disposable rebuild-only
database, production build, and the CLI `developer setup` / `reset` against that
database (never print a real secret in the handoff).

## Reviewer Acceptance

Lead: enrol with a real authenticator app on an approved cloud test database, sign in
from the browser, switch Ideas off and on from the console, trigger the
lockout, use a recovery code, check Settings > Modules follows.

## Executor Prompt

You are the Backend Executor. Location: cloud. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`,
`docs/apps/platform/MODULES-DECISION.md` (D5 amendment, D7, D10) and `PLAN.md`
(WO-DEVELOPER-01), then implement the READY outcome and nothing beyond it as one
local revision commit numbered with the next unused revision in `CHANGELOG.md`:
the Platform `developer-access` capability (TOTP with `node:crypto`, encrypted
secret, recovery codes, console sessions, lockout, audit), the migration, the
`developer setup|reset` commands with a terminal QR (`qrcode` is the one approved
dependency), the `(system)` route group with sign-in and a minimal console that
switches optional modules through `changeModuleState`, and the boundary rule
extension with a fixture. The console is not an app account or permission; never
log or print codes, secrets or tokens. Database commands only against a verified
disposable rebuild-only database. Stop with BLOCKED / CONFLICT if any locked
decision cannot be met as written. Run the checks in Verification, then reply
with only a Planner/Reviewer prompt: commit, checks with results, limitations,
dirty files, and a request for verdict.
