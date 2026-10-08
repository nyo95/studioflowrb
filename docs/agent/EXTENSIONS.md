# Extension Harness (companion apps and injected features)

Status: ACTIVE (written R8.454). Applies to the Backend Executor (Codex) when a
Work Order says "extension". Read after `AGENTS.md` and `EXECUTOR.md`.

An **extension** is a feature that lives *beside* the finished apps and talks to
them only through their public doors: the SketchUp Ruby plugin sync, an AI
chatbot, a future mobile or desktop companion. It never edits how StudioFlow,
Master Data, BQ or Platform work inside.

## The two doors (the only ways in)

```text
  outside client (Ruby plugin, mobile, script)          inside feature (AI chatbot)
        │  Bearer token                                        │  user session
        ▼                                                      ▼
  src/app/api/integrations/v1/<extension>/…   (route kit)   server action / route
        │                                                      │
        └──────────────► src/apps/<extension>/ ◄───────────────┘
                              │  only through
                              ▼
        src/apps/<app>/public/   (StudioFlow, MasterData, BQ)   +   @platform/*
```

1. **Outside door:** HTTP under `/api/integrations/v1/<extension>/…`, built only
   with the Platform integration kit (`@platform/core/integrations`): token
   authentication, scope check, zod validation, idempotency, safe error payload.
   A route file stays thin (parse → call the extension service → respond).
2. **Inside door:** the extension's own service, called from its own pages or
   actions with the user's normal session.

Both doors reach other apps **only** through that app's `public/` folder.

## Folder template

```text
src/apps/<ext>/
  public/index.ts        # what other code may import from this extension (often empty)
  runtime.ts             # server composition; only the Shell imports it
  domain/                # pure rules, no Prisma
  services/              # use cases, own transactions, audit writes
  contract.ts            # zod schemas of the wire format (single source of truth)
  *.test.ts / *.integration.test.ts
src/app/api/integrations/v1/<ext>/<route>/route.ts   # thin route lane
src/app/(platform)/<ext>/…                           # UI is the Lead's lane
prisma/schema/<ext>.prisma                           # own @@schema("<ext>")
docs/apps/<ext>/CONTRACT.md                          # wire contract + decisions
```

## Hard rules (the boundary checker enforces most of them)

- Own schema only. No `@relation` to another schema; keep other apps' records as
  plain ids plus a snapshot of the facts you need.
- Import another app only from `<app>/public`. If the public door lacks what you
  need, you stop (BLOCKED / CONFLICT) and ask the Lead to widen it; you do not
  import its services, repositories, or Prisma models, and you do not copy its
  logic.
- Never edit files in the **protected core** below. A change there needs a Lead
  Work Order that names the file.
- Every write is audited with the Platform audit writer and uses the Platform
  transaction runner. Every state change from outside is idempotent
  (`Idempotency-Key`) and safe to retry.
- No new dependency, AI SDK, or secret handling beyond the Work Order. Secrets
  come from the ignored local env file; never print or commit them.
- Wire contract first: write `docs/apps/<ext>/CONTRACT.md` and `contract.ts`
  before routes. Version in the URL (`v1`); a breaking change makes `v2`.
- Extensions never push outbound data to third parties without an explicit
  owner decision in the Work Order.

## Protected core (do not edit without a Lead Work Order naming the file)

- `src/apps/studioflow/**`, `src/apps/masterdata/**`, `src/apps/bq/**` (including
  their `public/`), and their existing `prisma/schema/*.prisma`.
- `src/platform/**` (including `ui_engine`, `core/rbac`, `core/auth`,
  `core/audit`), except inside `src/platform/core/integrations/` when the Work
  Order is the integration foundation itself.
- Existing migrations; `scripts/check-boundaries.mjs` rules (add a rule only when
  the Work Order says so, with fixtures).
- All UI under `src/app/(platform)/**` and `src/platform/ui_engine/**`. The
  Executor adds at most a minimal functional page; the Lead owns UX.

## Definition of done for an extension Work Order

`npm run typecheck`, `npm run lint`, `npm run check:boundaries`, `npm test` all
pass; wire contract documented; every route has an auth-failure, scope-failure,
validation-failure, idempotent-replay, and happy-path test; CHANGELOG entry;
one local commit. Then the Lead reviews and finishes the UI.

## Legacy evidence rule for extensions

Legacy behaviour is a functional specification only (see `AGENTS.md`, StudioFlow
Rework exception). Port algorithms and payload shapes, never code, schema, or the
legacy per-project API key design.
