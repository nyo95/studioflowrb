# BQ Contract — Bill of Quantity

**Status:** LOCKED — semua keputusan di bawah sudah dikonfirmasi owner
**Versi:** R0.3 (R6.1 decision delta)
**Tanggal:** 2026-09-06
**Prerequisite:** Master Data public read contract aligned di R4.13 ✓

---

## 1. Tujuan

BQ adalah tool untuk menggantikan Excel dalam pembuatan Bill of Quantity. Target pengguna: **estimator**. Prinsip utama: kalkulasi kasar, cepat, mudah dipahami — bukan sistem akuntansi presisi.

**Akses aplikasi:** BQ hanya dapat diakses oleh user dengan peran kerja
estimator. Admin/staff Master Data tidak mendapat akses BQ sebagai bagian dari
workflow ini.

Dua cakupan yang di-cover:
1. **Fixture Breakdown** — pecah furnitur/fixture ke material dan jasa per komponen
2. **Full BQ** — Preliminaries, Interior Works, MEP, Furniture — satu dokumen BQ terpusat

---

## 2. Posisi dalam sistem

```
Master Data (R4.13)
  PriceMaterial / PriceMaterialLabor / PriceLabor
  + purchase_to_base_factor (R4.12)
        │
        │  public/ read contract — satu arah, hanya baca
        ▼
  BQ Library ──────────────────── Template Editor
  (Items, Templates)              (racik struktur section)
        │
        │  satu arah, snapshot saat import
        ▼
  BQ Project
  Section → Subsection → L1 → L2 → L3 (kalkulasi)
```

**Aturan tidak boleh dilanggar:**
- Master Data tidak tahu BQ ada. Tidak ada FK lintas app.
- Perubahan Master Data tidak mengubah project BQ yang sudah ada (snapshot).
- BQ membaca Master Data hanya lewat `src/apps/masterdata/public/`.
- Tidak ada kalkulasi di client — semua hitung di server.

---

## 3. Hierarki struktur

```
Section           (PRELIMINARIES, INTERIOR WORKS, FURNITURE WORKS...)
  └── Subsection  (opsional: FLOOR WORKS, BASIC INSTALLATION...)
        └── L1 Item        (Mobilization, Power Outlet, Kitchen Cabinet)
              └── L2 Sub-object   (opsional: Body Cabinet, Pintu, Laci)
                    └── L3 Line Item   ← TERMINAL, tempat kalkulasi terjadi
```

**Aturan hierarki:**
- Section: wajib ada, sumber dari Template atau dibuat manual.
- Subsection: opsional di Section manapun.
- L1: selalu ada. Ini item BQ yang dikerjakan.
- L2: **opsional**. Hanya muncul saat L1 perlu dipecah ke komponen (fixture kompleks). L1 sederhana langsung punya L3.
- L3: **terminal**. Tidak ada level di bawah L3. Semua kalkulasi terjadi di sini.

**Canonical user-facing terminology (R6.1):**
| Internal (Prisma) | User-facing |
|---|---|
| BqItem / L1 | **Work Item** |
| BqSubObject / L2 | **Component Group** (container saja — tidak punya business meaning sendiri) |
| BqLineItem / L3 | **Cost Component** |
| Section | Section |
| Subsection | Subsection |
Internal model names (BqItem, BqSubObject, BqLineItem) tidak diubah di persistence.
- L3 atomic = salah satu dari: `PriceMaterial`, `PriceLabor`, `PriceMaterialLabor`.
- **L1 boleh berdiri sendiri** tanpa L2 maupun L3. Struktur yang sah:
  - `L1 only` — L1 menyimpan `harga_snapshot` dan `koefisien` sendiri, kalkulasi langsung di level L1.
  - `L1 → L3` — L1 tanpa L2, L3 langsung di bawah L1.
  - `L1 → L2 → L3` — breakdown penuh dengan komponen.
  - Campuran L2 dan L3 langsung di bawah L1 tetap sah.
