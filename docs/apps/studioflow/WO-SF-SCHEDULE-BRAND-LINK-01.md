# WO-SF-SCHEDULE-BRAND-LINK-01 — Suggest linking a typed Brand to a Master Data Brand

Module: `studioflow` (Product Schedule screen only).
Target revision: Lead R9.227 (after Codex R9.225 and the Lead's sample-photo UI R9.226).
Risk: low — UI only; it reuses the existing Brand list and option update, no backend change.
Owner decision: 2026-10-23 ("ya, buatkan rencana … bukan otomatis").

## Why

A designer may type a Brand that is not in Master Data yet ("Singres Mosaic"), request a sample, and later the Master Data
staff create the Brand ("Singres"). The schedule keeps the typed text: nothing links it. The owner wants a suggestion,
not an automatic change, because a typed name may not match exactly, may match two Brands, and a silent change could
alter a schedule already sent to the client.

## Locked decisions

1. **Never automatic.** A typed Brand changes only when someone clicks to link it. Every link is an ordinary option
   update (audited like editing the Brand by hand).
2. **Candidates** come from the active Master Data Brands the schedule screen already loads. For a typed name (trimmed,
   case-insensitive) a Brand is a candidate when its name is equal to it, or the typed name starts with the Brand name
   followed by a space or a dash ("Singres Mosaic" → "Singres"), or the Brand name starts with the typed name followed by
   a space. Exact matches first, then the longest Brand name; at most three.
3. **Inspector:** when the shown option has a typed Brand with candidates, a quiet line under the Brand field reads
   `Not in Master Data · Link to "Singres"` (one button per candidate, at most three). Linking sets the option's
   `brandId`; the Brand then reads as the Master Data name, and the Master Data contacts become available for Contact.
   The rest of the typed text is not moved anywhere (Type, Notes and other fields are untouched).
4. **Many at once:** the List gets the filter value "Brand not in Master Data"; when the selection's options share one
   typed Brand that has candidates, the selection panel offers `Link N items to "Singres"`. Different typed Brands in one
   selection offer nothing.
5. Final options are linked like any Brand edit (no extra lock beyond today's rules). Undo is by choosing the typed
   name again, as today.
6. Out of scope: Master Data offering the link while creating a Brand from a sample request (later, needs a backend
   read), the Schedule Assistant, templates.

## Lead scope (R9.227)

Candidate matcher (pure function with unit tests), the inspector hint, the List filter value, the bulk link in the
selection panel (one option update per item through the existing action), changelog.

## Acceptance

- An item with Brand typed "Singres Mosaic" shows `Link to "Singres"` once Master Data has Singres; clicking it makes the
  Brand read "Singres" and offers Singres' contacts.
- Nothing changes on its own when the Brand is created in Master Data.
- Selecting several "Singres Mosaic" items links them in one go.
