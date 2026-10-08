# Browser acceptance walk (Lead, 2026-10-08)

One ordered session that closes the `[UNVERIFIED]` entries in `docs/BACKLOG.md`.
Run it on the dev server (`http://localhost:3001`) as the owner account. Labels
below are the ones in the code; a label may differ by a word, the intent is what
counts. Everything you create is named `ZZ-Test …` so it is easy to archive at the
end (section 11). Mark each step PASS / FAIL and note the screen when it fails.

Do not run this against data you cannot lose without a database backup:
sections 5 and 6 archive and restore real records (only the `ZZ-Test` ones).

## 0. Before you start (2 min)

1. Sign in, open **Master Data → Pricing**. The page loads without a red error.
2. Account menu (avatar): **My preferences** opens; **Bantuan: ulangi panduan** is
   not shown on this page (only inside an app that has a tour).
3. Browser console has no red errors on Home, Pricing and a project page.

## 1. First-use tour (StudioFlow) — closes the Tour entry

Needs a fresh account: create one in **Settings → Access** (a role with StudioFlow
access and project read), sign in as it in a private window.

1. Open `/studioflow`. After about a second the **language pick** appears first.
   Pick **English**; step 1 "Start from Home" rings the Home item.
2. **Next** ×3: Projects ringed, "Work phase by phase" as a centred card, then the
   bell. Press **EN/ID** on a card: the text switches language and stays switched
   on the next card. **Done**.
3. Reload; open the same account in another browser: the tour does **not** come back.
4. Account menu → **Help: replay guide**: it plays again without the language
   question. Close it with **Esc** at step 2. Reload: it does not return.
5. Phone width (390 px, devtools device mode): the card docks at the bottom or sits
   under the ringed control and never covers the whole screen; steps whose control
   is hidden are skipped.
6. As a role without project read: step "Open a project" is skipped.

## 2. Material prices and Brand links — closes WO-MD-ENTRY-01 and CRUD-01 (part)

Setup (Master Data, create once):

- Supplier **ZZ-Test Mat A** and **ZZ-Test Mat B** (type that supplies material),
  **ZZ-Test Both** (a type that supplies material and labor), **ZZ-Test Labor**
  (labor only).
- Brand **ZZ-Test Brand** with owner **ZZ-Test Mat A**; one SKU **ZZ-Test SKU 1**
  and **ZZ-Test SKU 2** under it with a price each from Mat A.

Walk (Pricing → **New price → Material**):

1. Open the multi-row entry, pick Brand ZZ-Test Brand, SKU 1, supplier **Mat B**:
   the supplier shows "new for this brand" and a note says it will be added to the
   Brand. Enter an amount, **Save**. The price is created (no "not linked" refusal).
2. Open **Brands → ZZ-Test Brand**: Mat B is now one of its suppliers.
3. Row with an amount typed as `"By Request"` (quoted text) saves and shows as text.
4. **Save the valid rows:** add 4 rows: two good (SKU 2 from Mat B, and SKU 2 from
   ZZ-Test Both), one that repeats a live (supplier, SKU) pair (SKU 1 from Mat A), one
   with no amount. **Save**: the two good rows leave the
   grid; the two bad rows stay with their reasons; a line says "2 saved. 2 rows need
   fixing and are still here." Fix the amount on the last row, **Save** again: it
   saves; no duplicate of the first two appeared in the list.
5. Open **Brands → ZZ-Test Brand → Edit**, remove supplier **Mat B** from its
   suppliers and Save: refused with a message naming the supplier and the number of
   prices, plus **Show those prices**. Click it: Pricing opens already filtered to
   Mat B and ZZ-Test Brand showing those prices.
6. Change the Brand owner to Mat B while Mat A still has prices: refused the same way
   (owner in use) unless Mat A stays a supplier.

## 3. Labor, Material+Labor and the several-suppliers grid

1. **New price → Labor:** supplier list shows **ZZ-Test Labor** and **ZZ-Test Both**,
   not Mat A. Save one labor price for each.
2. **New price → Material+Labor:** supplier list shows Mat A, Mat B, Both and Labor
   (material-, labor- or both-capable). Save one Material+Labor price from **Mat A**
   (material-only supplier): it saves.
3. In the Material+Labor entry, **New supplier** (quick add): the type list offers
   types with either capability; create **ZZ-Test Quick**; it is selected.
4. **Several suppliers:** pick a category and Both + Labor; enter three items, one
   with an amount for only one supplier (blank cell = no price), one item whose name
   already exists for Labor. **Save**: the good cells save, the failing cell stays
   with "Supplier: reason" and the row keeps only its failing cell; the saved cells
   are gone from the grid.
5. Paste a block copied from Excel (Name, Specification, one amount per supplier):
   the grid fills in.

## 4. Suppliers and Brands: create, edit, duplicate input

1. **New Brand** with the same link URL typed twice and the same hashtag twice: it
   saves once each, no generic error.