- L3 wajib terminal bila L1 memiliki breakdown, tetapi L1 boleh menjadi terminal tanpa child.

---

## 4. KATEGORI

KATEGORI adalah klasifikasi BQ-level. Bukan turunan dari source type — ini field mandiri di L3.

| KATEGORI | Boleh promosi ke Master Data? |
|---|---|
| Material | ✅ Ya |
| Upah | ✅ Ya |
| Material+Upah | ✅ Ya |
| Biaya Umum | ❌ Stop di BQ Library |
| Transportasi & Akomodasi | ❌ Stop di BQ Library |
| Alat | ❌ Stop di BQ Library |

Items dengan KATEGORI Biaya Umum, Transportasi & Akomodasi, Alat — tidak pernah naik ke Master Data.

---

## 5. Koefisien — satu-satunya pengali efisiensi

Waste, minimum order, rounding increment dihapus. Satu angka: koefisien.

**Mental model estimator:**
> "Beli 1 lembar HPL. Kira-kira 75% kepake → koefisien = 0,75. Sisanya (0,25) adalah waste yang bisa dipakai di tempat lain."

- `koefisien > 0` (boleh > 1 jika butuh lebih dari 1 purchase unit)
- Default: `1.0`
- `waste = 1 − koefisien` → konsep saja, belum ada tracking. **Deferred.**
- `purchase_to_base_factor` (1 SHEET = 2,88 M²) ditampilkan sebagai konteks untuk membantu estimator set koefisien. **Tidak masuk rumus.**

---

## 6. Mesin kalkulasi

### 6.0 Representasi numerik

Semua nilai numerik dalam calculation engine — `qty`, `harga_snapshot`, `koefisien`, `qty_per_l1`, `markup_l1_pct`, `markup_l2_pct`, seluruh subtotal, `rate`, `total`, dan `grand_total` — bertipe **`DecimalString`** (canonical base-10 string, CORE.md §8).

- Tidak boleh memakai `Number()`, `parseFloat()`, atau operasi floating-point JavaScript.
- Tidak boleh mengimpor `Prisma.Decimal` ke calculation engine murni.
- Adapter action/service yang mengubah `Prisma.Decimal` menjadi `DecimalString` via `.toString()` sebelum memanggil engine.
- Penjumlahan, perkalian, pembagian persen, dan pembulatan dilakukan dengan arithmetic decimal presisi eksak.

**Rounding policy (dikunci owner):**
- **Truncate** (bukan round) ke **2 desimal** di setiap intermediate step: `biaya_line`, `subtotal_L2_raw`, `subtotal_L2`, `biaya_pokok`, `rate`.
- **Output final** (`total` per L1, `grand_total`) juga **truncate ke 2 desimal**.
- Truncate berarti membuang digit di luar 2 desimal tanpa pembulatan: `"123.456"` → `"123.45"`, `"123.459"` → `"123.45"`.
- Tidak ada rounding half-up, round-half-even, atau strategi lain. Truncate bersifat deterministik dan reversible.

Cross-reference: `CORE.md §8` menetapkan decimal lintas layer = canonical strings; `@platform/utilities/decimal` menyediakan normalisasi dan perbandingan, bukan arithmetic umum. Sebelum F3 diimplementasikan, navigator harus menilai apakah operasi exact decimal generik minimal perlu diextend ke `@platform/utilities/decimal`. Jika ya, capability generik tersebut diuji di shared Utilities; rumus dan rounding BQ tetap app-owned.

### 6.1 Formula L3

```
biaya_line = qty_L3 × harga_snapshot × koefisien
```

### 6.2 Qty hierarchy — tiap level simpan qty sendiri

| Level | Field qty | Arti |
|---|---|---|
| L1 | `qty` | Jumlah item (misal: 3 unit cabinet) |
| L2 | `qty_per_l1` | Jumlah komponen per L1 (misal: 2 body per cabinet) |
| L3 | `qty` | Jumlah purchase unit per parent langsung (per L2 jika ada, per L1 jika tidak ada L2) |

