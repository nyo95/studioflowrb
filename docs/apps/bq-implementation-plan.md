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

src/apps/masterdata/
  app/api/promotion-requests/
    route.ts                     ← GET list (BQ-F5)
    [id]/approve/route.ts        ← POST approve (BQ-F5)
    [id]/reject/route.ts         ← POST reject (BQ-F5)
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
  harga               Decimal  @db.Decimal(18, 4)
  currency            String   @default("IDR")
  default_koefisien   Decimal  @default(1) @db.Decimal(18, 6)
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
  harga               Decimal  @db.Decimal(18, 4)
  currency            String   @default("IDR")
  default_koefisien   Decimal  @default(1) @db.Decimal(18, 6)
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

model BqTemplateSection {
  id            String    @id @default(cuid())
  template_id   String
  template      BqTemplate @relation(fields: [template_id], references: [id], onDelete: Cascade)
  name          String
  parent_id     String?   // null = Section, non-null = Subsection (FK ke BqTemplateSection sendiri)
  parent        BqTemplateSection?  @relation("SectionChildren", fields: [parent_id], references: [id])
  children      BqTemplateSection[] @relation("SectionChildren")
  sort_order    Int       @default(0)
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
model BqItem {
  id             String        @id @default(cuid())
  section_id     String?
  section        BqSection?    @relation(fields: [section_id], references: [id], onDelete: Cascade)
  subsection_id  String?
  subsection     BqSubsection? @relation(fields: [subsection_id], references: [id], onDelete: Cascade)
  name           String
  qty            Decimal       @db.Decimal(18, 6)
  unit           String
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
- `kategori` di BqLibCustomItem harus salah satu dari `BIAYA_UMUM`, `TRANSPORTASI_AKOMODASI`, `ALAT` — tiga nilai lainnya dilarang di sini

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
// Tipe input:
type LineItemInput = {
  qty: number           // L3 qty (per parent langsung)
  harga_snapshot: number
  koefisien: number
}

type SubObjectInput = {
  qty_per_l1: number
  markup_l2_pct: number   // persen, bukan desimal: 15 = 15%
  line_items: LineItemInput[]
}

type ItemInput = {
  qty: number             // L1 qty
  markup_l1_pct: number
  sub_objects: SubObjectInput[]
  line_items_direct: LineItemInput[]  // L3 langsung di L1 tanpa L2
}

// Output per L3:
// biaya_line = qty × harga_snapshot × koefisien
// (qty di sini adalah L3.qty, belum dikalikan L1.qty dan L2.qty_per_l1)

// Output per L2:
// subtotal_L2_raw = SUM(biaya_line semua L3 di L2 ini)
// subtotal_L2 = subtotal_L2_raw × (1 + markup_l2_pct / 100)

// Output per L1:
// biaya_pokok = SUM(subtotal_L2) + SUM(biaya_line L3 langsung)
// rate = biaya_pokok × (1 + markup_l1_pct / 100)
// total = rate × L1.qty

// Output grand total:
// grand_total = SUM(total semua L1)

// Export:
export function calculateItem(item: ItemInput): ItemResult
export function calculateProject(items: ItemInput[]): ProjectResult
```

**Unit test wajib** — buat `src/apps/bq/lib/calculation-engine.test.ts`:

```
Test case 1: L1 tanpa L2, tanpa markup
  L1.qty = 1, markup_l1 = 0
  L3: qty=1, harga=100_000, koef=1
  Expected: biaya_line=100000, rate=100000, total=100000

Test case 2: L1 dengan L2, markup di L2 saja
  L1.qty = 3, markup_l1 = 0
  L2.qty_per_l1 = 2, markup_l2 = 10 (10%)
  L3: qty=1, harga=100_000, koef=0.75
  Expected:
    biaya_line = 1 × 100000 × 0.75 = 75000
    subtotal_L2_raw = 75000
    subtotal_L2 = 75000 × 1.10 = 82500
    biaya_pokok = 82500
    rate = 82500 (markup_l1=0)
    total = 82500 × 3 = 247500

Test case 3: L1 dengan L2 dan markup compound
  L1.qty = 1, markup_l1 = 20 (20%)
  L2.qty_per_l1 = 1, markup_l2 = 10 (10%)
  L3: qty=1, harga=100_000, koef=1
  Expected:
    subtotal_L2 = 100000 × 1.10 = 110000
    biaya_pokok = 110000
    rate = 110000 × 1.20 = 132000
    total = 132000

Test case 4: L1 dengan L2 dan L3 langsung (campuran)
  L1.qty = 1, markup_l1 = 0
  L2.qty_per_l1 = 1, markup_l2 = 0
    L3 di L2: qty=1, harga=50000, koef=1 → biaya_line=50000
  L3 langsung: qty=1, harga=30000, koef=1 → biaya_line=30000
  Expected: biaya_pokok = 50000 + 30000 = 80000, total = 80000
```

Semua test harus pass sebelum F3 dianggap selesai.

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

**Gate F3:** Jalankan semua unit test. Buat project manual: 1 Section, 1 L1 (qty 3), 1 L2 (qty_per_l1 2, markup 10%), 1 L3 CUSTOM (qty 1, harga 100000, koef 0.75). Verifikasi: total = 3 × 2 × 1 × 100000 × 0.75 × 1.10 = 495000.

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
//   harga_snapshot         ← libItem.harga
//   currency_snapshot      ← libItem.currency
//   source_type            ← BQ_LIBRARY
//   source_ref_id          ← libItem.id
//   source_imported_at     ← new Date()
//   kategori               ← sesuai tipe Library
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
**Gate:** Estimator ajukan promosi. Admin Master Data lihat antrian, approve, entry baru terbuat di Master Data.

### F5-01: API endpoint baru di Master Data

Buat di `src/apps/masterdata/app/api/promotion-requests/`:

**`route.ts`:**
```typescript
// GET /api/masterdata/promotion-requests
// Response: list semua BQ Library items dengan status REQUESTED
// Query dari bq.BqLibMaterial + bq.BqLibLabor + bq.BqLibMaterialLabor
// Permission required: bq.library.promote.approve
// Return: { id, type, name, purchase_unit, base_unit, kategori, requested_at, notes }[]
```

**`[id]/approve/route.ts`:**
```typescript
// POST /api/masterdata/promotion-requests/:id/approve
// Body: { type: 'MATERIAL' | 'LABOR' | 'MATERIAL_LABOR', lib_item_id: string }
// Permission required: bq.library.promote.approve
// Aksi:
//   1. Buat SKU baru di Master Data (untuk MATERIAL) atau entry PriceLabor/PriceMaterialLabor
//      PENTING: harga TIDAK diisi dari Library snapshot — harga diisi 0 atau null, admin isi sendiri
//   2. Update BqLib* item: promotion_status → APPROVED, masterdata_ref_id ← ID entry baru
// Response: { masterdata_ref_id }
```

**`[id]/reject/route.ts`:**
```typescript
// POST /api/masterdata/promotion-requests/:id/reject
// Body: { lib_item_id: string, type: string, reason: string }
// Permission required: bq.library.promote.approve
// Aksi: Update BqLib* item: promotion_status → REJECTED
// Response: { ok: true }
```

### F5-02: Tombol "Ajukan Promosi" di Library

Di `LibraryTable.tsx`, untuk item dengan `promotion_status === DRAFT`:
- Tampilkan tombol "Ajukan Promosi"
- Klik → konfirmasi dialog → `requestPromotion(type, id)` (server action)
- `requestPromotion` hanya mengubah `promotion_status → REQUESTED`
- Tombol disable (dan tampilkan status badge) untuk item REQUESTED / APPROVED / REJECTED

**Validasi di server action:**
- Hanya KATEGORI MATERIAL, UPAH, MATERIAL_UPAH yang bisa `REQUESTED`
- Item dengan KATEGORI lain → throw error "Tidak bisa dipromosikan ke Master Data"

### F5-03: Halaman Promotion Queue (admin)

Buat `src/apps/bq/app/bq/promotions/page.tsx`:
- Hanya tampil untuk user dengan permission `bq.library.promote.approve`
- Tabel: Nama, Tipe, Unit, KATEGORI, Diajukan oleh, Tanggal
- Per baris: tombol "Approve" dan "Reject"
- Reject: modal minta alasan (wajib diisi)
- Approve: konfirmasi → call endpoint → tampilkan link ke entry MD yang baru

**Gate F5:** E2E test: buat Library item (Material), ajukan promosi, login sebagai admin MD, lihat di antrian, approve, cek BQ Library item status → APPROVED + masterdata_ref_id terisi. Cek bahwa entry baru di Master Data ada tapi harga belum diisi.

---

## Checklist final sebelum handoff

- [ ] `npx prisma migrate dev` berjalan bersih
- [ ] `npx prisma generate` sukses
- [ ] Semua unit test di `calculation-engine.test.ts` pass
- [ ] Gate F1 terpenuhi
- [ ] Gate F2 terpenuhi
- [ ] Gate F3 terpenuhi (termasuk angka verifikasi 495000)
- [ ] Gate F4 terpenuhi
- [ ] Gate F5 terpenuhi
- [ ] Tidak ada kalkulasi di client (cek: tidak ada `×`, `/`, `+` arithmetic di file `.tsx`)
- [ ] Tidak ada FK lintas schema di schema.prisma
- [ ] `src/apps/masterdata/public/` adalah satu-satunya titik baca MD dari BQ
