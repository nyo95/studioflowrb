# WO-SF-SCHEDULE-CONTACT-MD-01 — Schedule Contact suggested from Master Data

Modules: `masterdata` (new public read), `studioflow` (schedule read + action, then UI).
Target revision: plan R9.220; backend (Codex) R9.221; UI (Lead) R9.222.
Risk: low-medium — a new cross-module read of people's phone numbers; no schema change.
Owner decision: 2026-10-23.

## Why

The owner: a schedule option's Contact should come from Master Data when the Brand has contacts there, and stay
overridable. Format: name, job title in brackets, then the phone, e.g. `Andi (Sales) - 0813412457877`.

Master Data already holds this in `VendorContact` (`person_name`, `job_title`, `phone`, `extra_phones`,
`is_primary`, `vendor_id`, optional `brand_id`). StudioFlow reads Master Data only through
`createMasterDataPublicRead`, which has no contact read today.

## Locked decisions

1. **Contact stays a text snapshot** on the option (`SfScheduleOption.contact`, ≤160). Choosing a Master Data contact
   copies its formatted text at that moment; later Master Data edits never rewrite a schedule. No foreign key, no id
   stored, no schema change.
2. **Format** (StudioFlow domain helper `formatScheduleContact`): `personName`, then ` (jobTitle)` when there is one,
   then ` - phone` when there is one (the first phone only). Trimmed, cut to 160.
   Examples: `Andi (Sales) - 0813412457877`, `Budi - 0812…`, `Citra (Admin)`.
3. **Which contacts** belong to a Master Data Brand (new Master Data public read
   `listBrandContacts(brandId)`, active Brand only, otherwise `[]`):
   - contacts of any vendor whose `brand_id` is that Brand (brand representatives), first;
   - then contacts with no `brand_id` of the Brand's owner vendor and of its suppliers (`BrandSupplier`), excluding
     archived vendors;
   - primary contacts first within each group, then by name; no duplicates; at most 20.
   Each row: `{ id, personName, jobTitle, phone, vendorName, isPrimary, forBrand }`. Email, notes and extra phones are
   not exposed.
4. **Who may read it:** anyone who may read the project's schedule (the StudioFlow side checks schedule read; Master
   Data permissions are not required, the same way Brand choices already work).
5. **No auto-fill.** Contact is optional and often not wanted (owner); the field offers the Brand's contacts as
   choices and keeps free typing. A typed Brand (no Master Data id) has no suggestions.
6. Out of scope: the Schedule Assistant/MCP, templates, print, Master Data screens.

## Executor scope (R9.221)

- Master Data public read `listBrandContacts(brandId)` per decision 3 (+ its type export), with tests.
- StudioFlow: `formatScheduleContact` in the schedule domain (tests for the three shapes and the 160 cap);
  schedule service `listBrandContactChoices({ grants, projectId, brandId })` (schedule read + project access) returning
  `[{ id, label, vendorName, forBrand }]` where `label` is the formatted text; server action
  `listScheduleBrandContactsAction({ projectId, brandId })`.
- Tests: brand-specific before supplier contacts, primary first, archived vendor excluded, unknown/archived Brand → `[]`,
  permission and project scope.
- Boundary check stays green (StudioFlow imports Master Data only through `public`). Changelog R9.221. No migration,
  no UI change.

## Lead scope (R9.222)

The inspector's Contact field becomes a searchable choice like Brand: the Brand's contacts (label, with the vendor
name as secondary text), plus `Use "…"` for anything typed. It loads when a Master Data Brand is chosen.

## Acceptance

- PT-04 with Brand DULUX offers DULUX's Master Data contacts as `Name (Title) - phone`; picking one fills Contact.
- Typing any other text still saves it as typed.
- Changing the contact in Master Data later does not change PT-04.