**Engine kalkulasi:**

```
-- L3 biaya per baris:
biaya_line = qty_L3 × harga_snapshot × koefisien

-- L3 total di dalam konteks project:
biaya_total = L1.qty × (L2.qty_per_l1 ?? 1) × L3.qty × harga_snapshot × koefisien

-- Faktor qty_per_l1 diterapkan di level L2 (lihat §6.3), sebelum markup L2.
-- Faktor L1.qty diterapkan sekali di akhir, pada `total = rate × L1.qty`.

-- L1 tanpa anak (no L2, no L3 children) — L1-only:
rate    = L1.harga_snapshot × L1.koefisien × (1 + L1.markup_l1_pct / 100)
total   = rate × L1.qty
```

**L1-only fields:**
- `harga_snapshot Decimal @db.Decimal(18, 4)` — harga satuan untuk L1 tanpa breakdown. Snapshot/overrideable seperti nilai biaya BQ lain.
- `koefisien Decimal @default(1) @db.Decimal(18, 6)` — koefisien efisiensi untuk L1-only. Default `1.0`.
- Field ini hanya dipakai saat L1 tidak memiliki L2 maupun L3 child. Saat L1 punya child, kalkulasi mengikuti agregasi dari child.

### 6.3 Aggregasi (urutan wajib)

```
L3:
  biaya_line = qty × harga_snapshot × koefisien

L2 (jika ada):
  subtotal_L2_raw = qty_per_l1 × SUM(biaya_line dari semua L3 di bawah L2 ini)
  subtotal_L2     = subtotal_L2_raw × (1 + markup_l2_pct / 100)

L1:
  -- Jika punya child (L2 dan/atau L3 langsung):
  biaya_pokok = SUM(subtotal_L2 dari semua L2 di bawah L1 ini)
              + SUM(biaya_line dari L3 langsung di bawah L1)

  rate  = biaya_pokok × (1 + markup_l1_pct / 100)
  total = rate × L1.qty

  -- Jika L1-only (tanpa L2, tanpa L3 child):
  rate  = L1.harga_snapshot × L1.koefisien × (1 + L1.markup_l1_pct / 100)
  total = rate × L1.qty

Grand Total = SUM(total semua L1)
```

### 6.4 Aturan markup

- **Markup L2** hanya berlaku untuk L3 yang ada di bawah L2 itu.
- **Markup L1** berlaku untuk SEMUA subtotal di bawah L1 — baik via L2 maupun L3 langsung.
- Markup bersifat compound (L2 markup diterapkan dulu, hasilnya baru kena L1 markup).
- Markup **tidak ditampilkan ke klien** — klien hanya melihat `rate` dan `total`.

---

## 7. Sumber Cost Component (tiga tipe)

| `source_type` | Asal | Snapshot dari |
|---|---|---|
| `MASTERDATA` | Dipilih dari Master Data | `PriceMaterial`, `PriceLabor`, atau `PriceMaterialLabor` via `public/` |
| `BQ_LIBRARY` | Dipilih dari BQ Library | Entri `BqLibItem` |
| `CUSTOM` | Dibuat langsung tanpa referensi | Input estimator langsung |

Semua tipe = snapshot. `source_type` hanya untuk traceability.

**Field yang di-snapshot dari Master Data:**

| Field snapshot | Sumber | Catatan |
|---|---|---|
| `title_snapshot` | SKU.name / price.title | |
| `purchase_unit_snapshot` | purchase_unit | |
| `base_unit_snapshot` | base_unit | |
| `purchase_to_base_factor_snapshot` | Sku.purchase_to_base_factor | nullable, display only |
| `source_price_snapshot` | price.amount saat import | **Immutable baseline** — tidak pernah berubah setelah import |
| `harga_snapshot` | price.amount (working value) | Editable oleh estimator; awalnya sama dengan source |
| `currency_snapshot` | price.currency | |
| `kategori` | ditentukan saat import | salah satu dari 6 nilai di §4 |
| `source_ref_id` | ID entri asal | bukan FK dengan constraint |
| `source_imported_at` | timestamp saat import | |

