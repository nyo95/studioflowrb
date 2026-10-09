# Active Plan

Plan ID: DISCUSS-STORAGE-TUNNEL-01 (recommendation first, no code yet)
Status: DISCUSSION. Executor inspects the repository and **recommends**; it changes no file except the report. The Lead locks a READY plan from the answer.
Owner request 2026-10-09. Last updated: 2026-10-09 (Lead).

## The two wishes (owner's words, simplified)

1. **Storage like a CMS setting.** Today the folder where uploaded files live is an environment variable (`STUDIOFLOW_STORAGE_ROOT`), changed by editing a file and restarting. The owner wants to set it from the app's Settings, as in a CMS, because the app moves between computers (home, office) and the folder differs.
2. **Reach the app from anywhere.** When `npm run dev` or `npm run build` + `next start` runs in the background on the PC, the app should be usable from outside the local network (phone, another office), safely.

## Hard rules (both topics)

- **Do not break anything that works.** Add a layer or a setting beside what exists; every current default keeps behaving the same when the new setting is empty. No schema or API of a finished app is rewritten. If a change would touch a locked decision (security, ownership, storage keys), say so and stop.
- Platform stays generic: storage and the public address are Platform concerns, never StudioFlow or Master Data policy. Respect `docs/agent/EXTENSIONS.md` and the boundary checker.
- The database only ever holds opaque storage keys; the folder is the only copy of uploads. A bad value must never silently lose or hide files.
- No secrets in the repo or in chat; no new dependency or paid service without the owner's yes.
- Every change is a local commit; no push, no firewall or router change, no real exposure to the internet in this step.

## Topic 1 — Storage folder as a setting

What exists (verify): `resolveStorageRoot()` and `storageRootProblems()` in `src/platform/infrastructure/storage/storage-root.ts`; `objectStorage` and `brandMarkStorage` built once at module load in `src/platform/runtime.ts`; usage reader; the Platform Settings page under `src/app/(platform)/settings/general`; the parked Supabase adapter.

Lead's first leaning, for the Executor to confirm or replace:
- A Platform setting (permission `platform.settings.manage`, audited) "Storage folder" that, when set, overrides the env value; the env value stays the default and the production safety checks (absolute, outside the checkout, writable) apply to the setting as well.
- A thin resolving layer in front of the existing local adapters (they stay as they are): it asks "what is the folder now?" per call, with a short cache that the setting's save invalidates, so a change takes effect without a restart.
- Changing the folder **never moves or deletes files by itself.** Saving shows what is at the old and new place (files and size, using the existing usage reader) and offers an explicit "copy existing files to the new folder" job; the old folder is left untouched.
- Per-machine truth: each location has its own isolated database, so a stored folder is per computer by nature. Check that this holds.

Questions the Executor must answer in its report:
1. Where is the right place for the value (existing settings table vs a new small one), and how does a pending migration interact with the "env first" bootstrap when the database is unreachable at start?
2. How do signed URLs, the public Brand mark route and the cleanup/sweep jobs behave when the folder changes mid-run? List every consumer of `storageRoot` and `objectStorage` and say which need the resolving layer.
3. The safest migration shape for existing files (copy job, resumable, verified by size or checksum, reported in plain language), and what to do with objects that fail to copy.
4. What to test (unit, integration, one Playwright spec) and the smallest first slice that is useful on its own.
5. Alternatives worth considering (for example a storage "profiles" list for home and office, or leaving the env var and only adding a read-only status panel) with a recommendation.

## Topic 2 — Reaching the app from anywhere

What exists (verify): `next dev --hostname 0.0.0.0 --port 3001` and `allowedDevOrigins: ["172.16.1.163"]` in `next.config.ts`; session cookie `secure` only when `NODE_ENV=production`; a login limiter that trusts a proxy client IP only when `AUTH_TRUST_PROXY_CLIENT_IP` is set; Server Actions validate the request origin.

Questions the Executor must answer in its report:
1. **Which route fits this owner** (a Windows PC that must run unattended): a Cloudflare Tunnel (free tier, no router change, HTTPS, needs a Cloudflare account and ideally a domain; a quick random-URL mode exists for tests), Tailscale (private to the team's devices; "Funnel" can publish), ngrok, or plain port-forwarding with a dynamic DNS name. Give a table: cost, setup effort, security, behaviour when the PC restarts, and a recommendation. Say plainly which one you would pick and why.
2. **What the app itself must change to be safe behind a tunnel** (do not change it yet): the public origin and Server Actions `allowedOrigins`, replacing the hard-coded `allowedDevOrigins` IP with an env value, `secure` cookies and `x-forwarded-proto`, `AUTH_TRUST_PROXY_CLIENT_IP`, session and login rate limiting when the client IP is the tunnel's, the Next dev overlay and HMR websocket over the tunnel, and anything that assumes `localhost`.
3. **Run it unattended**: `next dev` is not for the public; recommend `npm run build` + `next start` as the public mode, and how to keep it running and restart after a reboot or crash on Windows (Task Scheduler, NSSM, pm2, or a documented script), plus a health check, log location and a one-command start/stop. Say whether the tunnel and the app should be one command or two.
4. **A safety checklist before the owner exposes it** (strong `SESSION_SECRET`, owner account password, limiter on, no test accounts, backups of database and storage folder, what to watch in the audit log).
5. What belongs in the repository (scripts, `docs/` runbook, an `.env.example` block) and what must stay on the machine (the tunnel's own credentials).

## Report format (the Executor's only output)

Plain language first, for a non-programmer owner (Indonesian summary of at most 12 lines), then a technical section per topic: findings with file paths, options with trade-offs, **one recommended option each**, the list of files each recommendation would touch, risks, and a proposed ordered slice list (each slice one commit, each safe on its own). End with the questions the owner still has to answer, as yes/no or pick-one with a recommended default. Write it to `docs/agent/reports/STORAGE-TUNNEL-DISCUSSION.md` and nothing else.

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, `docs/agent/EXTENSIONS.md` and this `PLAN.md`. This is a **discussion task**: inspect the repository as described and write only the report `docs/agent/reports/STORAGE-TUNNEL-DISCUSSION.md` in the requested format. Change no application code, no config, no environment file, and do not start a tunnel or expose any port. Update `CHANGELOG.md` with the next unused revision, make one local commit, no push. End with the Planner/Reviewer prompt: the commit, the report path, the recommended option for each topic in one line each, and the owner questions.
