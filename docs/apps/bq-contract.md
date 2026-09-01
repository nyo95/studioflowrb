# BQ Contract — Bill of Quantity

**Status:** LOCKED — semua keputusan di bawah sudah dikonfirmasi owner
**Versi:** R0.2
**Tanggal:** 2026-09-01
**Prerequisite:** Master Data public read contract aligned di R4.13 ✓

---

## 1. Tujuan

BQ adalah tool untuk menggantikan Excel dalam pembuatan Bill of Quantity. Target pengguna: **estimator**. Prinsip utama: kalkulasi kasar, cepat, mudah dipahami — bukan sistem akuntansi presisi.

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
- L3: **terminal, wajib ada**. Tidak ada level di bawah L3. Semua kalkulasi terjadi di sini.
- L3 atomic = salah satu dari: `PriceMaterial`, `PriceLabor`, `PriceMaterialLabor`.

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

-- L1 tanpa anak (no L2, no L3 children):
biaya = L1.qty × harga_snapshot × koefisien
```

### 6.3 Aggregasi (urutan wajib)

```
L3:
  biaya_line = qty × harga_snapshot × koefisien

L2 (jika ada):
  subtotal_L2_raw = SUM(biaya_line dari semua L3 di bawah L2 ini)
  subtotal_L2     = subtotal_L2_raw × (1 + markup_l2_pct / 100)

L1:
  -- Jika punya L2:
  biaya_pokok = SUM(subtotal_L2 dari semua L2 di bawah L1 ini)

  -- Jika punya L3 langsung (tanpa L2):
  biaya_pokok = SUM(biaya_line dari L3 langsung di bawah L1)

  -- Jika campuran L2 dan L3 langsung (edge case):
  biaya_pokok = SUM(subtotal_L2) + SUM(biaya_line L3 langsung)

  rate  = biaya_pokok × (1 + markup_l1_pct / 100)
  total = rate × L1.qty

Grand Total = SUM(total semua L1)
```

### 6.4 Aturan markup

- **Markup L2** hanya berlaku untuk L3 yang ada di bawah L2 itu.
- **Markup L1** berlaku untuk SEMUA subtotal di bawah L1 — baik via L2 maupun L3 langsung.
- Markup bersifat compound (L2 markup diterapkan dulu, hasilnya baru kena L1 markup).
- Markup **tidak ditampilkan ke klien** — klien hanya melihat `rate` dan `total`.

---

## 7. Sumber L3 (tiga tipe)

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
| `harga_snapshot` | price.amount | |
| `currency_snapshot` | price.currency | |
| `kategori` | ditentukan saat import | salah satu dari 6 nilai di §4 |
| `source_ref_id` | ID entri asal | bukan FK dengan constraint |
| `source_imported_at` | timestamp saat import | |

Setelah snapshot, semua field L3 **bisa di-override per baris** tanpa mengubah Master Data.

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

### 8.2 Status promosi Library Item

```
DRAFT → REQUESTED → APPROVED (link ke MD entry)
                 → REJECTED  (dengan alasan)
