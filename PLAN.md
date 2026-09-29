# Active Plan

Plan ID: WO-PLATFORM-MESSENGER-03
Scope: Quick messenger popup composer refinement (UI only)
Target revision: R8.207
Status: IMPLEMENTED - Lead-reviewed in browser; no Executor work needed
Priority: P2
Owner: owner (Product Owner)
Last updated: 2026-09-29

## Outcome

The bottom-right quick-messenger popup collapses safely, keeps unsent drafts, sends on Enter, continues plain-text
lists, and uses a compact composer with a `+` picker and drag-and-drop. `/messenger` and the messenger backend
contract are unchanged.

## Decisions (Lead, within the owner's request)

- "Pointer or focus moves outside" means a press/tap outside or keyboard focus landing outside; hovering away does
  not collapse. Escape collapses and returns focus to the topbar button.
- Enter on a list line (`- `, `* `, `1. `) continues/exits the list instead of sending; Ctrl/Cmd+Enter or the send
  button sends a list message. Enter elsewhere sends; Shift+Enter and Alt+Enter insert a newline; IME composition
  Enter is ignored.
- Drafts: text is kept per conversation (and for "new") in memory and `sessionStorage`; picked files are kept in
  memory only (files cannot be serialised), so they survive collapse but not a full page reload.
- Client checks (5 files, 10 MB each) are convenience only; the server stays the authority.
- The only non-UI change: `next.config.ts` server-action body limit raised from 4 MB to 52 MB. Proven necessary:
  a 6 MB attachment failed to send at the old limit although the messenger contract allows 10 MB x 5.

## Remaining

- Real-device evidence: a native file dialog, an OS file drag, and a real IME (browser tests used synthetic events).
