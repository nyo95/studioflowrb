# UI/UX & Business-Flow Critique — 2026-09-23

Status: owner feedback / design input, not a locked decision (same status class
as [`GLOBAL-MENU-DESIGN-BRIEF.md`](apps/platform/GLOBAL-MENU-DESIGN-BRIEF.md)).
Created: 2026-09-23, from a live browser walkthrough of the R8.108 build.

This records owner critique of the current UI/UX across StudioFlow (Product
Schedule, MOM) and the global shell (navigation, settings, visual tone), plus
an explicitly requested critique of Master Data's Add Brand / Add Supplier /
Add Price flow. Each section separates **ground truth** (what the code
actually does today, verified against source), **critique** (the problem),
**doc/codebase gap** (where an existing contract is silent, stale, or
internally contradicted — found while researching this), and a
**recommendation** (a starting direction, not a mandate — same caveat
`GLOBAL-MENU-DESIGN-BRIEF.md` uses).

None of this overrides `DESIGN.md`, `UI_ENGINE.md`, or the app contracts under
`apps/`, which remain locked authority until the owner explicitly revises
them. Part 4 in particular runs into a real conflict with `DESIGN.md`'s
stated tone — flagged there, not resolved here.

---

## 1. StudioFlow — Product Schedule (card metadata & photo)

**Ground truth.** The entry side panel only edits Location/Qty/Unit
(`schedule-board.tsx` `EntryPanelContent`); the eight per-card caption fields
(Brand, Item No, Color, Pattern, Finishing, Size, Location, Qty) are chosen
through a separate hover-revealed gear icon ("Card fields") that opens a
checkbox popover, unrelated to the panel. Clicking a card's photo opens a
"Photo — PA-01 option A" modal with a single "Choose image" button before the
real editor (crop/pan sliders + a freehand red-line annotation layer) appears.

**Critique.**
- The metadata split is arbitrary from a user's point of view: Location/Qty
  live in the panel, the other eight fields live in a separate popover only
  reachable by hovering a card and finding a small gear icon. There's no
  reason a user editing "what shows on this card" should be a different
  surface from "what this item's fields are."
- The "Choose image" intermediate modal is a needless extra click — the
  workspace it hands off to already has its own file picker affordance.
- Crop/pan via three sliders (Crop zoom, Horizontal focus, Vertical focus) is
  precise but slower and less familiar than direct pinch/scroll-zoom +
  drag-to-pan, which is what every comparable consumer tool (WhatsApp,
  Google Photos) uses.

**Doc/codebase gap found.** Neither
[`STUDIOFLOW-REWORK-CONTRACT.md`](apps/studioflow/STUDIOFLOW-REWORK-CONTRACT.md)
§11 (Schedule) nor §13.7 mentions the "Card fields" popover at all — it's a
real, non-trivial UX surface (`schedule-board.tsx:193-264`, `CardFieldsMenu`)
with zero contract coverage. Likewise, the freehand annotation drawing layer
inside the shared `ImageWorkspace` component
(`src/platform/ui_engine/patterns/image-workspace.tsx`) is undocumented in
§11.7 — the contract describes only crop aspect/format/size limits, not that
photos can be freehand-annotated. This isn't a contradiction (nothing in the
contract says annotation *doesn't* exist), it's contract silence on a shipped
feature — worth folding into §11 the next time that contract is touched.

**Recommendation.** Fold Card Fields into the entry panel as one "What shows
on the card" sub-section, so there's one place for all per-item display
config. Make the photo click open the crop/pan editor directly (skip the
"Choose image" modal — the workspace already has its own picker). Consider a
scroll-to-zoom + drag-to-pan interaction on the preview canvas itself,
keeping the sliders as a secondary/keyboard-accessible fallback rather than
the only input.

---

## 2. StudioFlow — MOM (Minutes of Meeting)

**Ground truth.** "Meeting details" (Topic/Date/Venue/Prepared by/Attendees)
renders as a fully open form card above the Revisions and Section blocks,
with its own "Save details" button, taking a full screen's height. Section
point text uses a plain `<textarea>` with a page-level "Numbered/Plain" style
selector (not per-line). Photo annotation currently supports only a single
freehand red-line pointer drawing tool with "Clear annotations" — no shapes,
arrows, multiple colors, or a select/undo tool.

**Critique.**
- Meeting details is metadata you set once and rarely revisit, but it
  permanently occupies the same visual weight as the actual working content
  (Sections, points, photos) below it — it should collapse to a compact
  header once filled in, expandable on demand.
- Free-text numbering requires the user to pre-select "Numbered" from a
  dropdown rather than just typing "1." the way any modern editor
  auto-continues a list — this is friction for a form meant to be filled in
  quickly on-site.