```

Hanya KATEGORI Material/Upah/Material+Upah yang bisa `REQUESTED`. Yang lain tetap `DRAFT` selamanya.

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
2. Master Data mendapat notifikasi (antrian promotion request)
3. Admin Master Data review → approve atau reject
4. **Jika approve:** Admin buat entry baru di Master Data via pricing workflow biasa (manual input harga). `masterdata_ref_id` di Library Item diisi. Status → `APPROVED`.
5. **Jika reject:** Admin isi alasan. Status → `REJECTED`. Bisa diajukan ulang setelah direvisi.

**Yang TIDAK ikut dalam promosi:** harga snapshot. Harga di Master Data diisi admin secara mandiri.
**Yang ikut:** `name`, `purchase_unit`, `base_unit`, `kategori` → menjadi SKU + price entry baru.

**API baru yang dibutuhkan di Master Data:**
- `GET  /api/masterdata/promotion-requests` — list antrian
- `POST /api/masterdata/promotion-requests/:id/approve`
- `POST /api/masterdata/promotion-requests/:id/reject`

---

## 10. BQ Project

| Field | Tipe | Catatan |
|---|---|---|
| `id` | uuid | PK |
| `title` | string | Nama project BQ |
| `client_name` | string | Teks bebas |
| `status` | enum | `DRAFT` / `LOCKED` |
| `external_ref` | string? | Referensi ke project system lain (opsional) |
| `created_by` | string | FK ke User |
| `notes` | text? | Keterangan umum |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

`DRAFT` = bisa diedit. `LOCKED` = read-only final. BQ Project berdiri sendiri dulu — integrasi formal ke StudioFlow via `external_ref` menyusul.

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
| `bq.library.promote.approve` | Setujui/tolak request (admin Master Data) |

Estimator tidak punya akses ke Master Data — hanya baca via public contract.

---

## 13. UI/UX — prinsip inti

### 13.1 Collapse/expand (wajib)

| State | Yang terlihat |
|---|---|
| L1 tertutup | nama, qty, unit, rate, total — tampilan klien |
| L1 terbuka | daftar L2 (jika ada) atau L3 langsung |
| L2 terbuka | baris L3: qty, unit, koefisien, harga, biaya |

Ubah qty/koefisien di L3 → update real-time ke L2, L1, grand total (tanpa reload).

### 13.2 Entry flow estimator

```
Project baru → (opsional) Load Template → dapat scaffold Section/Subsection
→ Tambah L1 Item di Section/Subsection yang sesuai
  → (opsional) Tambah L2 Sub-object jika perlu pecah ke komponen
    → Tambah L3 Line Item:
        pilih dari: Master Data | BQ Library | Custom
        → tampilkan: "1 SHEET = 2,88 M²" sebagai konteks
        → set qty (berapa SHEET/pcs/roll)
        → set koefisien (default 1.0, estimator adjust)
        → biaya terhitung otomatis
```

### 13.3 Halaman yang dibutuhkan

1. **Project list** — daftar BQ project, status, total, estimator
2. **Project detail** — tree view Section/Subsection/L1/L2/L3, collapse/expand, grand total
3. **BQ Library** — list items, form tambah, status promosi, tab Template Editor
4. **Template Editor** — buat/edit template, atur section, tambah recommended items
5. **Promotion queue** — estimator lihat status; admin review & approve/reject

---

## 14. Build order

| Fase | Deliverable | Gate |
|---|---|---|
| **BQ-F1** | Schema `bq.*` (migration) + Prisma models | Migration run clean, models generated |
| **BQ-F2** | BQ Library CRUD (Items + BqLibCustomItem) + Template Editor | Library bisa ditambah/edit; Template bisa dibuat |
| **BQ-F3** | BQ Project + Section/Subsection + L1/L2/L3 + engine kalkulasi | Angka terhitung benar (lihat §6), ubah qty L3 update semua ke atas |
| **BQ-F4** | Import dari Master Data ke L3 (snapshot flow) | Pilih material dari MD, harga tersimpan sebagai snapshot, override bisa |
| **BQ-F5** | Promotion flow (Library → Master Data) | Estimator ajukan, Admin MD approve/reject via API baru |

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

---

## 16. Yang ditunda (deferred)

| Item | Keterangan |
|---|---|
| Waste tracking | Konsep: `waste = 1 − koefisien`. Tidak ada UI/DB untuk ini dulu. |
| Quotation PDF dengan T&C | Butuh project stable dulu. |
| Price mode (TBC, By Owner) | Lapis dokumen. |
| Rate Library | Menyusul setelah banyak L1 jadi. |
| Revisi antar versi BQ | Snapshot di §7 sudah siap sejak awal. |
| Integrasi formal ke StudioFlow project | Via `external_ref` nanti. |
| Assembly template (fixture library) | Butuh 20-30 breakdown nyata dulu. |
