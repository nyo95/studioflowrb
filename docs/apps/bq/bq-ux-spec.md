# BQ UX/UI Specification

**Status:** LOCKED
**Versi:** R0.1
**Tanggal:** 2026-09-01
**Dibaca bersama:** `bq-contract.md`, `bq-implementation-plan.md`

---

## 1. Prinsip desain

### 1.1 Filosofi utama

> "Ledger pintar, bukan Excel."

BQ harus terasa seperti dokumen ledger yang bersih — baris, angka, total — tapi dengan hierarki yang jelas dan tanpa gridlines berlebihan. Bukan form, bukan tabel database biasa.

**Yang diambil dari Excel:**
- Inline editing: klik angka → langsung edit
- Tab antar field
- Total selalu terlihat
- Logika baris-kolom yang familiar

**Yang dibuang dari Excel:**
- Gridlines di setiap sel
- Tampilan flat tanpa hierarki visual
- Warna dan formatting manual
- Kolom yang harus di-resize sendiri

### 1.2 Hierarki visual

Hierarki dibaca dari **indentasi + berat teks + warna background**, bukan dari garis:

```
Section        ── full-width, ALL CAPS, berat besar, separator atas-bawah
  Subsection   ── indent kecil, medium weight, border-left subtle
    L1 Item    ── indent, regular weight, expand chevron, hover: bg-muted
      L2        ── indent lebih, font lebih kecil, border-left accent
        L3      ── indent terdalam, tabular, inline-editable
```

---

## 2. Shell consumption (wajib dipakai)

### 2.1 Import dari `@/platform/ui_engine`

```typescript
// Layout
import { AppShell, PageShell, PageHeader } from "@/platform/ui_engine"
import { NavItem } from "@/platform/ui_engine"

// Primitives
import { Button, IconButton, Spinner } from "@/platform/ui_engine"
import { Input, Label, Select } from "@/platform/ui_engine"
import { Heading, Text } from "@/platform/ui_engine"

// Components
import { DataTable, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/platform/ui_engine"

// Patterns
import { RowActionMenu, FilterBar } from "@/platform/ui_engine"

// Overlays
import { Dialog, Drawer, ConfirmDialog } from "@/platform/ui_engine"
```

### 2.2 Authenticated Shell

BQ wajib dibungkus dalam `AuthenticatedShell` dari `@/platform/authenticated-shell`:

```typescript
// src/apps/bq/layout.tsx (root layout BQ)
import { AuthenticatedShell } from "@/platform/authenticated-shell"

// domainNavigation slot — navigasi spesifik BQ
function BqNavigation() {
  return (
    <>
      <NavItem href="/bq" icon={<FileText size={17} />} active={...}>Projects</NavItem>
      <NavItem href="/bq/library" icon={<Library size={17} />} active={...}>BQ Library</NavItem>
      {/* approval queue belongs to Master Data, not the estimator BQ shell */}
    </>
  )
}
```

### 2.3 Design tokens — pakai dari CSS variables, jangan hardcode warna

```css
/* Semua warna dari token yang sudah ada: */
var(--ui-canvas)           /* page background */
var(--ui-surface)          /* card/row background */
var(--ui-surface-muted)    /* header row, expanded state */
var(--ui-border-subtle)    /* separator internal */
var(--ui-border-default)   /* border kartu */
var(--ui-text-primary)     /* teks utama */
var(--ui-text-secondary)   /* label, unit, meta */
var(--ui-text-tertiary)    /* nomor, placeholder */
var(--ui-action-primary)   /* tombol primary */
var(--ui-success-fg/bg)    /* APPROVED badge */
var(--ui-warning-fg/bg)    /* REQUESTED badge, override harga */
var(--ui-danger-fg/bg)     /* REJECTED badge, delete action */
```

---

## 3. Halaman: Project Detail (layar utama)

### 3.1 Layout keseluruhan