- The annotation tool is one step above nothing: a single pen, one color, no
  shapes/arrows/text callouts — the kind of markup a site-inspection photo
  actually needs (circle a defect, arrow to a spot, write a short label)
  isn't well served by a single freehand line.

**Doc/codebase gap found.** This is the most concrete gap in the whole
review: `STUDIOFLOW-REWORK-CONTRACT.md` §10 describes MOM as having **"No
issue/supersede state"** and lists only
`topic/meeting_date/venue/attendees/prepared_by_name` and items/points/images
— but the actual code (`mom-editor.tsx`, `RevisionsCard`) implements a full
save/restore revision-snapshot system ("Save revision," latest-N-kept
retention, "Restore"). That's a materially different capability than what's
contracted, shipped without the contract being updated. The annotation
drawing tool is also undocumented in §10 (same gap as Schedule, above) even
though the MOM dialog's own UI copy ("crop it to 4:3, and draw markups if
needed") tells the user it exists.

**Recommendation.** Collapse Meeting Details to a summary header
(`Topic · Date · Venue`) with click-to-expand/inline-edit once saved once.
Replace the plain textarea + style dropdown with a lightweight rich-text
block that recognizes "1." / "-" as list starters (most editor primitives
already used elsewhere in `UI_ENGINE.md` should cover this without a new
dependency). Expand the annotation toolbar to at least pen + arrow + shape +
a small color set, matching the reference toolbar the owner attached
(Claude's own annotation UI). Update `STUDIOFLOW-REWORK-CONTRACT.md` §10 to
document the revision system and annotation capability as actually built,
independent of whichever UX direction is chosen.

---

## 3. Global navigation, header, and Settings

**Ground truth.** The logo renders at `h-[38px] max-w-[190px]`
(`src/platform/authenticated-shell/index.tsx:45`). The header search is a
popover (icon → `Popover.Content` panel), not an animated expand, and only
appears on StudioFlow routes. The account dropdown
(`account-menu.tsx:19-44`) groups Account, then a separate "Administration"
label with General Settings / Users / Roles & Access, then Sign out. A
labeled two-group sidebar (`SettingsShell`, "Settings" + "Applications")
exists but only renders on `/settings/general` and StudioFlow's own settings
— `/settings/access/users` and `/settings/general/masterdata` (Master Data
Settings' Units/Categories/Supplier types/Supplier categories/Deletion
review/BQ approvals) are both flat pages with no left-nav at all, just a
`Tabs` row for the latter.

**Critique.** This matches everything flagged in the annotated screenshots
(logo scale, search interaction, menu grouping, inconsistent sidebar
presence) — see the recommendation below for why it's already tracked rather
than newly critiqued here.

**Doc/codebase gap found — this one already exists and is unresolved, not
new.**
[`GLOBAL-MENU-DESIGN-BRIEF.md`](apps/platform/GLOBAL-MENU-DESIGN-BRIEF.md)
(2026-09-16, explicitly "design input, not a final design decision") already
raised the app-switcher placement question and proposed a simplified account
menu (`Account / Settings / Sign out`, brief line 138-140) plus **"a
centralized settings canvas with one settings sidebar... preferred as the
direction to explore"** (brief line 133). Neither has been implemented: the
account menu still ships the longer "Administration" submenu the brief
explicitly warned against ("The account menu should not become a long
administration menu," brief line 132), and the one-sidebar direction is only
partially built (General Settings has it, Users/Roles/Master Data Settings
don't) — an internal inconsistency independent of whether the brief itself
gets locked. This is already tracked as
`docs/BACKLOG.md` → Platform Foundation → `[PLANNED] Redesign the
top-header/sidebar boundary` (references the same brief). **No new backlog
item is needed here** — this critique confirms the existing `[PLANNED]` item
is still accurate and should stay the point of reference, rather than
spawning a duplicate.

**Recommendation.** Treat this section as a second, corroborating owner
signal on the same still-open brief rather than a new decision: shrink the
logo, animate the search open, and pick one of the brief's own options (a
single-sidebar settings canvas, and a slimmed account menu) — the brief
already lists the trade-offs, it just hasn't been executed against.

---

## 4. Overall visual tone & tooltip consistency

**Ground truth.** `DESIGN.md:11-14` states the intended tone directly:
*"StudioFlow uses a quiet, restrained professional UI... compact,
information-dense layouts... This is an operational tool, not a marketing
site."* A `Tooltip` component and the `(?)`-icon pattern already exist and
are documented (`UI_ENGINE.md` §8, `Field.description`, `SectionCard.hint`)
but are barely used: `SectionCard`'s tooltip prop (`hint`) appears in only 2
files app-wide, versus inline `description` text in 88 files — including
multi-sentence explanations (e.g. `vendor-directory.tsx:595`'s two-sentence
Supplier-categories description) that `DESIGN.md` §14 itself says belong
behind a tooltip ("Field help appears only when the input is ambiguous,
risky, or constrained... progressive disclosure is preferred for rare
metadata").

**Critique / important distinction.** This request actually contains two
separate things that need different answers:

1. **"Too much inline text that should be tooltips"** — this is a real
   adoption gap, not a missing feature or a doc conflict. The `Tooltip`
   component and the `hint` prop already exist and are already documented as
   the correct place for exactly this kind of copy; the code just isn't
   using them consistently. This is safe to fix incrementally (swap long
   `description` copy for `hint`/`Tooltip` per screen) without touching any
   contract.
2. **"Feels stiff, want it to feel like WhatsApp/Facebook/Todoist"** — this
   is **not** a bug or drift against `DESIGN.md`; it's the opposite of what
   `DESIGN.md` currently mandates. The locked contract explicitly chose a
   dense, bordered, low-decoration "operational tool" look over a light,
   airy consumer-app feel. Making the app "feel like WhatsApp" is a genuine
   product-direction change to a **locked** shared contract, not a
   correction — it would mean revising `DESIGN.md` itself (spacing, border
   weight, corner radius, shadow use, possibly the type scale), which then
   cascades through every component in `UI_ENGINE.md` and every app screen
   that consumes them. That's a much bigger, cross-cutting decision than the
   other items in this document and deserves to be scoped and agreed on
   explicitly before any component work starts, rather than approached
   screen-by-screen.

**Doc/codebase gap found.** None on the tooltip mechanism itself — `DESIGN.md`
and `UI_ENGINE.md` already agree with each other and the components already
implement both paths correctly; only usage lags the documented rule. On tone,
there's no gap either — the code is doing exactly what `DESIGN.md` currently
specifies. Nothing here is stale documentation; it's a request to change the
documentation itself.

**Recommendation.** Split this into two workstreams: (a) a mechanical
tooltip-adoption pass — audit `description=` usage against `DESIGN.md` §14's
own rule and move qualifying copy to `hint`/`Tooltip`, no design decision
needed, can start immediately; (b) a separate, explicit decision on whether
to revise `DESIGN.md`'s density/tone stance, scoped and agreed before any
visual work starts, since it's a locked contract change with wide blast
radius rather than a bug fix.

---

## 5. Master Data — Add Brand / Add Supplier / Add Price flow

*(Explicitly requested: critique of both business logic and UI/UX.)*

**Ground truth — the three creation surfaces today:**

| Surface | Fields | Can inline-create a new... |
|---|---|---|
| **Add Brand** (`brand-directory.tsx`) | Name, Owner supplier, Hashtags, Categories, Suppliers, Links, Notes | Owner supplier (name only, **zero Vendor Types set**); Category. **Cannot** create a new general Supplier — the Suppliers field only picks from existing vendors. |
| **Add Supplier** (`vendor-directory.tsx`) | Name, Legal name, Supplier types, Supplier categories, Address, Contacts, Notes | Supplier category. **No Brand field exists on Vendor at all** — a supplier can't be linked to a brand from its own creation dialog. |
| **Add Price → new SKU** (`pricing-directory.tsx`) | SKU code/name, Brand, Unit, Dimensions, Category, Supplier | Brand (name only); Supplier (name + at least one Vendor Type, via a small nested dialog). **This is the only surface where Brand and Supplier can both be created together**, but the link is recorded only as two foreign keys on the price/SKU row — **not** as the `BrandSupplier` relation the Brand contract says Brand "owns." |

**Business-logic critique.**

1. **No flow produces a correctly-linked triple in one pass.** `masterdata.md`
   §4.1 states Brand "owns... all `BrandSupplier` mutations" — meaning that
   relation can only be created/edited from the Brand side. But: Brand's
   dialog can quick-create an Owner Supplier, not attach an *existing new*
   general supplier and record `BrandSupplier` in the same step. Vendor's
   dialog has no Brand-relation field whatsoever. Pricing's dialog *can*
   create both a Brand and a Supplier together, but never writes
   `BrandSupplier` — so a Price-created Brand+Supplier pair looks linked
   (they're both on the same price row) but isn't actually recorded as a
   real Brand↔Supplier relationship anywhere the Brand or Vendor pages would
   show it. Every path ends with a manual follow-up trip to fix the
   relationship that should have been captured at creation time.
2. **Quick-created entities are silently incomplete, not silently safe.** A
   Brand's quick-created Owner Supplier gets **no Vendor Type at all**, and
   `vendor-contract.md` §11's own quick-entry rule requires "name + at least
   one existing VendorType" for a vendor to be usable anywhere pricing-
   related — so this specific quick-create path produces a vendor that fails
   its own contract's minimum bar and is invisible to every price picker
   until someone manually edits it later. This is a "looks finished, isn't"
   trap for whoever created the brand.
3. **The one adequate flow lives in the wrong place.** If the real workflow
   is "I'm onboarding a new Brand and I already know who supplies it,"
   Pricing's "new SKU" dialog is the only surface that supports creating
   both in one sitting today — but nobody registering a brand with no
   product yet would think to open Pricing to do it.

**UX critique.** Three different dialogs implement three different
"quick-create a related entity" patterns with three different levels of
completeness (bare name / name+type / no equivalent at all) — that
inconsistency is itself confusing before even getting to the missing-link
problem above. There's also no cross-navigation after a quick-create: an
incomplete Owner Supplier created from Brand gives no "finish setting this
supplier up" nudge back to the full Vendor edit dialog.

**Doc/codebase gap found.** `brand-contract.md` and `vendor-contract.md`
don't describe the Owner-supplier quick-create at all — it's implemented
(`createOwnerVendorQuickAction`) but undocumented, and per
`vendor-contract.md` §11's own rule, it produces a vendor that starts out
non-compliant with that same section's minimum bar (no VendorType). This
isn't a contradiction between two docs, it's an implementation that doesn't
meet the bar its own governing contract sets for quick-created vendors
elsewhere.

**Recommendation** (starting point, not a mandate — same as every other
section here): standardize on one shared "quick-create vendor" affordance
used identically from all three entry points, and never let it complete
without at least one Vendor Type (closing gap #2). Then close gap #1 by
making Brand's existing Suppliers field support "+ Create new supplier for
this brand" that both creates the vendor and writes the `BrandSupplier` row
in the same action — this directly answers the owner's example ("add a
brand and its supplier at the same time") without touching Pricing at all,
and without asking Vendor to grow a Brand field it currently has no contract
basis for.

---

## Consolidated doc/codebase gap findings

| Doc | Gap | Nature |
|---|---|---|
| `STUDIOFLOW-REWORK-CONTRACT.md` §11 | "Card fields" popover (`CardFieldsMenu`) is undocumented | Contract silence on a shipped feature |
| `STUDIOFLOW-REWORK-CONTRACT.md` §10, §11.7 | Photo freehand-annotation layer (`ImageWorkspace`) is undocumented in both MOM and Schedule | Contract silence on a shipped feature |
| `STUDIOFLOW-REWORK-CONTRACT.md` §10 | Says MOM has "no issue/supersede state," but a full save/restore revision-snapshot system (`RevisionsCard`) is implemented | Contract text is stale vs. shipped behavior |
| `brand-contract.md` / `vendor-contract.md` | Brand's Owner-supplier quick-create is undocumented and produces a vendor that fails `vendor-contract.md` §11's own "at least one VendorType" bar | Implementation gap against the contract's own stated rule |
| `apps/platform/GLOBAL-MENU-DESIGN-BRIEF.md` | Account menu still ships the long "Administration" submenu the brief explicitly recommended against; the "one settings sidebar" direction is only partially built | Already tracked — `BACKLOG.md`'s `[PLANNED]` "Redesign the top-header/sidebar boundary" item, confirmed still accurate, no new item needed |
| `DESIGN.md` / `UI_ENGINE.md` | No gap — `Tooltip`/`hint` already exist and are documented correctly; usage just lags the rule | Adoption gap, not a doc gap |
| `DESIGN.md` | No gap — the "stiff" complaint is a request to change a locked, intentional design decision, not a drift correction | Needs an explicit product decision, not a bug fix |

## Suggested prioritization

Roughly cheapest-and-safest to most involved:

1. Tooltip-adoption pass (§4a) — mechanical, no design decision required.
2. Schedule photo-modal skip + Card Fields relocation (§1) — contained to one file.
3. MOM Meeting Details collapse + list-typing (§2) — contained to one file/component.
4. Master Data quick-create unification (§5) — touches three dialogs and the `BrandSupplier` write path; worth a short design pass first given it changes a contracted relation-ownership rule.
5. Global nav/settings execution against the existing brief (§3) — already scoped in `GLOBAL-MENU-DESIGN-BRIEF.md`, just needs a decision + execution pass.
6. `DESIGN.md` tone/density revision (§4b) — largest blast radius, needs its own explicit decision before any component work.
