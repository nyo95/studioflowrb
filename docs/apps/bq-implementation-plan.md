# BQ Implementation Plan

**Status:** READY FOR EXECUTION
**Versi:** R0.1
**Tanggal:** 2026-09-01
**Dibaca bersama:** `docs/apps/bq-contract.md` (wajib dibaca dulu sebelum mengerjakan fase apapun)

---

## Aturan eksekusi (anti-halusinasi)

1. **Jangan buat keputusan sendiri.** Semua keputusan ada di `bq-contract.md`. Kalau ada yang tidak jelas, berhenti dan tanya — jangan asumsikan.
2. **Urutan fase tidak boleh dibalik.** BQ-F2 tidak boleh dimulai sebelum BQ-F1 selesai dan gate-nya terpenuhi.
3. **Jangan tambah field/tabel yang tidak ada di kontrak.** Schema di sini adalah final. Kalau butuh field tambahan, tanya dulu.
4. **Kalkulasi hanya di server.** Tidak ada kalkulasi di frontend/client.
5. **Tidak ada FK lintas schema** (`bq.*` tidak boleh punya FK ke `master_data.*` atau sebaliknya). Semua referensi lintas schema menggunakan plain `String` (ID saja).
6. **Baca `src/apps/masterdata/public/` untuk data MD** — jangan baca tabel `master_data.*` langsung dari BQ app.

---

## Peta file yang akan dibuat/diubah

```
prisma/
  schema.prisma                  ← tambah bq schema (BQ-F1)

src/apps/bq/
  public/                        ← BQ public contract (kosong dulu, diisi bertahap)
  lib/
    calculation-engine.ts        ← mesin kalkulasi server-side (BQ-F3)
    snapshot.ts                  ← helper snapshot dari MD/Library (BQ-F4)
  actions/
    library.ts                   ← server actions BQ Library (BQ-F2)
    project.ts                   ← server actions BQ Project (BQ-F3)
    template.ts                  ← server actions Template (BQ-F2)
    promotion.ts                 ← server actions promotion (BQ-F5)
  components/
    LibraryTable.tsx             ← list library items (BQ-F2)
    LibraryForm.tsx              ← form tambah/edit item (BQ-F2)
    TemplateEditor.tsx           ← template editor UI (BQ-F2)
    ProjectList.tsx              ← list BQ projects (BQ-F3)
    ProjectTree.tsx              ← tree L1/L2/L3 dengan collapse/expand (BQ-F3)
    LineItemPicker.tsx           ← pilih dari MD / Library / Custom (BQ-F4)
    PromotionQueue.tsx           ← antrian promotion (BQ-F5)
  app/
    bq/
      page.tsx                   ← project list
      [projectId]/page.tsx       ← project detail
      library/page.tsx           ← BQ Library + Template Editor
      library/templates/[id]/page.tsx
      promotions/page.tsx        ← promotion queue (admin)
```

---

## BQ-F1 — Schema & Foundation

**Gate:** Migration berjalan bersih. `prisma generate` sukses. Semua model bisa di-query.

### F1-01: Tambah schema `bq` di `prisma/schema.prisma`

Buka `prisma/schema.prisma`. Di bawah section `master_data`, tambahkan schema `bq`.

**Model yang harus dibuat (urutan sesuai dependency):**

