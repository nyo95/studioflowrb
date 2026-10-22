# WO-SKETCHUP-03 — SketchUp P1: option-aware links (plugin 1.3.0, module 1.1.0)

Status: DRAFT — becomes READY after the owner has tested WO-SKETCHUP-02 (plugin 1.2.1) in SketchUp.
Module(s): `sketchup` (read contract, additive) and the plugin. No schema, no StudioFlow service change.
Depends on: WO-SKETCHUP-02. Decisions: as in WO-SKETCHUP-02 (semantics, D1–D5, Q1–Q3).

## Server (module `sketchup` 1.1.0)

- `GET projects/{id}/schedule`: each entry adds `createdAt` and
  `options: [{ id, label, isFinal, status, title }]` (title = Brand + product of that option),
  read from the composer's `readContext` (already returns them). `title` of the entry stays for
  plugin 1.2.x. No new route; `resolve` stays for 1.2.x.
- Tests: options and final flag present; an entry without options returns `options: []`.
  `docs/apps/sketchup/CONTRACT.md` updated.

## Plugin metadata (dictionary `BerkahStudio` on the material)

| Key | Meaning |
|---|---|
| `studioflow_project_id`, `studioflow_entry_id` | unchanged; never removed automatically |
| `studioflow_option_id` | new; absent = entry-only link. Never guessed for an old link |
| `studioflow_link_code`, `studioflow_link_title`, `studioflow_pending` | from WO-SKETCHUP-02 |

Old models are read lazily: nothing is written on open; keys are written only after the user's
answer or a confirmed "Cek & perbarui". Status is computed, never stored.

## Names (owner D1) and status

| Link | Proposed name | Status |
|---|---|---|
| entry, entry has no option | `PL-02` | belum ada spesifikasi |
| entry only, entry has one option | `PL-02` | opsi A, belum final |
| entry only, two or more options (old link) | unchanged | opsi belum dipilih |
| option, final | `PL-02` | final |
| option, the only option, not final | `PL-02` | belum final |
| option, two or more options, not final | `PL-02-<label>` | alternatif / bukan final (final: X) |
| option deleted | unchanged | opsi sudah dihapus (treated as entry-only) |
| entry deleted / other project / not linked | unchanged | as in WO-SKETCHUP-02 |

A material never takes a name another material holds; the conflict is listed. When the holder is
a material with a stale link, the plugin offers (asked) to rename it to `<code> lama`.

## Plugin flow

- After picking an item: if it has options, choose one (an only option is chosen); "tanpa opsi"
  is offered for an entry without options. No option is created from SketchUp (Q2).
- "Perbarui kode dari jadwal" becomes "Cek & perbarui": one schedule read, status of every linked
  material (materials collection only, no geometry traversal), summary grouped as rename /
  not final / option not chosen / stale / other project / conflict; apply on Yes in one undo step
  with temporary names (final moving A → B swaps `PL-02` and `PL-02-A`).
- Merge candidates: same project, same entry id and same option id (decision Q3).
- Component Tracker and `MaterialMetadata.apply_code` accept `PREFIX-NN-L` (registered prefix,
  letter suffix) as a valid code; `parse_dirty` does not flag it.

## Acceptance

1. Entry with options A/B/C: linking B (not final, A final) names it `PL-02-B` and shows
   "bukan final (final: A)".
2. Final moved A → B in the Schedule, then "Cek & perbarui": B becomes `PL-02`, A becomes
   `PL-02-A`; one undo restores both.
3. An old entry-only link to an entry with three options is not renamed and shows
   "opsi belum dipilih"; opening an old model changes nothing.
4. Entry created from SketchUp has no option and the material is `PL-02` "belum ada spesifikasi".
5. Component Tracker shows `PL-02-B` as Valid Code.
6. Plugin 1.2.x keeps working against module 1.1.0.
7. Checks: sketchup integration tests, high gate, plugin `ruby -wc`, rule tests, owner test in SketchUp.

## Rollback

Server change is additive (revert one revision). Do not return a model that already has
`PL-02-B` names to plugin 1.2.x: its refresh would try to rename them back.
