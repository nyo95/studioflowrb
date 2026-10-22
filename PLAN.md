# Active Plan

Plan ID: WO-SF-CATEGORY-SIMILAR-01
Scope: warn before a Schedule category is created that looks like a studio category under another spelling, so its codes take the studio prefix (HPL/Plastic Laminate → High Pressure Laminate PL, not HP).
Module(s): StudioFlow (schedule domain, import, Schedule screen category picker, schedule composer door); Schedule Assistant bridge (interview text). No schema change.
Target revision: R9.176 (this plan is R9.175).
Risk: medium - touches the import path and the composer preview; a too-eager match would nag on real new categories, a too-weak one misses the case. Warnings never block a deliberate new category.
Status: READY — executed by the Lead (owner, 2026-10-22)
Priority: P1
Owner: Product Owner (decision 2026-10-22: "saran kategori mirip")
Last updated: 2026-10-22

Plan reconciliation: `WO-SCHEDULE-ASSISTANT-02` is DONE in R9.174 (owner walk owed).

## Context

Project "2026-536 Sociolla SBZ The Breeze BSD Phase 2" received 42 entries on 2026-10-22
07:02 WIB from a Codex import script that wrote to the database directly (no audit rows).
Two categories were spelled differently from the studio dictionary ("HPL/PLASTIC
LAMINATE", "HOMOGENEUS TILE"), so they were treated as new and got fallback prefixes HP and
HO. The Lead moved those ten entries with the audited `moveEntryToCategory` command
(HP-01…07 → PL-01…07, HO-01…03 → HT-01…03). The Google-Sheets import also writes a first-
seen category into the global prefix dictionary, so a misspelling there would persist.

## Locked Decisions

1. (Owner) Suggest, do not auto-map: a category that is new to the project and to the
   studio, and resembles a studio category (template categories + prefix dictionary of
   the same section), is flagged with up to three suggestions (category + prefix).
2. (Lead) Resemblance (pure domain function, unit-tested): the studio category's
   initials equal a word of the typed name (HPL ↔ High Pressure Laminate); or the
   names are at least 80% alike by edit distance (Homogeneus ↔ Homogeneous); or they
   share a word of five letters or more (Plastic Laminate ↔ High Pressure Laminate).
   Exact-key matches are not new and never flagged.
3. (Lead) Where:
   - **Schedule Assistant preview:** a valid preview carries `warnings`
     (`SCHEDULE_CATEGORY_SIMILAR`, index, suggestions); the bridge's interview tells the
     AI to ask the user before applying. Not blocking.
   - **Import (both sheet formats):** before anything is written, a sheet whose new
     categories resemble studio categories is refused with
     `SCHEDULE_CSV_CATEGORY_SIMILAR` listing "typed → suggestion (prefix)", unless the
     user ticks "Kategori baru di file ini memang dimaksudkan" (`acceptNewCategories`).
   - **Schedule screen "New category":** while typing, similar studio categories appear
     first under "Mungkin maksud Anda"; creating the typed name stays possible.
4. No schema change, no automatic rename, no change to existing data beyond the audited
   move already done.

## Acceptance Criteria

1. Domain: HPL/Plastic Laminate, Plastic Laminate and HPL suggest High Pressure Laminate
   (PL); Homogeneus Tile suggests Homogeneous Tile (HT); Ceramic Tile typed exactly is not
   flagged; an unrelated name (Wallpaper) gets no suggestion.
2. Composer preview of `create_entry` "HPL/Plastic Laminate" is valid and carries the
   warning with PL; a known category carries none.
3. Import with such a category is refused and writes nothing; with
   `acceptNewCategories` it imports as today.
4. Schedule screen shows the suggestion group (Lead UI; browser walk owed).

## Verification

Medium gate with tests: domain unit tests, composer integration (schedule-assistant
suite), import integration, bridge tests; full high gate before commit (`npm test` +
build) with `NEXT_DIST_DIR=.next-e2e`.

## Executor Prompt

Executed by the Lead in this session; no Executor handoff.
