# Active Plan

Plan ID: WO-PLAT-INTEGRATIONS-01 (integration foundation for companion apps)
Scope: Platform capability that lets outside clients (SketchUp Ruby plugin first) call a versioned HTTP API with a revocable access token, safely and retry-proof. No SketchUp feature in this plan.
Target revision: R8.456 (one Executor commit). R8.454 is this plan plus `docs/agent/EXTENSIONS.md`; R8.455 locks the permission decision (Locked Decision 12).
Status: READY
Priority: P2
Owner: Product Owner (2026-10-09: "Codex yang atur, kamu siapkan dasarnya").
Last updated: 2026-10-09

## Outcome

A person can create a personal access token, a client can send it as
`Authorization: Bearer …` to `/api/integrations/v1/...`, and the platform treats
the call as that person with no more power than the person and the token's scopes
allow. Every state-changing call may carry `Idempotency-Key`; a retry returns the
first answer instead of doing the work twice. One reference endpoint
(`GET /api/integrations/v1/ping`) proves the whole chain. Later extension Work
Orders (SketchUp sync, others) build only on this kit.

## Context and Evidence

- Today the only HTTP route that acts for a user is
  `src/app/api/studioflow/deliverables/route.ts`, authenticated by the browser
  session cookie (`requirePrincipalGrants`, `src/platform/core/auth/request.ts`).
  A Ruby plugin has no cookie, so a token path is the missing capability.
- Legacy SketchUp bridge (read-only evidence, legacy HEAD `102ff85`, branch
  `main`, working tree dirty only in `next.config.ts`; the commit pinned in the
  Rework Contract `c4b0c46` is not in that clone): `src/app/api/sketchup/sync/route.ts`
  (GET returns pending merge actions; POST takes `{materials[], ffes[], full_snapshot}`),
  `src/app/api/sketchup/merge/confirm/route.ts` (POST `{actionIds[]}`),
  `src/extensions/sketchup/utils/merge-queue.ts`. Legacy auth was one random
  `api_key` per SketchUp project, no user, no scopes, no idempotency, no audit.
  Classification: wire shape KEEP (for the later SketchUp WO), per-project
  anonymous key PURGE, no-idempotency FIX, direct Prisma in the route PURGE.
  The Ruby plugin source is not in the legacy repo; its payload is the contract.
- Boundary rules: `docs/MODULE-BOUNDARIES.md`. Extension rules:
  `docs/agent/EXTENSIONS.md` (read it fully).

## Locked Decisions

1. **Token belongs to a user.** Effective rights = the user's current grants ∩ the
   token's scopes. Removing a role from the user immediately weakens the token.
   A disabled/deleted user's tokens stop working.
2. **Storage:** new Platform tables in the `platform` schema (own migration):
   `integration_token` (id, userId, label, tokenPrefix, tokenHash, scopes[],
   expiresAt?, lastUsedAt?, revokedAt?, createdAt) and
   `integration_request` (idempotency ledger: tokenId, key, method+path,
   requestHash, status, responseStatus, responseBody json, createdAt; unique on
   tokenId+key). Only a SHA-256 hash of the secret is stored; the secret is
   returned once at creation, high-entropy (≥ 32 random bytes), format
   `sfk_<prefix>_<secret>`. Never log or audit the secret.
3. **Scopes are permission ids** already in the RBAC vocabulary (or a small
   `integration:*` scope list owned by the extension that defines the route). A
   route declares the scope it needs; the kit checks it, then checks the user's
   grant for the same action. Default token expiry is optional; revocation is
   immediate.
4. **Route kit** `@platform/core/integrations` (public barrel): a wrapper that
   authenticates the token, loads the user's grants, enforces scope, parses the
   body with a zod schema, applies idempotency, maps `AppError` to the existing
   safe error payload (`toSafeErrorPayload`, same status mapping as the
   deliverables route), sets `Cache-Control: no-store`, and adds a request id.
   Reuse existing auth, RBAC, errors, audit, and DB-runtime APIs; do not
   duplicate them. Rate limiting: a simple per-token limit if the platform
   already has a primitive; otherwise record it as a BACKLOG `[PLANNED]` item
   rather than inventing one.
5. **Idempotency semantics:** same key + same request hash → replay stored
   response (header `Idempotency-Replayed: true`); same key + different hash →
   `CONFLICT`; a request still in progress with the same key → `CONFLICT`
   (retry later). Keys expire after 24 h (cleanup path, no scheduler required in
   this WO). GET needs no key.
6. **Audit:** token created / revoked and every integration write are audited
   with `appId: "platform"`. Add `"integrations"` to `AUDIT_APP_IDS` only if the
   Executor finds the existing ids cannot describe an extension's writes;
   otherwise keep it unchanged and let the first extension WO add its own id.
7. **Management commands** (service-level, permission-checked, audited): create
   (own token only; label required), list own (never returns hashes), revoke own.
   Owner/admin ability to list or revoke anyone's token is a separate new
   permission. UI for managing tokens is the **Lead's**, built after this commit
   (account page). The Executor adds the service API and tests, not the page.
