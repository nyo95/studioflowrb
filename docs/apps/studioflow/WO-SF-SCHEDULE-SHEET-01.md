# WO-SF-SCHEDULE-SHEET-01 — Product Schedule list matches the studio's Google Sheet

Module: `studioflow` (Product Schedule).
Target revision: plan R9.204; backend (Codex) R9.205; list UI (Lead) R9.206.
Risk: medium — one additive column plus a data move out of `notes`.
Owner decisions: 2026-10-23.

## Why

The studio's sheet has the columns CODE | MATERIAL TYPE | EX | TYPE | INITIALS TYPE | IMAGE | LOCATION | CONTACT.
The List view should read the same. Two of them have no home today: the legacy sheet import writes
`Initials type: …` and `Contact: …` lines into the option's `notes`, where they cannot be scanned or searched.

## Locked decisions

1. **Contact** is a real optional field on the option (`SfScheduleOption.contact`, text ≤ 160), the supplier or shop
   for that product (example: "SOCIOLLA (old)"). It is a per-option fact like Brand. Because the option snapshot is shared
   with template items, `SfScheduleTemplateItem.contact` is added too, and apply/save-as-template/duplicate copy it like the other
   snapshot fields.
2. Contact is **internal**: not a card field, not in `SCHEDULE_CARD_FIELD_LABEL`, not printed. It is part of the search key.
3. **Initials type is not a field.** It is the rough description used before the exact product is known
   ("kayu" for a wood pattern, "pink" for a colour). The rebuild already holds that in Color / Pattern / Finishing.
   The List's INITIALS TYPE column shows that spec summary (Lead UI, R9.206). No schema change for it.
4. Legacy sheet import (`parseLegacyScheduleSheet` and its caller):
   - `contact` goes to the new field, no longer to `notes`;
   - when TYPE is empty and INITIALS TYPE is filled, the initials become the product name (instead of "Imported");
     when both are filled, the initials stay as the `Initials type: …` line in notes, as today;
   - the Material header `material type` is accepted as an alias of `product category` (the owner's current sheet uses it).
5. Simple CSV/XLSX import (`SIMPLE_IMPORT_COLUMNS`) gains an optional `Contact` column.
6. **Data move:** in the same migration, for every option whose `contact` is null and whose `notes` has a line
   `Contact: <value>` (case-insensitive label, trimmed), set `contact` to the value and remove that line from notes;
   notes that become empty become null. Other lines (`Initials type:`, `Image:`, free text) stay. Options only.
7. Out of scope: the schedule MCP / composer (`public/schedule-composer.ts`) does not get Contact in this WO; it ignores the field.
   The board card and print are not touched. No UI design work by the Executor beyond the minimal wiring below.

## Executor scope (R9.205)

- Prisma: `contact String?` on `SfScheduleOption` and `SfScheduleTemplateItem`; one migration with the decision-6 data move.
- `cleanSnapshot`/`buildSnapshot`/`optionData` and the template equivalent carry `contact`; `scheduleSearchKey` includes it.
- `ScheduleOptionView.contact` (and the template item view) is exposed; option create/update/duplicate, template apply and
  save-as-template copy it.
- Imports per decisions 4 and 5.
- Minimal wiring: one plain `Contact` input in the existing option edit form so the field can be exercised; the Lead restyles it.
- Tests: snapshot/search key, both imports (incl. `material type` header, initials-as-type fallback, contact not in notes),
  duplicate/template copy, and the migration's notes move (a fixture with `Contact:` among other lines).
- Changelog R9.205. Apply the migration to the dev and test databases of the selected location.

## Lead scope (R9.206)

List view columns, left to right: CODE | MATERIAL TYPE | EX | TYPE | INITIALS TYPE (Color · Pattern · Finishing summary) | IMAGE |
LOCATION (wider, not cut short) | CONTACT | status badge. Qty/Unit only in the Fixture section. Category group header rows stay.
The inspector shows Contact under Brand. Narrow screens scroll the table sideways.

## Acceptance

- Importing the owner's sheet with `MATERIAL TYPE` header succeeds; Contact lands in the Contact column, not notes.
- Existing imported items (e.g. PT-02) show their Contact in the new field and their notes no longer repeat it.
- Searching a contact name finds the item.
- The List reads like the sheet, column for column (Lead, browser by owner).