Setelah snapshot, semua field L3 **bisa di-override per baris** tanpa mengubah Master Data.

**Override / Revert semantics (R6.1):**
- `source_price_snapshot` = baseline immutable saat import. Tidak pernah berubah.
- `harga_snapshot` = working value. Estimator boleh mengubah kapanpun.
- `isOverridden` = **derived**, tidak disimpan di DB: `source_price_snapshot IS NOT NULL AND harga_snapshot ≠ source_price_snapshot`.
- **Revert:** set `harga_snapshot ← source_price_snapshot`. Server-side only. Tidak mengubah Master Data.
- **Custom Cost Component** (`source_type = CUSTOM`): `source_price_snapshot = NULL`, tidak punya Revert.
- Override dan revert dicatat di audit log.

---

## 8. BQ Library

Library global khusus BQ, terpisah dari Master Data. Terdiri dari dua entitas utama:

### 8.1 Library Items

Tiga jenis item, setara tipe price di Master Data:

| Entitas | Setara Master Data | KATEGORI eligible |
|---|---|---|
| `BqLibMaterial` | Sku + PriceMaterial | Material |
| `BqLibLabor` | PriceLabor | Upah |
| `BqLibMaterialLabor` | PriceMaterialLabor | Material+Upah |

Items dengan KATEGORI Biaya Umum / Transportasi & Akomodasi / Alat disimpan sebagai `BqLibCustomItem` — tidak punya padanan di Master Data dan tidak bisa dipromosikan.

**Field minimum semua Library Item:**
`name`, `purchase_unit`, `base_unit` (nullable), `harga`, `currency`, `default_koefisien`, `kategori`, `notes`, `promotion_status`, `masterdata_ref_id` (nullable), `created_by`.

**Validasi kategori per tipe:**
- `BqLibMaterial` hanya boleh `Material`.
- `BqLibLabor` hanya boleh `Upah`.
- `BqLibMaterialLabor` hanya boleh `Material+Upah`.
- `BqLibCustomItem` hanya boleh `Biaya Umum`, `Transportasi & Akomodasi`, atau `Alat`.

Ordinary Library CRUD exposes only Type, Name, Purchase Unit, Base Unit, Price,
Currency, Notes, and (for Custom only) Category. Non-custom Category is derived
from Type. `default_koefisien` is persisted as `1` and hidden from ordinary CRUD.
Purchase and Base Units are selected from active Master Data Units through its
public read contract, then persisted as BQ-owned snapshot strings.

Enum `BqKategori` disimpan pada seluruh tipe demi bentuk data Library yang seragam, UI badge, snapshot L3, dan validasi promotion. `kategori` bukan FK ke Master Data.

### 8.2 Status promosi Library Item

```
DRAFT ─────→ REQUESTED → APPROVED (link ke MD entry)
  ↑                    ↘
  └── REJECTED ←────────  (dengan alasan)
```

Hanya KATEGORI Material/Upah/Material+Upah yang bisa `REQUESTED`. Yang lain tetap `DRAFT` selamanya.

**Transisi yang sah — tidak ada jalur lain:**

| Aksi | Status asal yang sah | Status tujuan |
|---|---|---|
| `requestPromotion` | `DRAFT`, `REJECTED` | `REQUESTED` |
| `approvePromotion` | `REQUESTED` | `APPROVED` |
| `rejectPromotion` | `REQUESTED` | `REJECTED` |

`REJECTED` bertahan sampai item direvisi dan diajukan ulang; ia tidak pernah
di-reset ke `DRAFT` oleh sistem. `APPROVED` bersifat terminal — item yang sudah
tertaut ke Master Data tidak boleh diajukan ulang karena itu akan meninggalkan
`masterdata_ref_id` yang menggantung. `approvePromotion` wajib menerima
`masterdata_ref_id` yang tidak kosong; `rejectPromotion` wajib menerima alasan.