```prisma
// ─── BQ LIBRARY ───────────────────────────────────────────────

model BqLibMaterial {
  id                  String   @id @default(cuid())
  name                String
  purchase_unit       String
  base_unit           String?
  harga               Decimal  @db.Decimal(18, 4)
  currency            String   @default("IDR")
  default_koefisien   Decimal  @default(1) @db.Decimal(18, 6)
  kategori            BqKategori  // hanya boleh MATERIAL
  notes               String?
  promotion_status    BqPromotionStatus @default(DRAFT)
  masterdata_ref_id   String?  // plain ID, bukan FK
  created_by          String   // plain User ID, bukan FK
  created_at          DateTime @default(now())
  updated_at          DateTime @updatedAt

  template_recommendations BqTemplateRecommendation[]

  @@map("bq_lib_material")
  @@schema("bq")
}

model BqLibLabor {
  id                  String   @id @default(cuid())
  name                String
  purchase_unit       String
  base_unit           String?
  harga               Decimal  @db.Decimal(18, 4)
  currency            String   @default("IDR")
  default_koefisien   Decimal  @default(1) @db.Decimal(18, 6)
  kategori            BqKategori  // hanya boleh UPAH
  notes               String?
  promotion_status    BqPromotionStatus @default(DRAFT)
  masterdata_ref_id   String?
  created_by          String
  created_at          DateTime @default(now())
  updated_at          DateTime @updatedAt

  template_recommendations BqTemplateRecommendation[]

  @@map("bq_lib_labor")
  @@schema("bq")
}

model BqLibMaterialLabor {
  id                  String   @id @default(cuid())
  name                String
  purchase_unit       String
  base_unit           String?
  harga               Decimal  @db.Decimal(18, 4)
  currency            String   @default("IDR")
  default_koefisien   Decimal  @default(1) @db.Decimal(18, 6)
  kategori            BqKategori  // hanya boleh MATERIAL_UPAH
  notes               String?
  promotion_status    BqPromotionStatus @default(DRAFT)
  masterdata_ref_id   String?
  created_by          String
  created_at          DateTime @default(now())
  updated_at          DateTime @updatedAt

  template_recommendations BqTemplateRecommendation[]

  @@map("bq_lib_material_labor")
  @@schema("bq")
}

// Kategori: Biaya Umum, Transportasi & Akomodasi, Alat
// TIDAK bisa dipromosikan ke Master Data
model BqLibCustomItem {
  id                  String       @id @default(cuid())
  name                String
  purchase_unit       String
  harga               Decimal      @db.Decimal(18, 4)
  currency            String       @default("IDR")
  default_koefisien   Decimal      @default(1) @db.Decimal(18, 6)
  kategori            BqKategori
  notes               String?
  created_by          String
  created_at          DateTime     @default(now())
  updated_at          DateTime     @updatedAt

  template_recommendations BqTemplateRecommendation[]

  @@map("bq_lib_custom_item")
  @@schema("bq")
}

// ─── TEMPLATE ─────────────────────────────────────────────────

model BqTemplate {
  id          String   @id @default(cuid())
  name        String
  description String?
  created_by  String
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  sections    BqTemplateSection[]

  @@map("bq_template")
  @@schema("bq")
}

// Template section — max 2 level: Section (parent_id = null) → Subsection (parent_id → Section).
// Nested lebih dari 2 level tidak didukung oleh UI dan business logic BQ.
// Server action harus menolak creation Subsection yang parent-nya sudah merupakan Subsection.
model BqTemplateSection {
  id            String    @id @default(cuid())
  template_id   String
  template      BqTemplate @relation(fields: [template_id], references: [id], onDelete: Cascade)
  name          String
  parent_id     String?   // null = Section, non-null = Subsection (FK ke BqTemplateSection sendiri)
  parent        BqTemplateSection?  @relation("SectionChildren", fields: [parent_id], references: [id])
  children      BqTemplateSection[] @relation("SectionChildren")
  sort_order    Int       @default(0)
  created_by    String
  created_at    DateTime  @default(now())

  recommendations BqTemplateRecommendation[]

  @@map("bq_template_section")
  @@schema("bq")
}

// Pointer dari template section ke library item (live reference, bukan snapshot)
// lib_material_id, lib_labor_id, lib_material_labor_id, lib_custom_item_id:
// hanya satu yang non-null per baris
model BqTemplateRecommendation {
  id                      String    @id @default(cuid())
  template_section_id     String
  template_section        BqTemplateSection @relation(fields: [template_section_id], references: [id], onDelete: Cascade)
  sort_order              Int       @default(0)

  lib_material_id         String?
  lib_material            BqLibMaterial?        @relation(fields: [lib_material_id], references: [id])
  lib_labor_id            String?
  lib_labor               BqLibLabor?           @relation(fields: [lib_labor_id], references: [id])
  lib_material_labor_id   String?
  lib_material_labor      BqLibMaterialLabor?   @relation(fields: [lib_material_labor_id], references: [id])
  lib_custom_item_id      String?
  lib_custom_item         BqLibCustomItem?      @relation(fields: [lib_custom_item_id], references: [id])

  @@map("bq_template_recommendation")
  @@schema("bq")
}

// ─── BQ PROJECT ───────────────────────────────────────────────

model BqProject {
  id           String      @id @default(cuid())
  title        String
  client_name  String
  status       BqProjectStatus @default(DRAFT)
  external_ref String?
  notes        String?
  created_by   String
  created_at   DateTime    @default(now())
  updated_at   DateTime    @updatedAt

  sections     BqSection[]

  @@map("bq_project")
  @@schema("bq")
}

model BqSection {
  id          String    @id @default(cuid())
  project_id  String
  project     BqProject @relation(fields: [project_id], references: [id], onDelete: Cascade)
  name        String
  sort_order  Int       @default(0)
  created_at  DateTime  @default(now())

  subsections BqSubsection[]
  items       BqItem[]       // L1 items langsung di section (tanpa subsection)

  @@map("bq_section")
  @@schema("bq")
}

model BqSubsection {
  id          String    @id @default(cuid())
  section_id  String
  section     BqSection @relation(fields: [section_id], references: [id], onDelete: Cascade)
  name        String
  sort_order  Int       @default(0)
  created_at  DateTime  @default(now())

  items       BqItem[]

  @@map("bq_subsection")
  @@schema("bq")
}

// L1 Item
// section_id XOR subsection_id — satu harus non-null, yang lain null
// L1 boleh berdiri sendiri tanpa L2 maupun L3. Saat L1-only, harga_snapshot dan koefisien dipakai untuk kalkulasi.
model BqItem {
  id             String        @id @default(cuid())
  section_id     String?
  section        BqSection?    @relation(fields: [section_id], references: [id], onDelete: Cascade)
  subsection_id  String?
  subsection     BqSubsection? @relation(fields: [subsection_id], references: [id], onDelete: Cascade)
  name           String
  qty            Decimal       @db.Decimal(18, 6)
  unit           String
  harga_snapshot Decimal?      @db.Decimal(18, 4)  // dipakai hanya saat L1 tanpa child
  koefisien      Decimal       @default(1) @db.Decimal(18, 6)  // dipakai hanya saat L1 tanpa child
  markup_l1_pct  Decimal       @default(0) @db.Decimal(6, 4)
  sort_order     Int           @default(0)
  notes          String?
  created_at     DateTime      @default(now())
  updated_at     DateTime      @updatedAt

  sub_objects    BqSubObject[]
  line_items     BqLineItem[]  // L3 langsung di L1 (tanpa L2)

  @@map("bq_item")
  @@schema("bq")
}

// L2 Sub-object (opsional)
model BqSubObject {
  id            String    @id @default(cuid())
  item_id       String
  item          BqItem    @relation(fields: [item_id], references: [id], onDelete: Cascade)
  name          String
  qty_per_l1    Decimal   @db.Decimal(18, 6)
  markup_l2_pct Decimal   @default(0) @db.Decimal(6, 4)
  sort_order    Int       @default(0)
  notes         String?
  created_at    DateTime  @default(now())
  updated_at    DateTime  @updatedAt

  line_items    BqLineItem[]

  @@map("bq_sub_object")
  @@schema("bq")
}

// L3 Line Item — terminal, tempat kalkulasi terjadi
// sub_object_id XOR item_id — satu harus non-null, yang lain null
model BqLineItem {
  id                              String       @id @default(cuid())
  sub_object_id                   String?
  sub_object                      BqSubObject? @relation(fields: [sub_object_id], references: [id], onDelete: Cascade)
  item_id                         String?      // L3 langsung di L1 (tanpa L2)
  item                            BqItem?      @relation(fields: [item_id], references: [id], onDelete: Cascade)

  // Snapshot fields — semua plain value, tidak ada FK ke MD
  source_type                     BqLineItemSourceType
  source_ref_id                   String?      // plain ID asal (MD price ID atau Library item ID)
  source_imported_at              DateTime?

  title_snapshot                  String
  purchase_unit_snapshot          String
  base_unit_snapshot              String?
  purchase_to_base_factor_snapshot Decimal?    @db.Decimal(18, 6)  // display only
  harga_snapshot                  Decimal      @db.Decimal(18, 4)
  currency_snapshot               String       @default("IDR")
  kategori                        BqKategori

  // Input estimator
  qty                             Decimal      @db.Decimal(18, 6)
  koefisien                       Decimal      @default(1) @db.Decimal(18, 6)

  sort_order                      Int          @default(0)
  notes                           String?
  created_at                      DateTime     @default(now())
  updated_at                      DateTime     @updatedAt

  @@map("bq_line_item")
  @@schema("bq")
}

// ─── ENUMS ────────────────────────────────────────────────────

enum BqPromotionStatus {
  DRAFT
  REQUESTED
  APPROVED
  REJECTED

  @@schema("bq")
}

enum BqProjectStatus {
  DRAFT
  LOCKED

  @@schema("bq")
}

enum BqKategori {
  MATERIAL
  UPAH
  MATERIAL_UPAH
  BIAYA_UMUM
  TRANSPORTASI_AKOMODASI
  ALAT

  @@schema("bq")
}

enum BqLineItemSourceType {
  MASTERDATA
  BQ_LIBRARY
  CUSTOM

  @@schema("bq")
}
```

