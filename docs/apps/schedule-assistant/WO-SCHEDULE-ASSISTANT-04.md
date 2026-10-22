# WO-SCHEDULE-ASSISTANT-04 — option photos and colour placeholders through the Assistant

Status: READY. Plan revision R9.184; target revision: the next free one after it.
Owner decision 2026-10-22: "2 [photo upload through MCP] / if I give no picture, ask first, and
confirm whether a colour placeholder should be used". Lead decisions below.
Module: Schedule Assistant (contract, composer door, bridge); StudioFlow schedule writer. No schema.
Risk: medium-high — first Assistant operation that carries file bytes; a weak model must not be
able to attach the wrong file, attach an unchecked file, or skip the photo question.

## Context

Option photos are stored by `setOptionImage` (`src/apps/studioflow/schedule/service.ts`): PNG,
JPEG or WebP, at most 3 MB (`SCHEDULE_IMAGE_BYTES`), content sniffed, object put first and recorded
after, the replaced object released after commit. The screen crops to 4:5 in the browser; there
is no server-side image library. R9.181 added a colour swatch on the screen that is stored as an
ordinary option photo (`color-<hex>.jpg`). The integration kit reads JSON bodies only (default
limit 1 MiB, per-route `bodyLimitBytes`).

## Locked Decisions

1. (Owner) Photos can be attached through the Assistant.
2. (Owner) When the user gave no picture for an option the batch creates, the AI asks first and,
   if there is none, asks whether a colour placeholder should be used (and which colour).
3. (Lead) Two operations, both targeting an option by `optionId` (existing) or `entryRef` (the
   first option of a `create_entry` with `option` in the same batch):
   - `set_option_image { optionId | entryRef, imagePath }` on the bridge side; the bridge reads
     the file and sends `image: { sha256, contentType, bytes }` to StudioFlow instead of the path.
   - `set_option_color { optionId | entryRef, hex: "#RRGGBB" }`; StudioFlow draws a solid 4:5
     PNG (400×500, no new dependency: PNG encoded with `node:zlib`) named `color-<hex>.png`.
   Once per option per batch for either of the two; an existing photo is replaced (the result
   says `replacesImage: true`).
4. (Lead) Files come only from a local path the client gives (a picture the user pasted or
   dragged in is a local file for Claude Code and Codex). No URLs (no network fetch from the
   bridge), no base64 typed by the model. The bridge accepts PNG/JPEG/WebP by magic bytes,
   at most 3 MB, regular files only (no directories, no symlink targets outside the user's
   folders are special-cased: the path is read as given, never listed or globbed). Larger
   files are refused with a plain message to shrink or crop first (no image library is added).
5. (Lead) Digest and session binding: the bridge reads the file at preview, sends the hash,
   and keeps the bytes in memory with that preview's operationId. Apply sends the same
   operations plus `images: { <sha256>: <base64> }`; StudioFlow checks every hash, runs the
   Schedule's `validateImage` rules on the bytes, stores the objects before the transaction
   and removes them again if the batch fails (reuse the Schedule's object cleanup; an object
   left by a failed commit must be removed or queued for cleanup). At most 4 images per batch;
   the apply route sets `bodyLimitBytes` to 17 MiB, preview stays at 256 KiB.
6. (Lead) Photo question enforced, not only asked: a valid preview carries a non-blocking
   warning `SCHEDULE_OPTION_NO_IMAGE` for every option the batch creates (`create_entry` with
   option, `create_option`) that ends without a photo or colour; `reuse_option` copies the
   source photo and is not flagged. The interview tells the AI to ask about each flagged
   option (photo? if not, colour placeholder? which colour, proposed as a hex and confirmed),
   never to choose a colour on its own, and to preview again.
7. (Lead) Visible in the confirmation: the bridge dialog adds "N foto baru", "N foto diganti",
   "N warna placeholder (kode: #hex)" and "tanpa foto: <codes>". Replacing a photo is named per
   code.
8. (Lead) Audit: the Schedule's `option-image-added` / `option-image-replaced` with
   `via = "schedule-assistant"`, `operationId`, and `source: "file" | "color"`.
9. Not in scope: removing a photo, cropping, resizing, URLs, sample photos, Master Data photos.
   Module `schedule-assistant` 1.2.0, bridge next minor.

## Work

- Schedule writer: extract the record step of `setOptionImage` into `writer.attachOptionImage(tx,
  { actor, projectId, optionId, key, bytes, metadata })` returning the replaced key for cleanup;
  the screen command keeps its behaviour. A pure `solidColorPng(hex, 400, 500)` in the domain.
- Composer door: operation types, validation (target, once per option, hex format, image
  descriptor shape, max 4 images), execute (store/attach; colour drawn server-side), warnings,
  results (`replacesImage`, `imageSource`), digest unchanged in shape (the hash is part of the
  operation).
- Contract (`contract.ts`): the two operations; apply body gains `images` (record of sha256 →
  base64, at most 4); route body limit.
- Bridge: `imagePath` → descriptor at preview (read, sniff, size, sha256), bytes kept per
  operationId; apply attaches them; dialog lines; interview step for photos (owner decision 2);
  tool descriptions.
- Docs: `CONTRACT.md`, bridge README, CHANGELOG.

## Acceptance Criteria

1. New entry + `set_option_image` by `entryRef` with a 1 MB JPEG: preview shows the code and
   "photo"; apply stores it; the screen shows the photo; audit row has `via`.
2. `set_option_color` "#D8C8A8" on an existing option with a photo: preview says it replaces;
   apply stores a 400×500 PNG `color-d8c8a8.png`; the old object is released.
3. A batch creating an option without photo or colour is valid but warns
   `SCHEDULE_OPTION_NO_IMAGE`; with a photo or colour it does not.
4. Bridge refuses a missing path, a directory, a text file renamed `.jpg`, a 4 MB image, and a
   fifth image, before calling StudioFlow.
5. Apply with an image whose bytes do not match the previewed hash, or a missing image, is
   refused and writes nothing; a failed batch leaves no stored object behind.
6. Read-only token cannot apply; dialog decline saves nothing; replay of the same operationId
   replays without storing a second object.
7. The Schedule screen's photo upload, colour swatch and remove behave as before.

## Verification

High gate (`scripts/verify.mjs --tier high`, `NEXT_DIST_DIR=.next-e2e`) with the composer suite,
schedule service tests and bridge tests; no browser walk by the Executor (owner checks one photo
and one colour on the Schedule screen).
