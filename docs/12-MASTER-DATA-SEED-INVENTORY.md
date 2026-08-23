# 12 — Master Data MVP Seed Inventory

Status: **LOCKED — owner-approved implementation-ready seed inventory (2026-08-23)**

This inventory is subordinate to `MASTER_DATA.md`. It was produced from a read-only audit of the legacy StudioFlow workbook, curated category configuration, pricing/BQ rules and tests, and archived import staging. Legacy values are evidence, not authority.

Seed application must be idempotent by immutable canonical code/slug. Seeded rows remain normal editable/extensible controlled data after creation; ordinary entity imports must not silently invent dictionary rows.

## Units

`Unit` is one controlled dictionary. `usage` identifies where a unit may be selected; it does not introduce conversion logic.

| Code | Display label | Usage | Origin | Legacy aliases normalized into this code |
|---|---|---|---|---|
| `pcs` | pcs | quantity, purchase, rate | inherited | piece, pieces, buah |
| `sheet` | lembar | purchase, rate | inherited | sheet, lembar |
| `m` | m | dimension, usage, purchase, rate | inherited | meter, metre, m' |
| `m2` | m² | usage, purchase, rate | inherited | m2, sqm, square meter |
| `point` | titik | rate | inherited | point, titik |
| `roll` | roll | purchase, rate | inherited | gulung, roll |
| `kg` | kg | purchase, rate | inherited | kilogram |
| `ls` | lump sum | rate | inherited | lumpsum, lump sum |
| `person-day` | orang-hari | rate | inherited | org-hari, man-day |
| `mm` | mm | dimension | inherited | millimeter, millimetre |
| `cm` | cm | dimension | inherited | centimeter, centimetre |
| `in` | in | dimension | inherited | inch, inches |
| `ft` | ft | dimension | inherited | foot, feet |
| `set` | set | quantity, purchase, rate | added MVP common | set |
| `pair` | pasang | quantity, purchase, rate | added MVP common | pair, pasang |
| `box` | box | purchase, rate | added MVP common | carton, karton, box |
| `pack` | pack | purchase, rate | added MVP common | package, paket, pack |
| `bag` | sak | purchase, rate | added MVP common | sack, bag, sak |
| `bar` | batang | purchase, rate | added MVP common | bar, batang |
| `m3` | m³ | usage, purchase, rate | added MVP common | m3, cubic meter |
| `l` | liter | purchase, rate | added MVP common | litre, liter, ltr |
| `hour` | jam | rate | added MVP common | hour, hr, jam |
| `day` | hari | rate | added MVP common | day, hari |
| `lot` | lot | purchase, rate | added MVP common | lot |

Evidence includes the legacy workbook examples (`pcs`, `lembar`, `m2`, `titik`), BQ rate vocabulary (`sqm`, `m'`, `pcs`, `ls`, `org-hari`), BQ material tests/migration comments (`roll`, `kg`), and dimension dropdowns (`mm`, `cm`, `m`, `in`, `ft`). Added values are the smallest common packaging/time/volume set required for interior, construction, and retail entry without falling back to uncontrolled text.

The importer never maps the ambiguous word `unit` to `pcs`. Unknown unit aliases produce a row error or a controlled-dictionary review item.

## PRODUCT Categories — flat

The following 40 rows are inherited from the curated legacy Brand Catalog configuration:

1. HPL
2. Compact Laminate
3. Decorative PVC Sheet
4. Veneer
5. Melamine Faced Board (MFC)
6. Edgebanding
7. Plywood
8. MDF
9. Particleboard
10. Solid Wood
11. Engineered Wood Flooring
12. SPC Flooring
13. LVT / Vinyl Flooring
14. Carpet
15. Homogeneous Tile (HT)
16. Ceramic & Porcelain Tile
17. Natural Stone
18. Terrazzo
19. Solid Surface
20. Quartz Surface
21. Sintered Stone
22. Glass
23. Mirror
24. Aluminium System
25. Gypsum Board & Ceiling System
26. Acoustic Panel
27. Wallpaper
28. Paint & Coating
29. Decorative Lighting
30. Architectural Lighting
31. Switches & Sockets
32. Sanitaryware
33. Plumbing Fittings
34. Furniture Hardware
35. Door & Window Hardware
36. Adhesive & Sealant
37. Waterproofing
38. Fabric & Upholstery
39. Leather & Synthetic Leather
40. Blinds & Window Covering

Three evidence-backed gaps are added:

41. Furniture & FF&E
42. WPC & Composite Panels
43. Door & Window Systems

All 43 PRODUCT rows have `parent_id=null` and `path=null`. Broad/noisy legacy labels such as `Materials`, `Finishing`, `Flooring`, `Wall Finishing`, `Accessories`, `Decorative`, `Installation`, `Technology`, `Ecommers`, and composite multi-label cells are review evidence, not seed categories.

### PRODUCT normalization merges

The following aliases become `search_synonyms`; they do not create more Category rows:

