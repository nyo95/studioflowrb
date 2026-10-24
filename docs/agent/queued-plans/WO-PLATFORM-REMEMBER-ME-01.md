# WO-PLATFORM-REMEMBER-ME-01 — "Keep me signed in" (draft)

Status: DRAFT (Lead, 2026-10-24) — one owner question open (how long). Lane: Lead plan, Executor or Lead build.
Module(s): Platform core auth (`src/platform/core/auth`, the login page). Tier: HIGH (authentication, a `platform.Session`
column, cookie lifetime).
Branch: `feat/project-book` (or its own branch if the owner wants it on `main` sooner).

## Why

Owner, 2026-10-24: signing in again and again is tiring. Today a session ends after 12 hours without use (idle) and in all
cases 7 days after sign-in (absolute). Coming back the next morning after more than 12 hours asks for the password again.

## Decisions (proposed)

1. A checkbox on the login page, **"Keep me signed in on this device"**, off by default.
2. Ticked: idle limit and absolute limit both become **30 days** (owner question: 14 / 30 / 90 days). Not ticked: today's
   12 hours / 7 days, unchanged.
3. The choice is stored on the session row (new boolean `remember`, additive migration), so the idle extension on each
   visit uses the right window. The cookie never outlives the session.
4. Nothing else changes: sessions stay revocable (Account → sign out everywhere), a disabled user or a removed role still
   ends access at once, changing the password still rotates the session, login rate limits stay.
5. Copy under the checkbox: "Don't tick this on a shared computer."

## Acceptance

Ticked login survives 13 hours and 8 days of inactivity in a test clock and expires at 30 days; unticked behaves exactly as
today; revocation, disabled user and password change still end a remembered session; existing session tests unchanged.