2. **New Supplier** with a type chosen twice (if the control allows): saves.
3. Renaming a live Brand whose owner supplier is archived is covered by an automated
   test only: archiving an owner now archives its Brand too, so the screens can no
   longer reach that state except through old data. Skip it here.

## 5. Archive and restore cascades — closes CRUD-01

1. Make **ZZ-Test Own** a supplier that **owns** Brand **ZZ-Test OwnBrand** (with a
   SKU and a price) and is only a listed supplier of **ZZ-Test Brand**.
2. **Archive ZZ-Test Own**: its prices, **ZZ-Test OwnBrand**, that Brand's SKU and
   its prices all disappear from the live lists; **ZZ-Test Brand** stays live.
3. **Restore ZZ-Test Own**: the Brand, SKU and prices come back.
4. Archive **ZZ-Test OwnBrand** by hand first, then archive and restore the
   supplier: the hand-archived Brand **stays archived**.
5. Make a live Brand with the same name as an archived one and try to restore the
   archived one: refused with a message naming the Brand, nothing changed.

## 6. Price-less SKU and the sample shelf — closes Sample shelf, New SKU, CRUD-01

Needs `masterdata.sample.read` and `.manage` for your role (Settings → Access).

1. **Samples → Add sample**, type a SKU name nobody has, **New SKU** from the dialog:
   it is created without a price and selected. Save the sample.
2. **SKU page**: the new SKU shows with no prices.
3. **Archive that SKU, then restore it**: it comes back (no "no restorable price"
   refusal). Archive its **Brand** and restore the Brand: it also works.
4. Move the sample to another rack/box; **Lend** it with a StudioFlow project;
   **Send to client**; **Return**; **Mark lost** on another; try to remove a sample
   that is out (refused); open history (every step is listed); right-click menu.
5. **Sample requests → Put on shelf** for a request; then **Sample received** shows
   the shelf note in that project's Schedule and the requester gets a notification.

## 7. StudioFlow client notes, images and formatted text

1. Open a project and a phase; **Send** an iteration; **Client answered**; in the
   notes use **bold**, *italic*, bullets, numbering; press Enter inside a list (the
   list continues).
2. In the answer dialog **drop** two images, **paste** a screenshot (Ctrl+V), **pick**
   several: thumbnails appear; add more than 12 in total: the 13th is refused with a
   message; a PDF is refused; a large phone photo is shrunk and accepted.
3. While a batch is uploading, drop another file: a message says to wait.
4. Choose **Revision**: the next iteration's brief shows the notes and the thumbnails;
   click one: large view with previous/next. **Remove** an image: it asks to confirm.
5. Pinned note, visit notes and MOM: formatting works; MOM print shows it formatted.
6. Try to rename **CD Mall**: refused with a clear message.

## 8. StudioFlow Timeline, Schedule, re-layout

1. **Timeline → Dates & plan**: lead times load; **Save**; **Save and apply plan**;
   **Back to the plan**; the suggested Fit Out start appears. A project's read-only
   Timeline tab → **Edit dates and plan** opens the same dialog. "Today · date" at
   Week and Month zoom does not hide a needed week number, also in Dark.
2. **Product Schedule:** right-click a board card → Open / Delete; **New category**
   picker (studio categories, type a new one, also in an empty section, the
   "already in this project" hint); **Unset final**; **Apply studio templates**
   confirm and its count; a new option stays selected after Save; re-import a real
   Google Sheets export.
3. Re-layout: send → client answered → Revision → OK; CD Mall → CD Final; a
   supervision visit; tick and dismiss requirements in the aside; **Everyone's**
   scope as a manager with several designers.
4. Manager completion override with a reason, and its "Complete anyway" entry in
   History.

## 9. Master Data older items

1. Text price labels: typing and pasting quoted text in the several-suppliers grid
   and the material price table; re-import the company workbook with a labelled cell.
2. Supplier categories: save a work price and see the supplier gain the category;
   create a category inline from the Suppliers dialogs; **Show all categories**; the
   "New for this supplier" hint; a supplier with no categories.
3. Read the BQ standard quotation terms once (validity 30 days, 50/40/10 payment,
   VAT excluded) and correct them if they are wrong.

## 10. Layout and theme

1. **Phone width (390 px):** StudioFlow header and tabs stay fixed and only the
   content scrolls; the phase row scrolls inside its card, not the page.
2. **StudioFlow rail at 840 px** and at 839 / 841: the rail becomes a strip and
   items stay reachable.
3. **Dark mode:** Home, a project, Timeline Gantt, MOM and Presentation editors,
   brand logos with real images (white and black logos), long tables, focus rings
   (the focus border must still show).

## 11. Clean up

Archive every `ZZ-Test …` record (suppliers, brands, SKUs, samples) from the
directories; do not request deletion unless you want it gone for good.

## After the walk

Write PASS / FAIL per section here or in the chat; each FAIL becomes a `[BUG]` in
`docs/BACKLOG.md` with the screen and what you saw, and each fully passed section
lets its `[UNVERIFIED]` entry be removed. Also re-run the two Playwright full
sessions that stalled earlier (`npx playwright test`) and the 13 phone layout
checks.