| Canonical Category | Merged aliases/examples |
|---|---|
| Edgebanding | Edging, Edge Banding |
| Melamine Faced Board (MFC) | MFC, Melaminto, Melamine Faced Board |
| Engineered Wood Flooring | Engineering Wood Floor, Parquet |
| LVT / Vinyl Flooring | Vinyl, Vinyl Tile, Vinyl Roll, LVT |
| Ceramic & Porcelain Tile | Ceramic, Ceramics, Keramik, Porcelain, Tiles |
| Homogeneous Tile (HT) | HT, Homogeneous, Granite Tile |
| Natural Stone | Marble, Marmer, Granite, Granit, Onyx, Travertine, Batu Alam |
| Terrazzo | Terazzo, Terrazo |
| Decorative PVC Sheet | Interior Film, Finish Foil, PVC Sheet |
| Acoustic Panel | Acoustic, Noice Control, Sound Absorber |
| Paint & Coating | Cat, Duco, Texture Paint, Decorative Paint |
| Switches & Sockets | Switch, Socket, Power Outlet |
| Sanitaryware | Sanitary, Sanitary Ware, Bathroom, Toilet, Sink, Shower |
| Plumbing Fittings | Faucet, Plumbing Fitting |
| Blinds & Window Covering | Roller Blind, Venetian Blind, Curtain, Drapery, Window Covering |
| Fabric & Upholstery | Fabric, Kain, Upholstery |
| Leather & Synthetic Leather | Leather, Kulit, Synthetic Leather |
| Aluminium System | Aluminium Door & Window, Aluminum System |
| Gypsum Board & Ceiling System | Gypsum, Plafon, Ceiling, Partition |
| WPC & Composite Panels | WPC, wood-plastic composite, composite wall panel |
| Furniture & FF&E | Loose Furniture, Custom Furniture, Home Furniture, Office Furniture |

`Handle`, `Hinge`, and `Drawer Runner` require contextual review between Furniture Hardware and Door & Window Hardware. They are not auto-merged.

## WORK Categories — hierarchical only where proven

Inherited roots:

```text
Sipil & Struktur
Furniture / Custom
Finishing
MEP
Kaca & Aluminium
Batu & Keramik
Lain-lain
```

Only two initial children have direct legacy rate-table evidence:

```text
MEP
└── Lighting

Sipil & Struktur
└── Floor Works
```

Normalization decisions:

- legacy root `Sipil` merges into `Sipil & Struktur`;
- legacy `Furniture > Furniture` collapses to the root `Furniture / Custom` rather than creating a redundant child;
- legacy `Interior` remains review-only and is not guessed into Finishing;
- no empty speculative two-level hierarchy is seeded. Staff may add WORK children when an actual WorkPrice requires them.

## Party kind, operational roles, and business types

Party kind remains a closed structural enum:

```text
ORGANIZATION
INDIVIDUAL
```

Operational eligibility remains a small closed relation vocabulary:

```text
MATERIAL_SUPPLIER
WORK_VENDOR
```

Business nature is an editable controlled `BusinessType` dictionary with this seed:

| Code | Label | Origin |
|---|---|---|
| `MANUFACTURER` | Manufacturer | inherited |
| `DISTRIBUTOR` | Distributor | inherited |
| `RETAILER` | Retailer | normalized from legacy `RETAIL` / workbook `Retail Store` |
| `CONTRACTOR` | Contractor | normalized from legacy `SUBCON` business meaning |
| `SERVICE_PROVIDER` | Service Provider | normalized from legacy `SERVICE_VENDOR` business meaning |

Legacy mapping:

| Legacy classification | Operational role | Business type |
|---|---|---|
| SUPPLIER | MATERIAL_SUPPLIER | none inferred |
| RETAIL | MATERIAL_SUPPLIER | RETAILER |
| DISTRIBUTOR | MATERIAL_SUPPLIER | DISTRIBUTOR |
| SUBCON | WORK_VENDOR | CONTRACTOR |
| SERVICE_VENDOR / Vendor | WORK_VENDOR | SERVICE_PROVIDER |
| MANUFACTURER | none inferred from label alone | MANUFACTURER |

Existing SkuPrice/WorkPrice relationships are stronger migration evidence than labels: they may add the corresponding operational role. Brand ownership alone does not prove that the office buys directly from the manufacturer.

BusinessType fields are `id`, immutable `code`, `label`, optional `description`, `sort_order`, timestamps, and `deleted_at`. `PartyBusinessType` is unique on `(party_id, business_type_id)`. Business types support description/filtering only; they never grant price eligibility automatically.

## Seed verification requirements

1. Applying seeds twice produces no duplicate rows and does not overwrite staff-edited labels/descriptions unless an explicit seed-version migration says so.
2. Unit codes, BusinessType codes, Category `(kind, slug)`, and aliases are unique after normalization.
3. PRODUCT seed rows have no parent/path.
4. WORK paths are generated by the locked Category service, not hardcoded independently.
5. Every inherited/merged alias resolves to exactly one canonical target or is reported as review-only.
6. Unknown import values fail closed; ordinary imports do not auto-create Unit, Category, BusinessType, or PartyRole values.
