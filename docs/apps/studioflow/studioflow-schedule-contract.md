# Library and Schedule Contract — StudioFlow

Status: **OWNER-APPROVED LOGIC CONTRACT — Library discovery is partially
implemented through R7.40; Product Catalogue reuse pool is implemented in
R7.53; Product Schedule/FFNI remains unactivated and is tracked as KB-003**

Authority: owner decisions of 2026-09-08 — the Library reads the Master Data
**brand catalogue** only, and FF&E is composed from **snapshots exactly as legacy
does**. Corrected against the legacy schema after an earlier draft of this
contract invented a Master Data SKU dependency that does not exist and is not
wanted.

Evidence read directly in the legacy `prisma/schema.prisma`:
`ProjectScheduleEntry`, `ProjectScheduleOption`, `ScheduleTemplate`,
`ScheduleTemplateItem`, `ProjectProductRequest`, `PrefixDictionary`.

## 1. The decision legacy already made — and got right

Legacy carries this note on `ProjectScheduleOption`:

> *"Master Data terputus dari StudioFlow (M5, 2026-08-10) — FK ke
> `master_data.Sku`/`Brand` dilepas. `data_snapshot` sudah membekukan isi produk
> yang dipilih, jadi kolom ini tetap boleh menunjuk baris yang sudah tidak ada."*

The same note appears on `ProjectProductRequest`. Legacy severed the foreign
keys **five months before this rebuild started** and made the snapshot the
identity. Every Master Data reference became a plain nullable column that is
allowed to dangle.

This is **KEEP**, not something the rebuild invents. It already satisfies the
platform dependency law ([`studioflow.md`](studioflow.md) §4), and it is the
correct answer for a specification record: what matters is what the client was
shown, not what the catalogue says today.

**A schedule option is a specification the studio wrote down. It is not a
pointer into Master Data.** No SKU-level read from Master Data is required,
requested, or wanted.

## 2. Business purpose and users

A Product Schedule answers *"what actually goes in this project"* — which
specification sits in which position, in what quantity, and what alternatives the
client may still choose between. It is the FF&E specification.

| User | Need |
|---|---|
| Designer | Specify products per position without retyping the studio's standards |
| Client | Choose among presented alternatives; see what was selected |
| Owner | See what has been committed before it becomes a purchase |

BQ answers cost; the schedule answers choice. They are not linked.

## 3. Brands and Product Catalogue — separate StudioFlow concerns

### 3.1 Brands discovery is the only Master Data read

The StudioFlow Brands surface reads the Master Data **brand catalogue** through the public port —
`listBrandLibraryReads({search, categoryId, hashtag})` and
`getBrandLibraryRead(idOrSlug)`, which exist today at rebuild commit `db79fe6`.
That gives brand identity, categories, hashtags and links.

That is the **entire** Master Data dependency. Nothing else is read, and the
pricing methods on the port (`listMaterialPriceOptions`, `getSkuPricingOptions`,
`listWorkPricesRead`) are BQ's and are never called from StudioFlow — mixing them
in would turn a specification screen into a costing screen.

### 3.2 Product Catalogue is StudioFlow-owned

Product Catalogue is an independent StudioFlow reuse pool shared across
StudioFlow projects. It is not Master Data, is not project-owned, and never
reads Master Data SKU or pricing. A catalogue product may use a brand selected
from the Brands surface, but persists only the opaque brand id and frozen brand
name; it remains usable if that Master Data brand later changes or disappears.

Projects never own or live-link the reusable catalogue row. Selecting a product
copies its current specification into the project option as a historical
snapshot. Later catalogue edits do not rewrite any project.

### 3.3 The specification itself is written, not picked from SKU

An FF&E line is a written specification: **brand, product name, colour,
finishing**, plus quantity, unit and location. Legacy encodes exactly this in
`ProjectScheduleOption` as `spec_brand_id`, `spec_product_name`, `spec_color`,
`spec_finishing`.

Only the brand comes from the catalogue, and it comes as a **dangling id plus a
frozen name**. The rest is typed by the designer, because interior specification
is finer-grained than any SKU list: the same tile appears in six colours and
three finishes, and the studio specifies the combination.

### 3.4 The reuse pool

Legacy keeps `spec_search_key` — a normalised concatenation of brand, product,
colour and finishing — indexed so that specifications can be found across
projects without scanning JSON. In the rebuild, this search belongs to the
StudioFlow-owned Product Catalogue rather than treating project history as the
catalogue itself.

This is the reusable Product Catalogue: **the studio's own accumulated
specifications**, not a vendor or Master Data SKU catalogue. It is **KEEP**,
and it is what makes the second project faster than the first.

### 3.5 Product requests

`ProjectProductRequest` records a designer asking for something not yet
specified — with `brand_id` + `brand_name_snapshot`, `sku_id` +
`sku_name_snapshot`, or a free `custom_product_name` and reference URL.

Legacy routes vendor follow-up through it and could promote a returned price to
Master Data. That cross-app path is outside the rebuild boundary and must not be
reintroduced: Product Catalogue remains inside StudioFlow and has no pricing
write or SKU dependency.