Setelah tambah schema, tambahkan `"bq"` ke array `schemas` di `datasource db`:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["platform", "master_data", "bq"]
}
```

**Catatan schema revision dari kontrak:**
- `BqLibMaterial`, `BqLibLabor`, `BqLibMaterialLabor` masing-masing mendapat `base_unit String?` dan `kategori BqKategori`.
- `BqItem` mendapat `harga_snapshot Decimal?` dan `koefisien Decimal @default(1)` untuk kasus L1-only.
- Validasi kategori per tipe ditegakkan di server action, bukan di level enum Prisma (karena satu enum dipakai semua tipe).

### F1-02: Jalankan migration

```bash
npx prisma migrate dev --name add_bq_schema
npx prisma generate
```

**Gate F1:** Kedua perintah sukses tanpa error. Cek tabel ada di DB dengan `\dt bq.*` di psql.

---

## BQ-F2 — BQ Library + Template Editor

**Prerequisite:** F1 selesai.
**Gate:** Library item bisa dibuat, diedit, dilihat. Template bisa dibuat dengan sections. Recommended items bisa ditambah ke template section.

### F2-01: Server actions untuk Library Items

Buat `src/apps/bq/actions/library.ts`:

```typescript
// Fungsi yang harus ada:
// createLibMaterial(data) → BqLibMaterial
// updateLibMaterial(id, data) → BqLibMaterial
// createLibLabor(data) → BqLibLabor
// updateLibLabor(id, data) → BqLibLabor
// createLibMaterialLabor(data) → BqLibMaterialLabor
// updateLibMaterialLabor(id, data) → BqLibMaterialLabor
// createLibCustomItem(data) → BqLibCustomItem
// updateLibCustomItem(id, data) → BqLibCustomItem
// listAllLibraryItems() → { materials, labors, materialLabors, customItems }
// getLibraryItem(type, id) → item atau null
```

Validasi yang wajib:
- `harga > 0`
- `default_koefisien > 0`
- `kategori` wajib diisi untuk semua tipe library item
- `BqLibMaterial` hanya boleh `MATERIAL`
- `BqLibLabor` hanya boleh `UPAH`
- `BqLibMaterialLabor` hanya boleh `MATERIAL_UPAH`
- `BqLibCustomItem` hanya boleh `BIAYA_UMUM`, `TRANSPORTASI_AKOMODASI`, `ALAT` — tiga nilai lainnya dilarang

### F2-02: Server actions untuk Template

Buat `src/apps/bq/actions/template.ts`:

```typescript
// Fungsi yang harus ada:
// createTemplate(data) → BqTemplate
// updateTemplate(id, data) → BqTemplate
// deleteTemplate(id) → void
// duplicateTemplate(id) → BqTemplate (buat salinan baru semua sections + recommendations)
// addSection(templateId, data) → BqTemplateSection  -- parent_id null = Section
// addSubsection(templateId, parentSectionId, data) → BqTemplateSection
// reorderSections(templateId, orderedIds) → void
// addRecommendation(templateSectionId, libItemType, libItemId) → BqTemplateRecommendation
// removeRecommendation(recommendationId) → void
// getTemplateWithSections(id) → template + nested sections + recommendations
// listTemplates() → BqTemplate[]
```

### F2-03: Halaman BQ Library

Buat `src/apps/bq/app/bq/library/page.tsx`:
- Tab: "Items" dan "Templates"
- Tab Items: tabel semua library items (semua 4 tipe), kolom: Nama, Unit, Harga, KATEGORI, Status Promosi
- Tab Templates: kartu template, tombol Buat Template, Duplikat, Edit, Hapus

### F2-04: Template Editor

Buat `src/apps/bq/app/bq/library/templates/[id]/page.tsx`:
- Kiri: tree Section/Subsection (drag-reorder)
- Kanan: panel recommended items untuk section yang dipilih
- Tombol "Tambah Section", "Tambah Subsection", "Tambah Recommended Item"
- Saat tambah recommended item: modal pilih dari library (search by name, filter by kategori)

**Gate F2:** E2E manual test — buat template "Fit Out Standard", tambah Section "Preliminaries", tambah Subsection "Floor Works" di "Interior Works", tambah recommended item ke "Preliminaries". Semua tersimpan dan tampil kembali setelah refresh.

---

## BQ-F3 — BQ Project + Engine Kalkulasi

**Prerequisite:** F2 selesai.
**Gate:** Buat project, load template, tambah L1/L2/L3 manual (CUSTOM source_type), angka kalkulasi benar sesuai formula di kontrak §6.

### F3-01: Calculation engine

Buat `src/apps/bq/lib/calculation-engine.ts`:

```typescript
import type { DecimalString } from "@platform/utilities/decimal";