### 8.3 Templates

Template adalah **kerangka Section + Subsection** yang bisa dipakai saat membuat BQ Project baru.

```
Template "Fit Out Standard"
├── Preliminaries              [Section]
├── Interior Works             [Section]
│   ├── Floor Works            [Subsection]
│   ├── Ceiling Works          [Subsection]
│   └── Wall Works             [Subsection]
├── Furniture Works            [Section]
└── Lighting & MEP Works       [Section]
    ├── Basic Installation     [Subsection]
    └── Switch & Socket        [Subsection]
```

Template juga bisa punya **Recommended Items** per Section/Subsection — pointer ke BQ Library items (live reference, bukan snapshot). Snapshot terjadi hanya saat item masuk ke BQ Project.

**Template Editor** ada di halaman BQ Library — estimator bisa:
- Buat, edit, duplikat template
- Atur urutan Section/Subsection
- Tambah/hapus recommended items per Section

### 8.4 Schema BQ Library (tabel)

```
bq.BqLibMaterial
bq.BqLibLabor
bq.BqLibMaterialLabor
bq.BqLibCustomItem          -- Biaya Umum, Transportasi, Alat
bq.BqTemplate
bq.BqTemplateSection        -- Section + Subsection dalam template, ordered
bq.BqTemplateRecommendation -- link template_section → library_item
```

---

## 9. Promotion flow (Library → Master Data)

**Trigger:** Estimator klik "Ajukan Promosi" pada Library Item eligible.

**Alur:**
1. BQ Library item status → `REQUESTED`
2. Master Data menampilkan antrian promotion request di halaman pengaturan
3. Admin/staff yang diberi kewenangan Master Data review → approve atau reject
4. **Jika approve:** Admin memilih canonical price yang sudah ada di Master Data
   (price dibuat terpisah melalui pricing workflow biasa) dan menghubungkannya
   ke Library item. Status BQ → `APPROVED` hanya setelah linkage tervalidasi.
   `masterdata_ref_id` di-set ke ID price canonical yang dipilih.
5. **Jika reject:** Admin/staff Master Data mengisi alasan. Status → `REJECTED`. Bisa diajukan ulang setelah direvisi.

**Yang TIDAK ikut dalam promosi:** harga snapshot. Harga di Master Data dikelola
admin secara mandiri dan dipilih saat approval, bukan dibuat otomatis oleh alur promotion.

**Operasi lintas aplikasi:**
- `requestPromotion(type, libItemId)` — BQ estimator mengubah status → REQUESTED
- `listPromotionRequests()` — Master Data admin/staff melihat antrian melalui kontrak promotion
- `approvePromotion(type, libItemId, masterdataRefId)` — Master Data menghubungkan
  canonical price yang dipilih; linkage lalu menjadikan status → APPROVED
- `rejectPromotion(type, libItemId, reason)` — Master Data mencatat alasan dan status → REJECTED

Approval adalah workflow milik Master Data, bukan tab atau permission BQ. BQ
tidak menulis tabel Master Data dan tidak boleh menerima ID bebas sebagai bukti
approval. Koordinasi lintas aplikasi memakai kontrak promotion yang eksplisit;
tidak ada FK lintas schema atau pembacaan tabel internal aplikasi lain.

---

## 10. BQ Project

| Field | Tipe | Catatan |
|---|---|---|
| `id` | uuid | PK |
| `title` | string | Nama project BQ |
| `client_name` | string | Teks bebas |
| `status` | enum | `ACTIVE` / `LOCKED` / `ARCHIVED` |
| `external_ref` | string? | Referensi ke project system lain (opsional) |
| `created_by` | string | FK ke User |
| `notes` | text? | Keterangan umum |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

`ACTIVE` = bisa diedit. `LOCKED` = read-only (bisa dibuka, tidak bisa dimutasi; bisa di-unlock). `ARCHIVED` = tidak bisa dimutasi, masih bisa dibaca, bisa di-restore ke `ACTIVE`.

