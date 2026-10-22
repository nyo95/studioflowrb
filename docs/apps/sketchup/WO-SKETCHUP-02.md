# WO-SKETCHUP-02 — SketchUp plugin P0: link safety (plugin 1.2.1)

Status: built in R9.193 (plugin 1.2.1); owner test in SketchUp owed. Lead executes (plugin only).
Module(s): plugin `tools/sketchup-plugin/` only. No StudioFlow, schema or route change.
Depends on: WO-SKETCHUP-01 Stage 1b (plugin 1.2.0, R9.189/R9.190).
Followed by: WO-SKETCHUP-03 (P1, option-aware links).
Risk: medium — the plugin renames and merges materials in real models; every change stays
behind a confirmation and one undo step.

## Material-code semantics (owner, 2026-10-22, supersedes the earlier review)

- A schedule code (ST-01) names the active specification slot in a category, not a product,
  texture or SketchUp object. ST-01 may be red marble on day 1, deleted, and travertine on day 3.
- StudioFlow keeps its lowest-free-number allocator; deleted codes may be reused; no code
  ledger or tombstone. Entry identity is the entry id, never the code.
- A design change (marble → wood HPL) is not a schedule option. Options stay alternatives of
  one specification. No object-level assignment, no material-history tracking. Location is
  descriptive schedule text only.
- The owner controls deletion; the plugin never deletes or finalizes anything in StudioFlow.

## Locked decisions

1. (Owner D1) Names: `PL-01` for the final option or a single-option entry; `PL-01-A`,
   `PL-01-B` for non-final alternatives (implemented in WO-SKETCHUP-03).
2. (Owner D2) A new entry from SketchUp has no option; the material links to the entry.
   Already true (`src/apps/sketchup/runtime.ts` sends no option).
3. (Owner D3) Offline codes keep today's format (PL-03); "not linked" is shown by metadata
   and status only, never by the name.
4. (Owner D4) Texture upload is P3.
5. (Owner D5) Code reuse is expected; a stale entry id is never redirected to the entry that
   now carries the same code.
6. (Owner, Q1) Token transport: `https://` everywhere; `http://` only for localhost and
   private-network addresses (10/8, 172.16/12, 192.168/16, `*.local`, single-label LAN host
   names), with a warning when connecting; a refused address sends no request at all.
7. (Owner, Q2) Creating an alternative option from SketchUp is deferred: options are made in
   the Product Schedule or through the MCP; the plugin links to existing ones (P1).
8. (Owner, Q3) **Merge is verified by official ids only.** Narrows WO-SKETCHUP-01 decision 13:
   two materials are merge candidates only when both are linked to this model's project and to
   the same entry id and the same option id; in P0 (no option ids yet) only when both link the
   same entry and that entry has at most one option. Never by name or code spelling, never for
   a stale or other-project link. Decision 12 (SO-1 = SO-01 offered for *linking*, asked first)
   stays. The schedule read of module 1.0.0 carries no option ids or option count, so P0 cannot
   verify an option: **P0 switches the merge offer off**; WO-SKETCHUP-03 brings it back with option
   ids and the look-safe merge below.

## P0 work

1. **Merge (B1, B2).** The merge offer after linking is removed (decision 8); linking never
   changes another material. The look-safe merge (B9) moves to WO-SKETCHUP-03.
2. **Refresh (B3, B6).** A target name wanted by more than one material, or held by a material
   that is not being renamed, is given to nobody and listed as a conflict. An entry that no
   longer exists keeps the material's link (entry id and project id stay) and is listed as
   "tautan tidak berlaku"; nothing is unlinked or renamed for it. One undo step; temporary
   names for swaps as today.
3. **Stale links (B6).** On click, a material whose stored entry id is not in the project's
   schedule is explained with its snapshot ("dulu ST-01 · Marmer Merah, sudah dihapus"). If its
   name reads as a code that another entry now carries, the question names the new item and
   defaults to No. Linking it is an explicit Yes or the picker. Snapshot keys
   `studioflow_link_code` and `studioflow_link_title` are written on every link.
4. **Interrupted creation (B4, B5).** Before "Item baru" is sent, the material stores
   `studioflow_pending` `{key, projectId, section, category, at}`. A later click on that material
   (also after reopening the model) offers to finish it and resends the same key and body, so
   StudioFlow replays the first item; success links and clears the key. A pending key older
   than 23 hours is dropped (the integration kit keeps replays for 24 h). If the answer arrives
   after the model was closed or the material is gone, the user is told the code that was
   created and how to link it.
5. **Other project (B7).** A material linked to another project is said so on click (with its
   last code snapshot) and is linked to this project only through the normal questions. The
   tool's status text names the connected project.
6. **Token transport (B8)** per decision 6, checked when connecting and before every request.
7. Pure rules (refresh plan, merge eligibility, look comparison, server-address check, pending
   expiry) live in `core/link_rules.rb` without SketchUp calls and are tested with plain Ruby
   (`tools/sketchup-plugin/test/link_rules_test.rb`, minitest bundled with Ruby).

Out of scope: option ids, naming suffixes, server changes (WO-SKETCHUP-03); legacy dead code
(BACKLOG `[CLEANUP]`); texture upload (P3).

## Acceptance

1. Linking a material never offers to merge it with another material (P0).
2. (moved to WO-SKETCHUP-03: look-safe merge.)
3. Refresh with two materials linked to the same entry succeeds for every other material and
   lists that conflict; nothing raises.
4. Network cut after "Item baru" was stored by StudioFlow, then a second click: one entry exists
   and the material links to it.
5. Material ST-01 linked to a deleted entry, while a new ST-01 exists: the click explains the old
   link and does not link without Yes; refresh keeps the old link and lists it.
6. A material linked to another project is reported as such; a model of another project shows
   that project's name in the status bar.
7. Connecting to `http://` on a public address is refused; `http://localhost` and
   `http://192.168.x.x` work (the latter after the warning).
8. `ruby -wc` on all plugin files; `ruby tools/sketchup-plugin/test/link_rules_test.rb` passes;
   `node tools/sketchup-plugin/build.mjs` packs. Owner test in SketchUp is the end-to-end check.

## Rollback

Reinstall `BerkahStudio_1.2.0.rbz`. The new keys (`studioflow_link_code`, `studioflow_link_title`,
`studioflow_pending`) are ignored by 1.2.0; links are unchanged.
