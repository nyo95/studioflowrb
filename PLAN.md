# Active Plan

Plan ID: WO-PLATFORM-MESSENGER-02
Scope: Platform quick messenger popup
Target revision: R8.199
Status: IMPLEMENTED - awaiting reviewer acceptance
Priority: P2
Owner: owner (Product Owner)
Last updated: 2026-09-29

## Outcome

Signed-in users can exchange quick private 1:1 messages from a bottom-right popup without leaving their current screen. The popup consumes the R8.198 messenger backend/actions and keeps `/messenger` as the full-screen view.

## Context and Evidence

- Owner activated the previously blocked private messaging item on 2026-09-29: platform-wide private user-to-user chat, using polling.
- Owner requested legacy evidence for attachment expiry. Legacy path recorded as `D:\Misc\ProjectsHUB\studioflow`, commit `c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27`, branch `main`, dirty state limited to untracked `foldering/`, untracked public upload images, and untracked recovered dump files. Evidence was read from the committed tree only.
- Legacy evidence:
  - KEEP: `TemporaryAttachment.expires_at` and `TemporaryAttachment_expires_at_idx` prove attachment expiry as a persisted concept.
  - KEEP: `/api/upload/temp` creates temporary attachment rows with `expiresInMinutes: 30`.
  - MERGE + FIX: `TempFileService.cleanupExpiredFiles` removes both file bytes and database rows, but rebuild must use the existing ObjectStorage boundary instead of public `public/uploads`.
  - FIX: legacy discussion unread state was localStorage-only; rebuild messenger unread must be server authoritative.
  - PURGE: legacy `ProjectChatSidebar` was project-scoped, shared discussion, sound/local UI behavior, and drag-drop quick post; this plan is private 1:1 platform messaging, not StudioFlow project discussion.
- Current rebuild evidence:
  - `CORE.md` §14 places generic cross-app capabilities in Core/platform, not app-owned.
  - `CORE.md` §15 has in-app notification inbox activated already, but the backlog says private messenger should compute unread from its own message/read table rather than invent another notification slice.
  - `@platform/core/storage` and `objectStorage` already provide private file storage with signed read URLs.
  - `@platform/core/rbac/people` is the approved user lookup surface and exposes only id/display name/active.

## Locked Decisions

- Capability disposition: ADD a platform-owned private messenger. It is cross-app infrastructure/domain, not StudioFlow-owned.
- Delivery is polling. No WebSocket/SSE/realtime channel is added.
- Scope is private 1:1 conversations only. No group chat, project feed, comments, mentions, message reactions, email, push, notification preference, or digest behavior.
- Messages are permanent for both participants in this slice. No delete/hide/archive behavior is introduced yet.
- Attachment expiry follows legacy's proven default: 30 minutes from upload. Expired attachments remain represented in message history as unavailable attachments; cleanup removes object bytes while preserving message history.
- Attachments use existing private ObjectStorage and signed reads. Do not store absolute filesystem paths, raw blobs, public URLs, or legacy public-upload paths.
- Messenger unread counts come from messenger read state/message rows, not `platform.Notification`.

## Business Rules and Architecture Constraints

- A conversation is exactly two distinct active platform users. The storage identity must be stable regardless of who starts it.
- A user may list and open only conversations where they are a participant.
- A user may start/send only to an active platform user other than themselves.
- A message has one author, one conversation, body text, optional attachments, and created timestamp.
- A send requires at least nonblank text or at least one attached file.
- Attachment policy for this slice: maximum 5 files per message, maximum 10 MB per file, server-generated keys under a messenger-specific prefix, original filename/content type/byte size recorded, expires at 30 minutes.
- Expired attachments must not produce a signed read URL. Missing objects must surface as unavailable, not as raw storage errors.
- Keep the platform/app boundary clean: platform messenger code may use platform Core/runtime services; apps do not import messenger internals.

## Backend Contract

- Add persisted platform schema for conversations, participants/read state, messages, and attachments, including indexes for participant inbox, unread calculation, message ordering, and attachment expiry cleanup.
- Add a platform messenger service with operations to:
  - list active people available for a new conversation;
  - list the signed-in user's conversations with other participant name, last message summary, last message time, and unread count;
  - read one conversation's recent messages and mark it read for the signed-in user;
  - send a text/file message to an existing or new 1:1 conversation;
  - count all unread messenger messages for the signed-in user;
  - resolve signed attachment URLs only for participants and only while unexpired;
  - cleanup expired attachment objects in bounded batches.
- Server actions must accept only the current signed-in user as actor; browsers never submit actor ids for authority.
- Use `runSafeAction`, `requirePrincipal`, validation mapping, and existing runtime composition.
- Audit is not required for ordinary chat send/read in this slice; this is operational private communication, not a business approval event.

## UI Contract

- Executor may add minimal functional UI so the owner can use the backend:
  - a topbar messenger icon/badge using polling;
  - a messenger page or panel listing conversations, people, messages, a composer, and file input.
- UI polish, final information hierarchy, responsive refinement, and visual design remain Lead-owned after the backend commit.

## Boundaries and Non-goals

- Do not modify StudioFlow project pages or resurrect legacy project discussion.
- Do not integrate messages into `platform.Notification` in this slice.
- Do not add external dependencies.
- Do not add background job infrastructure. Cleanup is exposed as a bounded service/action and may be run manually or opportunistically.
- Do not push, deploy, or touch remote state.
- Preserve the unrelated dirty files already present before this plan.

## Acceptance Criteria

- User A can start a 1:1 conversation with active User B and send text.
- User B sees the conversation on the next poll/manual refresh with unread count.
- Opening the conversation marks User B's messages read for User B only.
- User A can attach a file; both participants can obtain a private signed read URL before expiry.
- After expiry, the attachment is shown as unavailable and cannot receive a new signed URL.
- Cleanup removes expired attachment objects without deleting the message itself.
- Nonparticipants cannot list, read, send into, or download attachments from someone else's conversation.

## Verification

- Mandatory Executor checks: `npm test`, `npm run typecheck`, `npm run lint`, `npm run check:boundaries`, `npm run check:legacy-runtime`, `npm run build`, staged and unstaged whitespace checks.
- Add focused unit/integration tests for service permissions, unread behavior, attachment expiry, and cleanup.
- Apply the new migration to the selected `kantor` rebuild-only dev database and the integration-test database actually used for checks; regenerate Prisma.

## Reviewer Acceptance

- Browser acceptance after commit: sign in as two users, exchange text, observe polling/unread badge, open conversation to clear unread, upload one small attachment and open it before expiry. Expiry may be verified by service-level test rather than waiting 30 minutes in-browser.

## Regression Risks and Recovery

- Schema migration touches platform data; keep it additive so rollback can remove the new unused tables if needed.
- Storage cleanup is irreversible for expired attachment bytes; bound cleanup and do not delete message history.
- Polling adds topbar traffic; keep count/list actions scoped and indexed.

## Executor Prompt

You are the Backend Executor. Location: kantor. Read `AGENTS.md`, `docs/agent/EXECUTOR.md`, and this `PLAN.md`, then implement the entire READY backend outcome and nothing beyond it. Inspect current repository evidence, preserve unrelated owner work, make sound in-scope implementation decisions, run the required checks, update `CHANGELOG.md`, and create the target local revision commit. Stop only for a material locked-decision conflict or unsafe boundary, using the BLOCKED / CONFLICT report; otherwise finish the coherent outcome and report the commit, checks, limitations, and remaining unrelated dirty files.