**Lifecycle transitions:**
```
ACTIVE ──lock──▶ LOCKED ──unlock──▶ ACTIVE
ACTIVE ──archive──▶ ARCHIVED ──restore──▶ ACTIVE
ARCHIVED ──▶ deletion request (terpisah)
```

**Service-layer enforcement:** setiap mutation terhadap content BQ wajib melewati guard `requireEditableProject` yang reject bila status `LOCKED` atau `ARCHIVED`. Tidak cukup hanya disable tombol di UI.

Permanent deletion is a separate, BQ-owned approval workflow:

- only an ARCHIVED project may receive a deletion request;
- at most one request may be PENDING for a project;
- approval requires `bq.project-deletion.approve` (never a Role-name bypass);
- approval hard-deletes the project and closes the request in one transaction;
- request, rejection, and successful deletion produce BQ audit events;
- restoring the project before approval causes approval to fail while the
  request remains reviewable.

BQ Project berdiri sendiri dulu — integrasi formal ke StudioFlow via `external_ref` menyusul.

---

## 11. Schema database lengkap

Schema `bq` terpisah dari `platform` dan `master_data`.

```
bq.BqProject
bq.BqSection          -- Section di dalam project (from template atau manual)
bq.BqSubsection       -- Subsection opsional dalam section
bq.BqItem             -- L1, FK → BqSection atau BqSubsection
bq.BqSubObject        -- L2, FK → BqItem (opsional)
bq.BqLineItem         -- L3, FK → BqSubObject atau BqItem langsung

bq.BqLibMaterial
bq.BqLibLabor
bq.BqLibMaterialLabor
bq.BqLibCustomItem
bq.BqTemplate
bq.BqTemplateSection
bq.BqTemplateRecommendation
```

**Precision:**
- `qty`, `koefisien`, `qty_per_l1` → `NUMERIC(18,6)`
- `harga_snapshot`, `harga` → `NUMERIC(18,4)`
- `markup_pct` → `NUMERIC(6,4)` (misal: 15.0000 = 15%)

**L1-only fields:**
- `BqItem` memiliki `harga_snapshot NUMERIC(18,4)` dan `koefisien NUMERIC(18,6) DEFAULT 1`. Dipakai hanya saat L1 tidak memiliki child.

**Library Item fields:**
- Seluruh library item (`BqLibMaterial`, `BqLibLabor`, `BqLibMaterialLabor`, `BqLibCustomItem`) memiliki `base_unit` (nullable) dan `kategori` (enum `BqKategori`).

Semua field snapshot di `BqLineItem` disimpan sebagai plain value — **bukan FK**. Perubahan Master Data tidak menyentuh baris yang sudah ada.

---

## 12. RBAC

| Permission | Aksi |
|---|---|
| `bq.access` | Masuk ke modul BQ |
| `bq.project.read` | Lihat project |
| `bq.project.manage` | Buat, edit, lock project |
| `bq.library.read` | Lihat BQ Library + Templates |
| `bq.library.manage` | Tambah/edit Library items + Template Editor |
| `bq.library.promote` | Ajukan promotion request ke Master Data |
| `bq.library.approve` | Tidak digunakan; approval promotion dimiliki Master Data |

Estimator tidak punya akses ke halaman Master Data — hanya membaca pilihan
komersial melalui kontrak public read. Admin/staff Master Data tidak punya akses
ke BQ sebagai bagian dari workflow ini.

---

## 13. UI/UX — prinsip inti

### 13.1 Collapse/expand (wajib)

| State | Yang terlihat |
|---|---|
| Work Item tertutup | nama, qty, unit, rate, total — tampilan klien |
| Work Item terbuka | daftar Component Group (jika ada) atau Cost Component langsung |
| Component Group terbuka | Cost Component: qty, unit, koefisien, harga, biaya |

Ubah qty/koefisien di L3 → update real-time ke L2, L1, grand total (tanpa reload).

### 13.2 Entry flow estimator