// Tipe input — SEMUA menggunakan DecimalString, bukan number:
type LineItemInput = {
  qty: DecimalString           // L3 qty (per parent langsung)
  harga_snapshot: DecimalString
  koefisien: DecimalString
}

type SubObjectInput = {
  qty_per_l1: DecimalString
  markup_l2_pct: DecimalString   // persen, bukan desimal: "15" = 15%
  line_items: LineItemInput[]
}

type ItemInput = {
  qty: DecimalString             // L1 qty
  markup_l1_pct: DecimalString
  sub_objects: SubObjectInput[]
  line_items_direct: LineItemInput[]  // L3 langsung di L1 tanpa L2
  // L1-only fields (dipakai saat tidak ada child):
  harga_snapshot?: DecimalString
  koefisien?: DecimalString
}

// Output per L3:
// biaya_line = qty × harga_snapshot × koefisien
// (qty di sini adalah L3.qty, belum dikalikan L1.qty dan L2.qty_per_l1)

// Output per L2:
// subtotal_L2_raw = SUM(biaya_line semua L3 di L2 ini)
// subtotal_L2 = subtotal_L2_raw × (1 + markup_l2_pct / 100)

// Output per L1:
// Jika punya child:
//   biaya_pokok = SUM(subtotal_L2) + SUM(biaya_line L3 langsung)
//   rate = biaya_pokok × (1 + markup_l1_pct / 100)
//   total = rate × L1.qty
// Jika L1-only (tanpa child):
//   rate = harga_snapshot × koefisien × (1 + markup_l1_pct / 100)
//   total = rate × L1.qty

// Output grand total:
// grand_total = SUM(total semua L1)

// Semua output bertipe DecimalString. Tidak ada Number/parseFloat.

// Output types — semua nilai DecimalString, truncate 2 desimal di setiap intermediate:
type LineItemResult = {
  biaya_line: DecimalString  // qty × harga_snapshot × koefisien, truncate 2 desimal
}

type SubObjectResult = {
  subtotal_L2_raw: DecimalString
  subtotal_L2: DecimalString  // subtotal_L2_raw × (1 + markup_l2_pct / 100), truncate 2 desimal
  line_items: LineItemResult[]
}