```
┌─────────────────────────────────────────────────────────────────┐
│ [Topbar dari AppShell — user info]                              │
├─────────────────────────────────────────────────────────────────┤
│ PageHeader:                                                     │
│   Judul Project  [DRAFT badge]          [Lock Project] [⋯]     │
│   Klien: PT. XXXX                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ── Section: PRELIMINARIES ──────────────────────────────────── │
│    1. Mobilization                    qty unit        Rp total  │
│       ▾ (expanded)                                              │
│         a  Mobilisasi lapangan   1  ls   1.0  Rp 500k  Rp 500k │
│         b  Transportasi supv     2  trip 1.0  Rp 200k  Rp 400k │
│         [+ Tambah line item]                                    │
│    2. Security                        qty unit        Rp total  │
│    [+ Tambah item]                                              │
│                                                                 │
│  ── Section: INTERIOR WORKS ─────────────────────────────────── │
│    ▸ Floor Works [Subsection]                                   │
│      1. HT 60x60                      3  m²           Rp total  │
│         ▾ Body [L2]    ×1  markup 0%                 Rp subtot │
│           a  HPL 18mm   1  SHEET 0.75 Rp 285k  Rp 213k        │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ [Sticky footer]  Subtotal: Rp X  |  Grand Total: Rp Y          │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Kolom grid

**Satu grid template, dipakai di semua level:**

```css
--bq-grid: 1.75rem  /* expand chevron / indent space */
           2.5rem   /* No */
           minmax(0, 1fr)  /* Uraian */
           4.5rem   /* Qty */
           3.5rem   /* Sat */
           4rem     /* Koef (hanya tampil di L3) */
           7rem     /* Harga (hanya tampil di L3) */
           7.5rem   /* Biaya/Total */
           1.75rem; /* Row actions ⋯ */
```

Level yang tidak relevan untuk kolom tertentu: kosong (span atau hidden).

**Aturan per level:**

| Level | Chevron | No | Uraian | Qty | Sat | Koef | Harga | Biaya/Total | Actions |
|---|---|---|---|---|---|---|---|---|---|
| Section | — | — | nama CAPS | — | — | — | — | subtotal | — |
| Subsection | ▾/▸ | — | nama | — | — | — | — | subtotal | — |
| L1 Item | ▾/▸ | 1,2,3 | nama | qty | unit | — | — | total | ⋯ |
| L2 Sub-object | ▾/▸ | 1.1 | nama ×qty_per_l1 | — | — | — | — | subtotal | ⋯ |
| L3 Line item | — | a,b,c | title_snapshot | qty | sat | koef | harga | biaya | ⋯ |

### 3.3 Visual per level

**Section row:**
```
border-top: 1px solid var(--ui-border-default)
padding: 10px 0 4px
font: 10px, 700, UPPERCASE, letter-spacing: 0.14em
color: var(--ui-text-secondary)
background: transparent
```

**Subsection row:**
```
padding: 6px 0
font: 13px, 600
border-left: 2px solid var(--ui-border-strong)
padding-left: 8px
cursor: pointer (toggle expand)
```

**L1 Item row (header):**
```
padding: 8px 0
font: 13px, 500
background on hover: var(--ui-surface-muted)
cursor: pointer (toggle expand)
border-bottom: 1px solid var(--ui-border-subtle)
```

**L2 Sub-object row:**
```
padding: 5px 0
font: 12px, 500
border-left: 2px solid var(--ui-border-default)
margin-left: 20px
color: var(--ui-text-secondary)
/* tampilkan badge markup jika > 0: "markup 10%" */
```

**L3 Line item row:**
```
padding: 4px 0
font: 12px, 400, tabular-nums
margin-left: 36px
hover: background: color-mix(in srgb, var(--ui-surface-muted) 50%, transparent)
```

### 3.4 Inline editing

Semua angka di L3 (qty, koef, harga) dan L1 (qty, markup) bisa diedit inline:

```
Default state:   teks biasa, tabular-nums
Hover state:     underline dotted (var(--ui-border-default)) — sinyal bisa diklik
Focus state:     input muncul, border-bottom: var(--ui-border-focus), bg: var(--ui-surface)
Override state:  warna var(--ui-warning-fg) — sinyal harga sudah di-override dari snapshot
```

**Implementasi:**
- Bukan `<input>` yang selalu visible — gunakan `contenteditable` atau swap text↔input on click
- Tab berpindah ke field berikutnya (qty → koef → harga)
- Enter atau blur → simpan → recompute → update total atas

**Override marker:**
```
Jika harga_snapshot !== nilai_yang_tersimpan: tampilkan tanda ⚑ kecil di samping harga
Tooltip: "Harga diubah dari snapshot awal (Rp X)"
```

### 3.5 KATEGORI badge

Ditampilkan di L3 row, sebelum nama item. Compact, satu warna per tipe:

| KATEGORI | Warna |
|---|---|
| Material | `--ui-text-tertiary` (plain, tidak ada badge) |
| Upah | `--ui-success-fg` / `--ui-success-bg` |
| Material+Upah | `#6d28d9` / `#ede9fe` (purple — tidak ada di token, tambahkan sebagai BQ token lokal) |
| Biaya Umum | `--ui-warning-fg` / `--ui-warning-bg` |
| Transportasi & Akomodasi | `--ui-warning-fg` / `--ui-warning-bg` |
| Alat | `--ui-text-secondary` / `--ui-surface-muted` |

