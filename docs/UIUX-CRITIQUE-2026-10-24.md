# UI/UX critique: Project book To-dos and Home "My tasks" (Lead, 2026-10-24)

Scope: the real screens of R9.246/R9.247 on the local dev server (throwaway database, seeded designer PIC, drafter PIC,
invited member, manager outside the book), at 1440, 1280, 840 and 390 px, light and dark (dark at 1440).
Judged against `DESIGN.md` §1-§6.3, `UI_ENGINE.md`, the v2 mockup (ProjectV2, HomeV2,
https://claude.ai/artifact/5sChwEHLG1ta1wmzTpDcBS), accessibility, and "does it still feel administrative?".
Screens not walked: member and manager at 840/1280, Home as member/manager, dark below 1440.

## Verdict

Works and is safe, but the To-dos panel is an interim: it reads as a form, not as the book. The mockup shows to-dos
as quiet checkable rows inside the "Client asked" block, who and when as small text, extra to-dos on one line, adding
through the typed composer. Today the panel adds three always-open controls per row plus an add row above the notes.

What works: contrast of the Late text is 6.43:1 on white; dark mode holds; every control has an accessible name; the
manager sees no panel at all; Home's My tasks is compact and links to the project; the done list is folded away.

## (a) Fixes inside the existing contract (batched for the Sub-Lead)

| # | Sev | Finding | Rule | Smallest fix |
|---|---|---|---|---|
| A1 | P2 | "Late" has no pill: the class `bg-danger-subtle` is not a token, so it is bare red 12px text. | §3 status colour only when functional; status marker + plain-ink label | Use the shared `StatusBadge`/`Badge` (danger) in `book-todos-panel.tsx` and `my-tasks.tsx`; no raw colour classes. |
| A2 | P2 | A label is one truncated line with no way to read it ("Revise toilet elevati…"), at every width. | §Tables two-tier cell: primary may wrap to two lines; a11y | Let the label wrap to two lines (`line-clamp-2`) and add `title` with the full text; the 200-character limit stays. |
| A3 | P2 | Columns jump: a row with Late loses width, so assignee and date drift; the first/last row's disabled arrows shift too. | §5 data rows scan in columns | Reserve a fixed slot for the Late marker and keep disabled arrows rendered. |
| A4 | P2 | A member sees "View only. Only an assigned PIC or manager can make changes." in the stage strip, directly above a fully editable To-dos panel. | §13 states say what is true | Reword that notice to name the phase ("You can view this phase…") in its component; do not touch its logic. |
| A5 | P3 | At 390 px each row wraps into three lines; icon buttons are 32 px. | §12 responsive, touch targets | Below 560 px: label on its own line, controls on the next; hit area at least 40 px (padding, not new tokens). |
| A6 | P3 | Dates show as native `yyyy-mm-dd` boxes and, on Home and in the panel, as "20 Oktober 2026" while the rest of the UI is English. | §2 one language per screen | Format with the platform locale from settings (`readPlatformGeneralSettings`), not the default `id-ID`. |
| A7 | P2 | Home My tasks lists by project in a 3-column grid that leaves the right side empty. §6.3 says grouped Late / This week / Mentions. | §6.3 Home | Group rows Late / This week / Later (Mentions arrives with BOOK-05), project name as the quiet second line ("Rumah Pak Andi · was due Tue"), single column. |
| A8 | P3 | On a manager's open project the notes empty state still says "Write what you learn about this project below" though they cannot write. | §11 empty states match ability | State what the viewer can do (read the client's answers). |
| A9 | P3 | Home at 390 px: four stat cards one-up push My tasks to the fifth screen. | §6.1 stack two-up, then one-up | Make the shared `StatGrid` two-up from 360 px. This is a shared component: Lead check at integration. |

## (b) Layout direction (owner decisions)

| # | Sev | Question |
|---|---|---|
| B1 | P1 | The To-dos panel takes most of the first screen: at 1440 the notes shrink to a sliver, at 1280 they fall below the fold. Make it quiet (one line per to-do, who and when as small text, edit by clicking, at most five rows then "show all", collapsed by default once there are many), or wait for the §6.3 "Client asked" block and composer (BOOK-03/04) and live with it until then? |
| B2 | P2 | Home: move My tasks into a right-hand column (up to 400 px) next to the project cards, as the mockup shows, or keep it as a full-width block above the cards? |

Not an owner question: the member's "View only" wording (A4) is a copy fix.