type ItemResult = {
  // Jika L1 punya child:
  biaya_pokok?: DecimalString   // SUM(subtotal_L2) + SUM(biaya_line L3 langsung), truncate 2 desimal
  rate?: DecimalString          // biaya_pokok × (1 + markup_l1_pct / 100), truncate 2 desimal
  total?: DecimalString         // rate × L1.qty, truncate 2 desimal
  // Jika L1-only (tanpa child):
  rate: DecimalString           // harga_snapshot × koefisien × (1 + markup_l1_pct / 100), truncate 2 desimal
  total: DecimalString          // rate × L1.qty, truncate 2 desimal
  sub_objects?: SubObjectResult[]
  line_items_direct: LineItemResult[]
}

type ProjectResult = {
  items: ItemResult[]
  grand_total: DecimalString    // SUM(total semua L1), truncate 2 desimal
}

// Export:
export function calculateItem(item: ItemInput): ItemResult
export function calculateProject(items: ItemInput[]): ProjectResult
```

**Aturan arithmetic:**
- Tidak boleh memakai `Number()`, `parseFloat()`, atau operasi floating-point JavaScript.
- Tidak boleh mengimpor `Prisma.Decimal` ke calculation engine murni.
- Adapter action/service yang mengubah `Prisma.Decimal` menjadi `DecimalString` via `.toString()` sebelum memanggil engine.
- Penjumlahan, perkalian, pembagian persen dilakukan dengan arithmetic decimal presisi eksak.
- **Rounding policy: truncate 2 desimal** di setiap intermediate step (`biaya_line`, `subtotal_L2_raw`, `subtotal_L2`, `biaya_pokok`, `rate`) dan output final (`total`, `grand_total`).
  - Truncate = buang digit di luar 2 desimal tanpa pembulatan: `"123.456"` → `"123.45"`.
  - Output tetap canonical `DecimalString` (tanpa trailing zero): `"100.50"` → `"100.5"`.
  - Fungsi truncate harus bekerja pada `DecimalString` langsung, bukan via `Number()`.

**Foundation-first assessment:**
Sebelum F3 diimplementasikan, navigator harus menilai apakah `@platform/utilities/decimal` perlu diextend dengan arithmetic generik (add, multiply, divide-percent, round). Jika ya, capability generik tersebut diuji di shared Utilities; rumus dan rounding BQ tetap app-owned.

**Unit test wajib** — buat `src/apps/bq/lib/calculation-engine.test.ts`:

```
Test case 1: L1-only tanpa markup
  L1.qty = "1", markup_l1 = "0"
  L1.harga_snapshot = "100000", L1.koefisien = "1"
  Expected: rate="100000", total="100000"

Test case 2: L1-only dengan koefisien dan markup L1
  L1.qty = "2", markup_l1 = "15"
  L1.harga_snapshot = "50000", L1.koefisien = "0.8"
  Expected:
    rate = 50000 × 0.8 × 1.15 = "46000"
    total = 46000 × 2 = "92000"

Test case 3: L1 dengan L3 langsung (tanpa L2), tanpa markup
  L1.qty = "1", markup_l1 = "0"
  L3: qty="1", harga_snapshot="100000", koefisien="1"
  Expected: biaya_line="100000", rate="100000", total="100000"

Test case 4: L1 dengan L2, markup di L2 saja
  L1.qty = "3", markup_l1 = "0"
  L2.qty_per_l1 = "2", markup_l2 = "10"
  L3: qty="1", harga_snapshot="100000", koefisien="0.75"
  Expected:
    biaya_line = "75000"
    subtotal_L2_raw = "75000"
    subtotal_L2 = "82500"
    biaya_pokok = "82500"
    rate = "82500"
    total = "247500"

Test case 5: L1 dengan L2 dan markup compound
  L1.qty = "1", markup_l1 = "20"
  L2.qty_per_l1 = "1", markup_l2 = "10"
  L3: qty="1", harga_snapshot="100000", koefisien="1"
  Expected:
    subtotal_L2 = "110000"
    biaya_pokok = "110000"
    rate = "132000"
    total = "132000"

Test case 6: L1 dengan campuran L2 dan L3 langsung
  L1.qty = "1", markup_l1 = "0"
  L2.qty_per_l1 = "1", markup_l2 = "0"
    L3 di L2: qty="1", harga_snapshot="50000", koefisien="1" → biaya_line="50000"
  L3 langsung: qty="1", harga_snapshot="30000", koefisien="1" → biaya_line="30000"
  Expected: biaya_pokok = "80000", total = "80000"

Test case 7: Truncate intermediate — koefisien menghasilkan pecahan > 2 desimal
  L1.qty = "1", markup_l1 = "0"
  L3: qty="1", harga_snapshot="100000", koefisien="0.333333"
  Expected:
    biaya_line_raw = 33333.3 → truncate 2 desimal → "33333.3"
    rate = "33333.3"
    total = "33333.3"

