# Revision Ledger Notes

Status: historical reconciliation through R7.40, 2026-09-10.

`CHANGELOG.md` remains authoritative. This note records gaps that must not be
silently interpreted as missing product work or backfilled with invented
entries.

| Revision label | Git evidence | Ledger status |
|---|---|---|
| R4.39 | No matching commit found | Ordinal was skipped; no synthetic entry is created |
| R6.25 | Commit `a151bee` exists with a noncanonical subject | Changelog entry is missing; preserve Git history and treat the commit as implementation evidence |
| R7.18 | No matching commit found | Ordinal was skipped; no synthetic entry is created |
| R7.27 | Commit `6aeb0df` exists | Recorded retroactively by R7.28 rather than duplicated as a new historical entry |

Future agents must use the next revision declared at the top of
`CHANGELOG.md`. Historical gaps are never reused, renumbered, amended, or
fabricated.