The request flow is **DEFER** for the first schedule release: it adds a second
lifecycle before the core one is proven.

## 4. Schedule structure

### 4.1 Shape

```
Project
└── Entry     a position: category + location, e.g. "FL-01 · Living Room floor"
    └── Option 1..n    ← competing specifications; one is final
```

`ProjectScheduleEntry` already carries `schedule_category`,
`schedule_location`, `schedule_qty`, `schedule_unit` and `section`
(material / furniture). That grouping is **KEEP**.

### 4.2 Numbering — the one thing to purge

Legacy identifies an entry by `schedule_prefix` + `schedule_increment`, with
`@@unique([project_id, section, schedule_prefix, schedule_increment])`, fed by a
`PrefixDictionary`. Because a **user-visible code is the uniqueness mechanism**,
inserting or reordering forces negative temporary values and a two-step
renumbering pass.

**PURGE**, using the fix already applied to folder ordering (project contract
§8.2) and to round numbering (§5.3):

- identity is the internal `id`;
- `sort_order` is freely editable and carries no uniqueness;
- the visible code (`FL-01`) is **derived at read time** from the category prefix
  and position, and is never stored, never unique, never referenced.

The prefix dictionary itself is KEEP — it maps a category to its display prefix.
What is purged is using the resulting string as a key.

### 4.3 Snapshot fields, not a JSON blob

Legacy stores `data_snapshot` as `Json`, then mirrors four fields into columns
for search — and its own comment admits the risk:

> *"correctness depends on the write path keeping these two in sync."*

That is two copies of one truth, which is the exact fault this rebuild exists to
remove. **FIX:** the specification fields are explicit columns and are the only
copy.

| Field | Rule |
|---|---|
| `brand_md_id` | Opaque Master Data brand id. **Never a foreign key**, may dangle |
| `brand_name` | Frozen at selection. This is the identity, not `brand_md_id` |
| `product_name` | Typed |
| `colour` | Typed |
| `finishing` | Typed |
| `dimension_text` | Typed display text |
| `unit` | StudioFlow-owned typed value; never read from Master Data |
| `search_key` | Normalised `brand + product + colour + finishing`, maintained by the service in the same transaction (§3.3) |

`search_key` remains derived, but from columns rather than from JSON, so the sync
risk legacy flagged disappears: there is one source and one derivation.

Free-form extras that do not fit these fields go in a `notes` string. If a
seventh specification field proves necessary, it becomes a column — a JSON
escape hatch is how the duplicate-truth problem returns.

### 4.4 Entry lifecycle

Legacy has `ProjectScheduleOption.status` (`ScheduleOptionStatus`),
`is_final`, and `ProjectScheduleEntry.version_locked` / `active_index` — three
overlapping mechanisms for one idea. **MERGE** into one:

| Entry state | Meaning |
|---|---|
| `OPEN` | Options are being gathered |
| `SELECTED` | The studio has chosen one option to present |
| `LOCKED` | The client confirmed it; the option's snapshot is frozen |

Locking and unlocking require `schedule.confirm`; unlocking requires a reason and
is audited. Entries lock one at a time, because clients confirm choices one at a
time.

`active_index` is **PURGE** — a positional pointer into a list is another
identity-by-position fault.

### 4.5 Scope

A schedule belongs to the **project**, as it does in legacy. Selection begins
during Design 3D and continues through CD; tying an entry to a phase would force
copies as work progresses. An optional `phase_scope` tag may filter, and never
gates.

## 5. Templates

### 5.1 Legacy already built this — my earlier reading was wrong

Legacy has **two** template models, and only one of them is the failure recorded
in roadmap A6:

| Model | What it does | Disposition |
|---|---|---|
| `ScheduleTemplate` (`is_default_entry`) | Materialises an **empty** "reserve" entry per category | **PURGE** — this is A6's complaint: it saves no decisions |
| `ScheduleTemplateItem` (`data_snapshot`) | *"Kartu yang sudah terisi spesifikasinya, bukan sekadar kategori kosong. Snapshot-nya beku dan DISALIN saat apply (tidak ada propagasi)."* | **KEEP** — this is exactly what the owner asked for |

An earlier draft of this contract claimed legacy templates only seeded empty
rows. That was true of `ScheduleTemplate` and false of `ScheduleTemplateItem`.
The owner's decision is therefore **KEEP of a legacy model**, not a new feature.

### 5.2 Rules

A template item is a fully specified card: category, section, `sort_order`, and
the same specification fields as an option (§4.3). Applying a template **copies**
those values into the project. There is no propagation: editing a template never
touches a running project, exactly as legacy states.

Legacy `ScheduleTemplateItem.sku_id` is **PURGE**. Rebuild template items copy
from the StudioFlow Product Catalogue or accept a manual StudioFlow
specification; neither path reads or stores a Master Data SKU.

A whole-project standard and a single-room package need no different machinery: a
template whose items share one location label *is* a room package.

### 5.3 Update template from a project

