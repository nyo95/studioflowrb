# Active Plan

Plan ID: none active
Status: IDLE
Last updated: 2026-10-10 (Lead, R8.502)

WO-SYSTEM-01 (System Owner web console with authenticator sign-in, R8.501) is
**CANCELLED** by the owner on 2026-10-10 before any code was written: it was
more protection than one office needs. Module switching stays the server
command, documented in `docs/operations/MODULES-RUNBOOK.md`; the decision is
recorded in `docs/apps/platform/MODULES-DECISION.md` (Purpose, D5, Non-goals).
The `qrcode` dependency approved for it is withdrawn.

WO-MODULES-M1 is done (R8.495, R8.498 Executor; R8.500 Lead). Candidates for the
next plan, waiting for the owner's go (`docs/BACKLOG.md`, Platform Foundation):

- M2/M3: Ideas Board, then Presentation, extracted into their own modules.
- WO-SYSTEM-02: install a chosen GitHub release with backup and automatic
  roll-back, as a server command. Needs first: how the office server runs the
  app and the release format.