Ukuran badge: `font-size: 9px, font-weight: 700, uppercase, letter-spacing: 0.1em, padding: 1px 5px, border-radius: 9999px`

### 3.6 Tombol tambah (contextual, bukan selalu visible)

**Prinsip:** Tombol tambah muncul **di akhir grup** sebagai baris dashed — tidak di toolbar, tidak di modal terpisah.

```
[+ Tambah line item]   ← muncul di bawah grup L3, indent sejajar L3
[+ Tambah sub-object]  ← muncul di bawah grup L2, indent sejajar L2
[+ Tambah item]        ← muncul di bawah grup L1, indent sejajar L1
[+ Tambah section]     ← di bawah semua section
```

**Style tombol tambah:**
```css
border: 1px dashed var(--ui-border-default);
background: transparent;
color: var(--ui-text-tertiary);
font-size: 11px;
font-weight: 500;
padding: 3px 10px;
border-radius: var(--ui-radius-action);

:hover {
  border-style: solid;
  border-color: var(--ui-border-focus);
  color: var(--ui-text-primary);
  background: var(--ui-surface-muted);
}
```

### 3.7 Row action menu (⋯)

Muncul saat row di-hover. Gunakan `RowActionMenu` dari ui_engine patterns.

**L1 Item actions:**
- Edit nama
- Tambah Sub-object
- Tambah Line Item langsung
- Duplikat item
- ── separator ──
- Hapus item (danger, dengan ConfirmDialog)

**L2 Sub-object actions:**
- Edit nama / qty_per_l1 / markup
- Tambah Line Item
- Duplikat
- ── separator ──
- Hapus

**L3 Line item actions:**
- Edit (buka form inline atau dialog kecil)
- Simpan ke BQ Library
- Reset ke snapshot awal (jika ada override)
- ── separator ──
- Hapus

### 3.8 Sticky Grand Total footer

Selalu visible di bagian bawah layar saat scroll. Tidak ikut tercetak.

```
┌────────────────────────────────────────────────────────────────┐
│  border-top: 1px solid var(--ui-border-default)               │
│  background: var(--ui-surface) / backdrop-blur                 │
│  padding: 10px var(--ui-page-padding)                         │
│  position: sticky, bottom: 0, z-index: 10                     │
│                                                                │
│  [Subtotal Rp X]  [Markup total Rp Y]  Grand Total: Rp Z     │
│                                              font: 15px, 700  │
└────────────────────────────────────────────────────────────────┘
```

---

## 4. Halaman: Project List

Gunakan `PageShell` + `PageHeader` + `DataTable`.

**Kolom tabel:**
| Kolom | Lebar | Catatan |
|---|---|---|
| Judul | auto | link ke project detail |
| Klien | 160px | |
| Status | 80px | badge DRAFT/LOCKED |
| Estimator | 140px | nama user |
| Grand Total | 120px | tabular-nums, right-align |
| Dibuat | 110px | tanggal |
| Actions | 40px | RowActionMenu |

**Page header actions:**
- `[+ Buat Project]` → Dialog (form: judul, klien, pilih template atau kosong)

**Empty state:**
```
Ikon: FileText (lucide)
Judul: "Belum ada BQ project"
Deskripsi: "Mulai dengan membuat project baru."
Tombol: [+ Buat Project Baru]
```

---

## 5. Halaman: BQ Library

Dua tab: **Items** dan **Templates**

### 5.1 Tab Items

`DataTable` dengan filter KATEGORI + search.

**Kolom:**
| Kolom | Catatan |
|---|---|
| Nama | |
| Unit beli | |
| Harga | tabular-nums, right |
| KATEGORI | badge |
| Status Promosi | badge: DRAFT/REQUESTED/APPROVED/REJECTED |
| Actions | Ajukan Promosi (jika eligible) + Edit + Hapus |

**Tombol "Ajukan Promosi"** hanya muncul untuk item dengan:
- `promotion_status === DRAFT`
- KATEGORI = Material / Upah / Material+Upah

Tombol ini ada di RowActionMenu, **bukan** kolom tersendiri.

### 5.2 Tab Templates

Grid kartu (bukan tabel). Per kartu:
```
┌──────────────────────────────┐
│ Nama Template                │
│ 4 sections · 12 sub-sections │
│ Dibuat: 2026-09-01           │
│                              │
│ [Edit]  [Duplikat]  [Hapus]  │
└──────────────────────────────┘
```