```
Project baru → (opsional) Load Template → dapat scaffold Section/Subsection
→ Tambah Work Item di Section/Subsection yang sesuai
  → (opsional) Tambah Component Group jika perlu pecah ke komponen
    → Tambah Cost Component:
        pilih dari: Master Data | BQ Library | Custom
        → tampilkan: "1 SHEET = 2,88 M²" sebagai konteks
        → set qty (berapa SHEET/pcs/roll)
        → set koefisien (default 1.0, estimator adjust)
        → biaya terhitung otomatis
```

**Editing vs penyisipan (dikunci owner 2026-09-03).** Semua *pengubahan* nilai —
nama, unit, harga, qty, koefisien, markup, di semua level — dilakukan inline di
tabel, bukan lewat dialog: Enter commit, Escape batal, commit yang ditolak
mengembalikan nilai sebelumnya. Ini yang mengaktifkan `InlineEdit` di UI Engine.

*Penyisipan* Cost Component tetap punya afordansnya sendiri, karena memilih sumber bukan
mengubah nilai: "Baris custom" langsung membuat baris kosong yang siap diketik,
sedangkan "Impor" membuka picker pencarian Master Data dan BQ Library. Picker itu
tidak melanggar aturan inline — ia memilih dari mana sebuah baris berasal, bukan
mengedit isinya. Setelah tersisip, Cost Component impor sama bisa di-edit inline seperti
yang lain (K-05).

### 13.3 Halaman yang dibutuhkan

1. **Project list** — daftar BQ project, status, total, estimator
2. **Project detail** — tree view Section/Subsection/L1/L2/L3, collapse/expand, grand total
3. **BQ Library** — list items, form tambah, status promosi, tab Template Editor
4. **Template Editor** — buat/edit template, atur section, tambah recommended items
5. **Promotion status** — estimator melihat status request pada BQ Library
6. **Master Data promotion queue** — admin/staff Master Data review, approve/reject, dan menghubungkan canonical price yang sudah ada

---

## 14. Build order

| Fase | Deliverable | Gate | Status |
|---|---|---|---|
| **BQ-F1** | Schema `bq.*` (migration) + Prisma models | Migration run clean, models generated | selesai |
| **BQ-F2** | BQ Library CRUD (Items + BqLibCustomItem) + Template Editor | Library bisa ditambah/edit; Template bisa dibuat | selesai R4.56 |
| **BQ-F3** | BQ Project + Section/Subsection + L1/L2/L3 + engine kalkulasi | Angka terhitung benar (lihat §6), ubah qty L3 update semua ke atas | selesai R4.56 |
| **BQ-F4** | Import dari Master Data ke L3 (snapshot flow) | Pilih material dari MD, harga tersimpan sebagai snapshot, override bisa | selesai R4.56 |
| **BQ-F5** | Promotion flow (Library → Master Data) | Estimator ajukan, Admin/staff MD approve/reject di Master Data | selesai; reconciled R8.80 |

F1-F5 punya bukti kode dan integration coverage per R8.80. Browser acceptance
khusus BQ tetap dicatat sebagai `[UNVERIFIED]` di `docs/BACKLOG.md` sampai ada walkthrough user-facing
yang eksplisit direkam.

---

## 15. Keputusan terkunci

