# WO-SF-SAMPLE-PHOTO-01 — Sample requests show the schedule item's photo and code

Modules: `studioflow` (sample-request public read), the sample-request coordinator (`src/application`), `masterdata` (queue screen).
Target revision: plan R9.224; backend (Codex) R9.225; UI (Lead) R9.226.
Risk: low-medium — widens a cross-app read contract that deliberately carried no images.
Owner decision: 2026-10-23.

## Why

When a designer requests a physical sample, the Master Data staff who work the queue see only words ("Singres
Mosaic · Mosaic"). The owner wants the request to show the schedule item it came from: its photo, when there is one.
Today `SampleRequestRead` says "facts only: no storage keys, no images", so the queue cannot show it.

## Locked decisions

1. `SampleRequestRead.option` gains `imageUrl: string | null` — a **short-lived signed read URL** of the option's photo
   (the same signing StudioFlow uses for its own screens, 15 minutes), never the storage key. Null when the option has no
   photo or the photo cannot be signed (a missing file is not an error).
2. It also gains `entryCode: string` (for example `CT-02`), so the staff can name the item when talking to the designer.
3. The photo is the requested option's photo, read live at query time: if the designer changes the photo later, the queue
   shows the new one. Master Data's own intake snapshot (`SampleRequestIntakeRead`) is not changed and stores no image;
   for an intake whose source request can no longer be read, the photo is simply absent.
4. `SampleQueueRow` carries `imageUrl` and `entryCode` through (`null` from `fromIntake` without a readable source).
5. Only the queue's existing readers see it (no new permission). The contract comment is updated to say a signed URL is the
   only image form allowed.
6. Out of scope: Master Data samples shelf, notifications, the schedule screens.

## Executor scope (R9.225)

- `createStudioFlowSampleRequestRead` receives the storage port it needs to sign (runtime wiring updated); the read selects
  the option's `image_key` and the entry's prefix/increment, and returns `imageUrl` + `entryCode`.
- Coordinator: `SampleQueueRow.product` gains `imageUrl` and `entryCode` (from the source request when readable).
- Tests: read with and without a photo, unsignable file → null, entry code format, coordinator pass-through, contract
  comment. Boundary check stays green. Changelog R9.225. No migration, no UI change.

## Lead scope (R9.226)

The request detail dialog shows the photo (cover crop, tap to open full size) above the product line, and the item code
next to the title; the queue rows get a small thumbnail.

## Acceptance

- A request for an item with a photo shows that photo and its code (for example `CT-02`) in the Master Data queue.
- A request for an item without a photo shows no empty frame.