Tombol `[+ Buat Template]` di kanan atas.

### 5.3 Template Editor

Two-panel layout — **tidak menggunakan `PageShell` default**, gunakan layout custom:

```
┌──────────────────┬────────────────────────────────────────────┐
│ Section Tree     │ Recommended Items                          │
│ (lebar: 280px,   │ (sisanya)                                  │
│  fixed)          │                                            │
│                  │                                            │
│ ▸ Preliminaries  │  Section dipilih: Preliminaries            │
│   ▸ Floor Works  │  ──────────────────────────────────────── │
│   ▸ Ceiling      │  [Search library...                    🔍] │
│ ▸ Interior       │                                            │
│ ▸ Furniture      │  ✓ Mobilisasi lapangan     Biaya Umum      │
│                  │  ✓ Security guard          Biaya Umum      │
│ [+ Section]      │  + Transportasi supervisor  ...            │
│                  │                                            │
│                  │  [+ Tambah dari Library]                   │
└──────────────────┴────────────────────────────────────────────┘
```

**Kiri — Section Tree:**
- Drag handle untuk reorder (⠿ icon, muncul on hover)
- Klik Section → tampilkan recommended items di panel kanan
- Chevron ▸/▾ untuk expand subsection
- Inline edit nama section (klik nama → `contenteditable`)
- Tombol hapus section: `×` muncul on hover

**Kanan — Recommended Items:**
- Daftar scrollable item yang sudah ditambahkan
- Search bar di atas untuk cari dari library
- Setiap item: [drag ⠿] [nama] [KATEGORI badge] [×]
- Tombol `[+ Tambah dari Library]` membuka picker (dialog kecil)

---

## 6. Halaman: Line Item Picker

Dibuka dari: "Tambah Line Item" (di L2 atau L1 langsung). Gunakan `Dialog` ukuran `lg`.

**Struktur:**
```
┌─────────────────────────────────────────────────────────┐
│ Pilih Line Item                              [×]        │
├─────────────────────────────────────────────────────────┤
│ [Master Data] [BQ Library] [Custom]                     │
├─────────────────────────────────────────────────────────┤
│ [Search...                                          🔍] │
│ [Filter: Semua ▾]                                       │
├─────────────────────────────────────────────────────────┤
│ Plywood 18mm · SHEET · Rp 285.000            Material   │
│ 1 SHEET = 2,88 M²                                       │
│ ──────────────────────────────────────────────────────  │
│ HPL Taco Putih · SHEET · Rp 185.000          Material   │
│ 1 SHEET = 3,00 M²                                       │
│ ──────────────────────────────────────────────────────  │
│ Jasa Pasang HPL · M² · Rp 45.000            Upah       │
├─────────────────────────────────────────────────────────┤
│                               [Batal]  [Pilih]          │
└─────────────────────────────────────────────────────────┘
```

**Tab Master Data:**
- Hasil search dari `searchMaterialPrices`, `searchLaborPrices`, `searchMaterialLaborPrices`
- Tampilkan `purchase_to_base_factor` ("1 SHEET = 2,88 M²") sebagai sub-baris kecil
- Klik item → selected (highlight), klik Pilih → snapshot → tutup dialog

**Tab BQ Library:**
- Sama strukturnya, dari local library
- Tampilkan KATEGORI badge dan `default_koefisien`

**Tab Custom:**
- Form inline di dalam dialog:
  ```
  Nama item          [__________________]
  Unit beli          [______]  KATEGORI  [▾ Material]
  Harga              [____________ IDR]
  Qty                [___]   Koefisien  [___]
  Catatan            [__________________]
  ```

---

## 7. Halaman: Promotion Queue (Master Data admin/staff)

`DataTable` sederhana. Gunakan `PageShell` + `PageHeader`.

**Kolom:**
| Kolom | Catatan |
|---|---|
| Nama | |
| Tipe | Material / Labor / Material+Labor |
| Unit | |
| KATEGORI | badge |
| Diajukan oleh | |
| Tanggal | |
| Actions | RowActionMenu: Approve + Reject |

**Approve** → ConfirmDialog singkat.
**Reject** → Dialog kecil dengan textarea alasan (wajib diisi).

---

## 8. Component baru yang perlu dibuat di `src/apps/bq/components/`