| # | Keputusan |
|---|---|
| K-01 | Koefisien = satu-satunya pengali efisiensi. Waste/min-order/rounding dihapus. |
| K-02 | qty L3 dalam purchase unit (SHEET/roll/pcs). Estimator tidak berpikir dalam M². |
| K-03 | `purchase_to_base_factor` di-snapshot untuk display saja — tidak masuk rumus. |
| K-04 | Markup ada di L1 dan L2. L2 markup hanya untuk L3-nya. L1 markup untuk semua subtotal di bawahnya. Compound. |
| K-05 | Semua field L3 snapshot + overrideable per baris per project. |
| K-06 | BQ Library global, bukan per-project. |
| K-07 | BqProject berdiri sendiri, `external_ref` opsional untuk integrasi nanti. |
| K-08 | Koefisien boleh > 1. Default 1.0. |
| K-09 | Tiap level simpan qty sendiri. Engine mengalikan: L1.qty × (L2.qty_per_l1 ?? 1) × L3.qty × harga × koef. |
| K-10 | Promotion membawa struktur saja (name, unit, kategori) — bukan harga. Harga diisi admin di MD. |
| K-11 | KATEGORI Biaya Umum / Transportasi & Akomodasi / Alat tidak bisa dipromosikan ke MD. |
| K-12 | Template = scaffold Section + Subsection + optional recommended items. Load saat project baru dibuat. |
| K-13 | Masterdata tidak berubah (tidak ada API write dari BQ ke MD kecuali lewat promotion approval). |
| K-14 | L1 boleh berdiri sendiri tanpa L2 maupun L3. L1 menyimpan `harga_snapshot` dan `koefisien` untuk kasus L1-only. |
| K-15 | Semua Library Item wajib mempunyai `kategori` (enum `BqKategori`) dan `base_unit` (nullable). Validasi kategori per tipe: Material/Upah/Material+Upah sesuai jenis library; CustomItem hanya Biaya Umum/Transportasi/Alat. |
| K-16 | Calculation engine menggunakan `DecimalString` (canonical string), bukan JavaScript `number`. Tidak ada floating-point arithmetic. Rounding policy adalah keputusan owner yang harus dikunci sebelum F3. |
| K-17 | Project lifecycle: `ACTIVE / LOCKED / ARCHIVED`. `LOCKED` = read-only (bisa di-unlock). `ARCHIVED` = read-only (bisa di-restore). Service layer enforce — bukan UI disable saja. |
| K-18 | `source_price_snapshot` = immutable baseline harga saat import. `harga_snapshot` = working value. `isOverridden` derived (tidak disimpan). Custom tidak punya Revert. |
| K-19 | BQ Library type→kategori deterministic: Material→MATERIAL, Labor→UPAH, MaterialLabor→MATERIAL_UPAH. Custom: BIAYA_UMUM / TRANSPORTASI_AKOMODASI / ALAT. |
| K-20 | Unit untuk Work Item dibaca dari Master Data public read contract. Snapshot tetap string untuk historical stability. |
| K-21 | Source picker tabs: [Semua] [Material] [Labor] [Material+Labor] [BQ Library]. Custom picker wajib tanya Type (tidak default Material). |
| K-22 | Template recommendations ada di Section DAN Subsection. Live pointer di Template, snapshot saat insert ke Project. |
| K-23 | Component Group (L2) = container saja. Tidak punya business meaning mandiri. |

---


> **Assembly Templates diaktifkan di R4.59/R4.60.** Lihat §15 dan kode `BqAssemblyTemplate` / `BqAssemblyLine`.
## 16. Yang ditunda (deferred)

| Item | Keterangan |
|---|---|
| Waste tracking | Konsep: `waste = 1 − koefisien`. Tidak ada UI/DB untuk ini dulu. |
| Quotation PDF dengan T&C | Butuh project stable dulu. |
| Price mode (TBC, By Owner) | Lapis dokumen. |
| Rate Library | Menyusul setelah banyak L1 jadi. |
| Revisi antar versi BQ | Snapshot di §7 sudah siap sejak awal. |
| Integrasi formal ke StudioFlow project | Via `external_ref` nanti. |

## 17. Remaining implementation decision

Tidak ada owner-policy blocker yang tersisa. Satu keputusan penempatan capability
teknis masih harus diselesaikan sebelum arithmetic baru ditambahkan.

### Catatan pra-implementasi

| Item | Status |
|---|---|
| Rounding policy | **LOCKED** — truncate 2 desimal di intermediate dan output final |
| Exact decimal capability placement | **CLOSED** — shared Utilities sudah menyediakan arithmetic decimal generik minimal; BQ tetap memiliki parser kalkulator, formula, dan truncation policy sendiri. |