Test case 8: Truncate di setiap step — markup menghasilkan pecahan panjang
  L1.qty = "1", markup_l1 = "0"
  L2.qty_per_l1 = "1", markup_l2 = "7"
  L3: qty="3", harga_snapshot="100000", koefisien="0.333333"
  Expected:
    biaya_line = 3 × 100000 × 0.333333 = 99999.9 → "99999.9"
    subtotal_L2_raw = "99999.9"
    subtotal_L2 = 99999.9 × 1.07 = 106999.893 → truncate → "106999.89"
    biaya_pokok = "106999.89"
    rate = "106999.89"
    total = "106999.89"
```

Semua expected value ditulis sebagai `DecimalString` (canonical string), bukan number. Semua test harus pass sebelum F3 dianggap selesai.

### F3-02: Server actions untuk Project

Buat `src/apps/bq/actions/project.ts`:

```typescript
// Fungsi yang harus ada:
// createProject(data, templateId?) → BqProject
//   jika templateId ada: load template, buat Section + Subsection dari template
//   jika tidak: buat project kosong
// updateProject(id, data) → BqProject
// lockProject(id) → BqProject  -- status → LOCKED, semua edit diblokir
// listProjects() → BqProject[]
// getProjectDetail(id) → full tree (project + sections + subsections + items + sub_objects + line_items)

// addSection(projectId, data) → BqSection
// addSubsection(sectionId, data) → BqSubsection
// reorderSections(projectId, orderedIds) → void

// addItem(sectionId | subsectionId, data) → BqItem  -- L1
// updateItem(id, data) → BqItem
// deleteItem(id) → void

// addSubObject(itemId, data) → BqSubObject  -- L2
// updateSubObject(id, data) → BqSubObject
// deleteSubObject(id) → void

// addLineItem(subObjectId | itemId, data) → BqLineItem  -- L3
// updateLineItem(id, data) → BqLineItem
// deleteLineItem(id) → void

// computeProjectTotals(projectId) → ProjectResult (dari calculation-engine)
```

Validasi:
- Project LOCKED tidak boleh diedit (addItem, updateItem, dll harus cek status dulu, throw error jika LOCKED)
- `qty > 0`, `koefisien > 0`, `harga_snapshot > 0`
- `section_id` XOR `subsection_id` di BqItem (tidak boleh keduanya null atau keduanya non-null)
- `sub_object_id` XOR `item_id` di BqLineItem
- L1-only: saat L1 tidak memiliki child, `harga_snapshot` wajib diisi dan `koefisien > 0`
- L1 dengan child: `harga_snapshot` diabaikan (tidak dipakai kalkulasi) tetapi
  **tidak boleh di-clear**. Amandemen R7.55: instruksi lama "otomatis di-clear
  (set null) saat child pertama ditambahkan" adalah cacat — begitu child
  terakhir dihapus, L1 menjadi tidak terhitung dan grand total project menjadi
  null. Nilai tetap disimpan dan hanya diabaikan selama L1 punya child.
- Library item kategori: `BqLibMaterial` hanya `MATERIAL`, `BqLibLabor` hanya `UPAH`, `BqLibMaterialLabor` hanya `MATERIAL_UPAH`, `BqLibCustomItem` hanya `BIAYA_UMUM`/`TRANSPORTASI_AKOMODASI`/`ALAT`

### F3-03: Halaman Project List + Project Detail

**Project List** (`src/apps/bq/app/bq/page.tsx`):
- Tabel: Judul, Klien, Status, Estimator, Total (computed), Tanggal dibuat
- Tombol: Buat Project Baru (modal: judul, klien, pilih template atau kosong)

**Project Detail** (`src/apps/bq/app/bq/[projectId]/page.tsx`):
- Header: judul, klien, status badge, tombol Lock (konfirmasi dulu)
- Grand Total besar di kanan atas
- Tree view:
  - Section (collapsible)
    - Subsection (collapsible)
      - L1 Item: nama | qty | unit | rate | total + expand chevron
        - L2 Sub-object: nama | qty_per_l1 | markup | subtotal + expand chevron
          - L3 Line Item: title_snapshot | qty | unit | koefisien | harga | biaya
          - Tombol "+ Tambah Line Item"
        - Tombol "+ Tambah Sub-object"
      - Tombol "+ Tambah Item"
    - Tombol "+ Tambah Subsection"
  - Tombol "+ Tambah Section"
- Edit inline: klik nilai qty/koefisien/harga → input muncul → blur → save → recompute
- Markup ditampilkan di L1 dan L2 row (hanya visible saat expanded), tidak di output klien

**Gate F3:** Jalankan semua unit test. Buat project manual: 1 Section, 1 L1 (qty "3"), 1 L2 (qty_per_l1 "2", markup "10"), 1 L3 CUSTOM (qty "1", harga_snapshot "100000", koefisien "0.75"). Verifikasi: total = "495000". Semua nilai verifikasi ditulis sebagai canonical decimal string.

---

## BQ-F4 — Import dari Master Data (Snapshot Flow)

**Prerequisite:** F3 selesai.
**Gate:** Pilih item dari Master Data, L3 terbentuk dengan snapshot benar. Override harga/koefisien berfungsi tanpa mengubah Master Data.

### F4-01: Baca public contract Master Data

Buka `src/apps/masterdata/public/index.ts` (atau path sesuai konvensi proyek). Cari fungsi/type yang expose:
- `MaterialPriceOption` — berisi: `id`, `skuId`, `skuName`, `purchaseUnit`, `baseUnit`, `purchaseToBaseFactor`, `amount`, `currency`
- `LaborPriceOption` — berisi: `id`, `name`, `unit`, `amount`, `currency`
- `MaterialLaborPriceOption` — berisi: `id`, `name`, `unit`, `amount`, `currency`

Fungsi search yang dibutuhkan (buat di public contract jika belum ada):
```typescript
searchMaterialPrices(query: string): Promise<MaterialPriceOption[]>
searchLaborPrices(query: string): Promise<LaborPriceOption[]>
searchMaterialLaborPrices(query: string): Promise<MaterialLaborPriceOption[]>
```

Jika fungsi belum ada di `src/apps/masterdata/public/`, tambahkan di sana. **Jangan baca tabel `master_data.*` langsung dari BQ.**

### F4-02: Snapshot helper

Buat `src/apps/bq/lib/snapshot.ts`:

```typescript
// Fungsi:
// snapshotFromMasterData(priceOption, sourceType) → BqLineItemCreateInput
//   Mapping field:
//   title_snapshot         ← skuName (material) / name (labor)
//   purchase_unit_snapshot ← purchaseUnit / unit
//   base_unit_snapshot     ← baseUnit / null
//   purchase_to_base_factor_snapshot ← purchaseToBaseFactor / null
//   harga_snapshot         ← amount
//   currency_snapshot      ← currency
//   source_type            ← MASTERDATA
//   source_ref_id          ← priceOption.id (plain string)
//   source_imported_at     ← new Date()
//   kategori               ← sesuai tipe: MATERIAL / UPAH / MATERIAL_UPAH
//   qty                    ← 1 (default, estimator set sendiri)
//   koefisien              ← 1.0 (default)