| Komponen | Fungsi |
|---|---|
| `BqProjectTree.tsx` | Tree view seluruh project (sections → L1 → L2 → L3) |
| `BqSectionRow.tsx` | Baris Section (separator + nama caps + subtotal) |
| `BqSubsectionRow.tsx` | Baris Subsection (indent, chevron, subtotal) |
| `BqItemRow.tsx` | Baris L1 — expand, inline edit qty + markup |
| `BqSubObjectRow.tsx` | Baris L2 — expand, qty_per_l1, markup badge |
| `BqLineItemRow.tsx` | Baris L3 — inline edit qty/koef/harga, KATEGORI badge |
| `BqGrandTotalFooter.tsx` | Sticky footer dengan grand total |
| `BqAddButton.tsx` | Tombol dashed "+" yang dipakai di semua level |
| `BqKategoriBadge.tsx` | Badge KATEGORI dengan color mapping |
| `BqOverrideMarker.tsx` | Indikator ⚑ bahwa harga sudah di-override |
| `LineItemPicker.tsx` | Dialog pilih dari MD / Library / Custom |
| `TemplateEditor.tsx` | Two-panel template editor |
| `ProjectStatusBadge.tsx` | Badge DRAFT / LOCKED |
| `PromotionStatusBadge.tsx` | Badge DRAFT / REQUESTED / APPROVED / REJECTED |

---

## 9. Inline edit hook

Buat `src/apps/bq/lib/use-inline-edit.ts`:

```typescript
// Hook yang mengelola state text↔input swap
// Input:
//   value: number | string
//   onSave: (newValue) => Promise<void>
//   format?: (value) => string  // untuk display (Rp formatting, dll)

// Output:
//   displayValue: string
//   isEditing: boolean
//   inputProps: { value, onChange, onBlur, onKeyDown }
//   activate: () => void  // panggil saat user klik teks

// Behavior:
//   Enter atau Tab → save → isEditing = false
//   Escape → cancel → revert ke nilai lama
//   Blur → save
//   Saat saving: show Spinner kecil di posisi angka
```

---

## 10. Token tambahan BQ-local

Tambahkan di `src/apps/bq/styles/bq-tokens.css` (di-import di layout BQ):

```css
:root {
  /* KATEGORI colors - yang tidak ada di ui_engine token */
  --bq-kategori-upah-fg: var(--ui-success-fg);
  --bq-kategori-upah-bg: var(--ui-success-bg);
  --bq-kategori-material-labor-fg: #6d28d9;
  --bq-kategori-material-labor-bg: #ede9fe;
  --bq-kategori-biaya-fg: var(--ui-warning-fg);
  --bq-kategori-biaya-bg: var(--ui-warning-bg);
  --bq-kategori-alat-fg: var(--ui-text-secondary);
  --bq-kategori-alat-bg: var(--ui-surface-muted);

  /* Override marker */
  --bq-override-fg: var(--ui-warning-fg);
  --bq-override-bg: var(--ui-warning-bg);

  /* Tree indentation */
  --bq-indent-section: 0px;
  --bq-indent-subsection: 12px;
  --bq-indent-l1: 12px;
  --bq-indent-l2: 28px;
  --bq-indent-l3: 44px;

  /* Grid columns */
  --bq-col-chevron: 24px;
  --bq-col-no: 32px;
  --bq-col-qty: 56px;
  --bq-col-sat: 48px;
  --bq-col-koef: 52px;
  --bq-col-harga: 88px;
  --bq-col-biaya: 96px;
  --bq-col-action: 28px;
}
```

---

## 11. App registration

Tambahkan BQ ke `src/app/app-registrations.ts`:

```typescript
{
  appId: "bq",
  name: "Bill of Quantity",
  rootPath: "/bq",
  requiredPermission: "bq.access",
}
```

Buat `src/apps/bq/runtime.ts`:
```typescript
export const BQ_APP = {
  appId: "bq",
  name: "Bill of Quantity",
  rootPath: "/bq",
} as const
```

---

## 12. Urutan build UI (tambahan ke implementation plan)

Setiap fase di `bq-implementation-plan.md` harus include UI component-nya:

| Fase | UI yang dibangun |
|---|---|
| BQ-F1 | `bq-tokens.css`, app registration, layout shell BQ |
| BQ-F2 | LibraryTable, LibraryForm, TemplateEditor, BqKategoriBadge, PromotionStatusBadge |
| BQ-F3 | BqProjectTree, semua Row components, BqGrandTotalFooter, BqAddButton, use-inline-edit |
| BQ-F4 | LineItemPicker (tiga tab), BqOverrideMarker |
| BQ-F5 | PromotionQueue, PromotionStatusBadge (update) |
