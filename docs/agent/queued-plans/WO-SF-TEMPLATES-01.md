# WO-SF-TEMPLATES-01 — StudioFlow Templates page, named schedule templates (draft)

Status: DRAFT (Lead, 2026-10-24) — owner questions open (below). Mockup: board "v3 · StudioFlow Templates (built in)" on
https://claude.ai/artifact/5sChwEHLG1ta1wmzTpDcBS.
Module(s): `studioflow` (EXTEND: schedule templates already exist as one global list). Tier: HIGH (schema meaning of
templates, data migration of today's template items, what a new project receives).

## Why

Owner, 2026-10-24: a page that looks like its own module but is built in, laid out like the Product Schedule, to manage
which fixtures and materials a template holds, per kind of project ("template name": Retail, F&B, Residential…).

## What exists today

`sf_schedule_template_category` / `sf_schedule_template_item`: one global set of template items per section (Material,
Fixture), edited in StudioFlow Settings → Schedule; `applyTemplates` copies every active item into a project. There is no
template name and no choice per project.

## Decisions (proposed)

1. **Built in, not a switchable module:** a "Templates" entry in the StudioFlow rail, always on (StudioFlow is a core
   app, `MODULES-DECISION.md` D2). Inside it, pill tabs: Schedule, Phases, Requirements, Prefixes; the existing settings
   pages move there. Who: holders of `studioflow.settings.manage` (Manager, Platform Owner).
2. **Named schedule templates:** new `sf_schedule_template` (name, active, default flag, order). Every template item
   belongs to exactly one template. Today's items become the template **"Standard"**, marked default (data migration,
   nothing lost).
3. **Project gets a template once:** the New project dialog shows "Schedule template" (default preselected, or none).
   Items are copied into the project at creation as today; later template edits never change existing projects. The
   project remembers which template it started from (snapshot of the name) for "used by n projects".
4. **Page layout as the mockup:** template list left, the selected template's items like the Product Schedule (Material /
   Fixture, grouped by category with prefix, photo, brand, colour, on/off), item detail right. Actions: new template,
   duplicate template, add item, copy items from a project, copy an item into another template, archive a template.
5. Codes (FL-01…) are still given per project when copied, as today.

## Owner questions

1. Can one item sit in several templates as the same item (edit once, all change), or is each template's item its own copy
   (recommended: own copy, with "copy into another template")?
2. Should the template also choose the phase template for the project (one "project type" picks both), or only the
   schedule (recommended for now: only the schedule)?
3. Apply a template to an existing project later (adds missing items, never deletes): needed now, or later?