// snapshotFromLibrary(libItem, libItemType) → BqLineItemCreateInput
//   title_snapshot         ← libItem.name
//   purchase_unit_snapshot ← libItem.purchase_unit
//   base_unit_snapshot     ← libItem.base_unit / null
//   harga_snapshot         ← libItem.harga
//   currency_snapshot      ← libItem.currency
//   source_type            ← BQ_LIBRARY
//   source_ref_id          ← libItem.id
//   source_imported_at     ← new Date()
//   kategori               ← libItem.kategori (sudah tervalidasi per tipe)
//   qty                    ← 1
//   koefisien              ← libItem.default_koefisien

// snapshotCustom(data) → BqLineItemCreateInput
//   source_type            ← CUSTOM
//   source_ref_id          ← null
//   source_imported_at     ← null
//   (semua field diisi dari input estimator)
```

### F4-03: Line Item Picker component

Buat `src/apps/bq/components/LineItemPicker.tsx`:

- Modal/drawer yang muncul saat klik "+ Tambah Line Item"
- Tiga tab: **Master Data** | **BQ Library** | **Custom**
- Tab Master Data:
  - Search bar, filter tipe (Material / Labor / Material+Labor)
  - Hasil: nama, unit, harga, `purchase_to_base_factor` ditampilkan ("1 SHEET = 2,88 M²")
  - Klik pilih → snapshot → LineItem terbentuk
- Tab BQ Library:
  - Search bar, filter KATEGORI
  - Hasil: nama, unit, harga, default koefisien
  - Klik pilih → snapshot → LineItem terbentuk
- Tab Custom:
  - Form: title, purchase_unit, harga, kategori, qty, koefisien
  - Submit → LineItem terbentuk (source_type CUSTOM)

Setelah LineItem terbentuk, tampilkan di tree dengan nilai default. Estimator bisa langsung edit qty/koefisien inline.

**Gate F4:** Pilih "Plywood 18mm" dari Master Data. Cek: `title_snapshot`, `purchase_unit_snapshot`, `harga_snapshot`, `purchase_to_base_factor_snapshot` tersimpan benar. Override harga ke nilai lain → simpan → nilai baru tampil, Master Data tidak berubah.

---

## BQ-F5 — Promotion Flow (Library → Master Data)

**Prerequisite:** F4 selesai.
**Gate:** Estimator ajukan promosi. Admin/staff Master Data melihat antrian di
Master Data, approve atau reject, dan pada approval membuat entry baru di
Master Data.

### F5-01: Server actions untuk promotion (bukan REST API)

Request flow menggunakan **Server Actions** di BQ, tetapi approval flow adalah
workflow Master Data. BQ tidak boleh membuat atau mengubah record Master Data.
Koordinasi menggunakan kontrak promotion yang eksplisit, bukan REST API internal
atau pembacaan tabel lintas aplikasi. Alasannya:
- Seluruh mutation di aplikasi ini (Library, Project, Template) sudah menggunakan Server Actions.
- BQ hanya mengubah request miliknya sendiri dan meneruskan request ke kontrak promotion.
- Master Data melakukan auth, permission check, pembuatan entry, linkage, dan audit dalam boundary-nya sendiri.

```typescript
// BQ request actions dan Master Data approval actions
// Fungsi yang harus ada pada boundary aplikasi masing-masing:

// requestPromotion(type, libItemId) → void
//   Validasi: hanya MATERIAL/UPAH/MATERIAL_UPAH yang bisa REQUESTED
//   Update BqLib* item: promotion_status → REQUESTED

// listPromotionRequests() → PromotionRequest[]
//   Query dari bq.BqLibMaterial + bq.BqLibLabor + bq.BqLibMaterialLabor
//   WHERE promotion_status = REQUESTED
//   Permission required: Master Data approval permission
//   Return: { id, type, name, purchase_unit, base_unit, kategori, requested_at, notes }[]

// approvePromotion(type, libItemId) → { masterdata_ref_id: string }
//   Permission required: Master Data approval permission
//   Aksi:
//     1. Buat SKU baru di Master Data (untuk MATERIAL) atau entry PriceLabor/PriceMaterialLabor
//        PENTING: harga TIDAK diisi dari Library snapshot — harga diisi 0 atau null, admin isi sendiri
//        Field yang ikut promosi: name, purchase_unit, base_unit, kategori → menjadi SKU + price entry baru
//        Validasi dan simpan dalam transaksi Master Data
//     2. Setelah ID entry tervalidasi, update BqLib* item melalui kontrak promotion:
//        promotion_status → APPROVED, masterdata_ref_id ← ID entry baru

// rejectPromotion(type, libItemId, reason) → { ok: true }
//   Permission required: Master Data approval permission
//   Aksi: Update BqLib* item: promotion_status → REJECTED
```

**Catatan arsitektur:** Promotion approve adalah mutation Master Data. BQ tidak
boleh mengimport service internal Master Data atau menerima input ID bebas.
Implementasi harus memvalidasi tipe, kategori, eligibility, actor, dan record yang
baru dibuat sebelum status BQ menjadi `APPROVED`.

### F5-02: Tombol "Ajukan Promosi" di Library

Di `LibraryTable.tsx`, untuk item dengan `promotion_status === DRAFT`:
- Tampilkan tombol "Ajukan Promosi"
- Klik → konfirmasi dialog → `requestPromotion(type, id)` (server action)
- `requestPromotion` hanya mengubah `promotion_status → REQUESTED`
- Tombol disable (dan tampilkan status badge) untuk item REQUESTED / APPROVED / REJECTED

**Validasi di server action:**
- Hanya KATEGORI MATERIAL, UPAH, MATERIAL_UPAH yang bisa `REQUESTED`
- Item dengan KATEGORI lain → throw error "Tidak bisa dipromosikan ke Master Data"

### F5-03: Halaman Promotion Queue (Master Data admin/staff)

Pembuatan queue berada di halaman Master Data, bukan di route BQ:
- Hanya tampil di aplikasi Master Data untuk user dengan permission approval Master Data
- Tabel: Nama, Tipe, Unit, KATEGORI, Diajukan oleh, Tanggal
- Per baris: tombol "Approve" dan "Reject"
- Reject: modal minta alasan (wajib diisi)
- Approve: konfirmasi → buat entry melalui pricing workflow Master Data → validasi linkage → tampilkan link ke entry MD yang baru

**Gate F5:** E2E test: buat Library item (Material) sebagai estimator, ajukan
promosi, login sebagai admin/staff Master Data, lihat antrian di Master Data,
approve, cek entry baru benar-benar ada, lalu cek BQ Library item status →
`APPROVED` dengan `masterdata_ref_id` yang tervalidasi. Harga tidak disalin dari
snapshot Library; harga diisi melalui workflow Master Data.

---

## Checklist final sebelum handoff

- [ ] `npx prisma migrate dev` berjalan bersih
- [ ] `npx prisma generate` sukses
- [ ] Semua unit test di `calculation-engine.test.ts` pass (8 test cases, semua expected value DecimalString, termasuk truncate cases)
- [ ] Gate F1 terpenuhi
- [ ] Gate F2 terpenuhi (kategori validasi per tipe library item)
- [ ] Gate F3 terpenuhi (termasuk angka verifikasi "495000" sebagai DecimalString)
- [ ] Gate F4 terpenuhi
- [ ] Gate F5 terpenuhi (promotion via Server Actions, bukan REST API)
- [ ] Tidak ada kalkulasi di client (cek: tidak ada `×`, `/`, `+` arithmetic di file `.tsx`)
- [ ] Tidak ada FK lintas schema di schema.prisma
- [ ] `src/apps/masterdata/public/` adalah satu-satunya titik baca MD dari BQ
- [ ] Tidak ada `Number()`, `parseFloat()`, atau floating-point arithmetic di calculation engine
- [ ] Tidak ada import `Prisma.Decimal` di calculation engine murni
- [ ] Truncate 2 desimal di setiap intermediate step dan output final
- [ ] BqTemplateSection: server action menolak nested > 2 level
- [ ] L1 dengan child: harga_snapshot dipertahankan (TIDAK di-clear) dan hanya diabaikan oleh engine