8. **Reference endpoint** `GET /api/integrations/v1/ping` → `{ ok: true, data:
   { userId, displayName, scopes, serverTime, apiVersion: "v1" } }`. A second
   endpoint `POST /api/integrations/v1/ping` with an `Idempotency-Key` and a tiny
   body exists only to prove idempotent replay in tests; mark both as the
   reference for later extensions. No other endpoint.
9. **Boundary checker:** add a rule (with accepting and rejecting fixtures) that
   files under `src/app/api/integrations/**` may import only `@platform/core/integrations`,
   `@platform/core/errors`, an extension's `public/`/`contract`/`runtime` lane,
   and zod, and never Prisma or another app's internals.
10. **No new runtime dependency.** Use Node `crypto` for hashing and random bytes.
11. **Out of scope:** any SketchUp, chatbot, or AI behaviour; OAuth flows; webhooks
    or outbound calls; a public developer portal; CORS for browsers (clients are
    native tools).

12. **Permissions (Lead decision on the Executor's BLOCKED report, option A).** Add
    three Platform permissions to the RBAC registry, in the existing registry/seed
    pattern, with registry tests:
    - `platform.integration.manage` — create, list and revoke **one's own** tokens.
      Granted to no role by default except the existing top administrator role
      (follow how `platform.settings.manage` is seeded); owners assign it to other
      roles in the existing role screen.
    - `platform.integration.admin` — list and revoke **anyone's** tokens (never
      create for someone else, never see secrets). Same default seeding.
    - `platform.integration.ping` — lets a user's token call `ping`. Seeded like
      `.manage`; the owner assigns it to other roles.
    A route's required grant is declared in the route and checked with the user's
    live grants in addition to the token scope. `ping` requires scope
    `integration:ping` and grant `platform.integration.ping`. Token creation may only
    request scopes whose matching grant the creator holds at creation time.

## Business Rules and Architecture Constraints

Capability classification: auth/RBAC/audit/errors/db runtime = **REUSE**; token +
route kit + idempotency ledger = **ADD** (domain-neutral, one canonical
implementation in Platform, consumer matrix = future extensions); each future
extension's scope list and payloads = **APP-OWNED**. Platform must not import any
app. Do not touch protected-core files outside `src/platform/core/integrations/`,
its migration/schema, the checker, and the files needed to export/wire them.

## Backend Contract

Outcome-level: the kit's public API (create route handler, token service, types),
the schema, and the documented error codes (`UNAUTHENTICATED` for missing/bad/
expired/revoked token, `FORBIDDEN` for missing scope or grant, `VALIDATION`,
`CONFLICT`). Wire envelope identical to the deliverables route:
`{ ok: true, data }` / `{ ok: false, error }`. Document the contract and the
"how to add an endpoint" recipe in `docs/apps/platform/INTEGRATIONS.md` (new, short).

## UI Contract

None from the Executor. Expose service functions the Lead's token-management UI
will call.

## Boundaries and Non-goals

See Locked Decision 11 and `EXTENSIONS.md` protected core. Preserve unrelated
dirty files; stage only owned files.

## Acceptance Criteria

- Missing, malformed, unknown, expired, revoked tokens → 401 with the safe payload.
- Token of a disabled user, or a user who lost the required grant → 401/403.
- Scope absent → 403; scope present but user grant absent → 403.
- `GET ping` works; secret never appears in logs, audit rows, list output.
- Idempotent replay, key reuse with a different body, and in-progress key behave
  as in Locked Decision 5, tested.
- Boundary checker rejects a fixture route importing Prisma or an app internal and
  accepts the legal one.
- Migration applies cleanly on a fresh test database and on top of the current dev
  schema.

## Verification

`npm run typecheck`, `npm run lint`, `npm run check:boundaries`, `npm test` (the
integration tests use the disposable test database only). Migrate both the dev and
test databases afterwards (`docs/agent/README.md`, "Local database sync").

## Reviewer Acceptance

Lead review of the diff and a manual `curl` of `ping` with a real token after the
token page exists. No browser acceptance needed for this commit.

## Regression Risks and Recovery

Risk: a shared-layer change breaking auth. Mitigation: the cookie path is not
modified; the token path is a separate resolver. Recovery: revert the commit; the
migration only adds tables.

## Executor Prompt

You are the Backend Executor. Location: rumah. Read `AGENTS.md`,
`docs/agent/EXECUTOR.md`, `docs/agent/EXTENSIONS.md`, and this `PLAN.md`, then
implement the entire READY backend outcome and nothing beyond it. Inspect current
repository evidence, preserve unrelated owner work, make sound in-scope
implementation decisions, run the required checks, update `CHANGELOG.md`, and
create the target local revision commit R8.456. Stop only for a material
locked-decision conflict or unsafe boundary, using the BLOCKED / CONFLICT report;
otherwise finish the coherent outcome and report the commit, checks, limitations,
and remaining unrelated dirty files.