**Update template from this entry** copies a current selection back into a named
template. Without it, templates rot into whatever the studio liked the year they
were created — the second, slower way a template feature dies. Requires
`schedule.manage`, is audited, and touches no project.

## 6. Access

| Action | Permission |
|---|---|
| Read project schedule and StudioFlow Product Catalogue | `studioflow.project.read` (reuse) |
| Create / edit entries, options, templates | `studioflow.schedule.manage` |
| Lock and unlock an entry | `studioflow.schedule.confirm` |

Both new permissions are **deferred** and are not registered with the first
release ([`studioflow.md`](studioflow.md) §3). Reading the Master Data brand
catalogue requires no Master Data permission: the public port is the boundary.

## 7. Dependencies

| Dependency | Extent |
|---|---|
| Master Data | **Brands reads only**, through the existing public port. Product Catalogue and Schedule never read SKU, unit, or pricing and never write Master Data. No cross-app foreign key |
| BQ | None |
| Core / UI Engine | Consumed as-is. A schedule is a table; it needs no new shared component |
| Platform storage | Option images follow project contract §8. Small, `STORED`, not a blocker |

## 8. Legacy classification

| Legacy behavior | Disposition | Destination |
|---|---|---|
| Master Data FKs severed; dangling id plus snapshot | **KEEP** | §1, §4.3 — already correct |
| Entry + option structure, category, location, qty, unit, section | **KEEP** | §4.1 |
| `ScheduleTemplateItem` with filled specification, copied at apply | **KEEP** | §5 |
| `spec_search_key` reuse across projects | **KEEP** | StudioFlow-owned Product Catalogue (§3.4) |
| `PrefixDictionary` mapping category to display prefix | **KEEP** | §4.2 |
| `data_snapshot` JSON mirrored into spec columns | **FIX** | Explicit columns only; one copy (§4.3) |
| `schedule_prefix` + `schedule_increment` as the unique key; negative temporaries; two-step renumbering | **PURGE** | Internal id plus `sort_order`; code derived at read (§4.2) |
| `status` + `is_final` + `version_locked` + `active_index` | **MERGE** | One entry lifecycle (§4.4) |
| `ScheduleTemplate.is_default_entry` empty reserve rows | **PURGE** | A6's recorded failure (§5.1) |
| `ProjectProductRequest` vendor follow-up and price promotion | **PURGE from current contract** | Cross-app price promotion contradicts the locked boundary (§3.5) |
| SketchUp materials bound to schedule entries, `reserved_codes`, merge queue | **DEFER** | [`studioflow.md`](studioflow.md) §6 |
| `RenderAnnotation` on schedule entries | **DEFER** | Not contracted |

## 9. Risks and unproven assumptions

| # | Risk or assumption | Exposure | Trigger to revisit |
|---|---|---|---|
| S1 | Six specification columns are assumed sufficient | A seventh attribute arrives and the temptation is a JSON escape hatch | Add a column. The JSON blob is how legacy acquired the sync risk it documented against itself |
| S2 | Locations are free text | "Living Room" and "Living room" become two groups | Normalise case for grouping. A controlled room dictionary is a second maintenance burden |
| S3 | The reuse pool is assumed to be used | If nobody reuses, every project is typed from scratch and the Library is decoration | Measure how many options are created from reuse versus typed fresh |
| S4 | Templates are assumed to be refreshed | §5.3 exists for this; unused, templates specify last year's products | Measure updates to templates over a year |
| S5 | Clients are assumed to choose among options | If the studio always presents one, multiple options are ceremony | Measure how many entries ever hold more than one option |

## 10. Acceptance scenarios

| Scenario | Required observable result |
|---|---|
| Master Data brand is renamed after an entry is locked | The locked entry still shows the frozen `brand_name`; nothing changes and nothing errors |
| Master Data brand row is deleted | `brand_md_id` dangles; the entry displays normally from its snapshot |
| Apply a template | Entries appear with specifications already filled; no propagation link back to the template |
| Edit a template afterwards | No running project changes |
| Insert a position in the middle | Only `sort_order` changes. No renumbering pass, no negative temporaries, no unique-key collision |
| Reuse a catalogue specification | Found in the StudioFlow-wide Product Catalogue and copied into the project as an independent snapshot |
| Specification with no catalogued brand | Typed freely with `brand_md_id` null; specified and locked normally |
| Any Product Catalogue or schedule screen | No price, supplier, Master Data SKU, unit read, or cross-app write appears anywhere |
| Lock one entry, neighbours open | Permitted; locking is per entry |
| Unlock | Reason required and audited; previous snapshot retained |

## 11. Remaining owner decisions

1. **Do clients see the schedule directly, or only a document produced from it?**
   Interacts with the deferred client-facing links in
   [`studioflow.md`](studioflow.md) §7.
2. **Is the schedule exported** — Excel, or a client-facing PDF — and if so, is
   that export a deliverable belonging to a round (project contract §8.3)?
3. Product requests and Master Data price promotion are excluded from this
   contract. Reintroducing either requires a new explicit owner decision.

None blocks the model above.
