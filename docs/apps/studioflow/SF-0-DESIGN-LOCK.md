# SF-0 Design Lock

**Status:** ACTIVE — non-negotiable contract for SF-B through SF-G
**Authority:** Product owner directive + UX spec R0.3
**Dibaca bersama:** `studioflow-ux-spec.md`, `studioflow-project-contract.md`, `AGENTS.md`
**Tanggal:** 2026-09-14

---

## Tujuan dan otoritas

Dokumen ini mengunci keputusan desain lintas fase yang **tidak boleh diimprovisasi
per-plan**. Setiap plan SF-B hingga SF-G harus merujuk SF-0 sebagai kontrak dan
tidak boleh menyimpang tanpa owner decision tertulis yang mengupdate dokumen ini.

SF-0 lahir dari temuan R8.69: pola UI Engine directory dipaksakan ke permukaan
workspace StudioFlow, menghasilkan pengalaman yang "memaksakan" — bukan karena
UI Engine salah, tapi karena pemilihan pola tidak sesuai karakter permukaannya.

**Prinsip yang diturunkan dari UX spec §1.1:**

> Layar menampilkan keadaan, bukan meminta keadaan.
> Halaman yang melaporkan, bukan halaman yang diisi.

---

## 1. Taksonomi permukaan

StudioFlow memiliki tiga jenis permukaan. Pilihan pola UI Engine **ditentukan
oleh jenis permukaan, bukan oleh ketersediaan komponen**.

### Tier A — Directory surface

Permukaan yang bertugas **mengelola dan menemukan rekaman**. User datang untuk
mencari, menyaring, membuat, atau membuka satu entitas.

| Surface | Route |
|---|---|
| Project List | `/studioflow/projects` |
| Client List | `/studioflow/clients` |
| Requirement Settings | `/settings/requirements` |
| Phase Template Settings | `/settings/phases/[id]/requirements` |

**Karakteristik:** entitas setara, satu baris per entitas, aksi per-baris, filter/sort
global, kolom semantik.

### Tier B — Workspace surface

Permukaan yang bertugas **mengeksekusi pekerjaan dalam satu project**. User
datang untuk melihat status, mengambil tindakan, dan mencatat kemajuan. Bukan
untuk mengelola rekaman — untuk bekerja.

| Surface | Route |
|---|---|
| Project Detail | `/studioflow/projects/[id]` |
| (embedded) General Requirements | bagian dari Project Detail |
| (embedded) Phase + Iteration | bagian dari Project Detail |
| Phase Requirements (akses sekunder) | `/studioflow/projects/[id]/phases/[phaseId]/requirements` |
| General Requirements (akses sekunder) | `/studioflow/projects/[id]/requirements` |

**Karakteristik:** satu project sebagai konteks, hierarki (phase → iteration →
task/requirement), aksi kontekstual, status ditampilkan bukan diinput.

### Tier C — Reporting surface

Permukaan yang **melaporkan keadaan lintas project** tanpa meminta input.
User datang untuk menjawab "apa yang harus saya kerjakan sekarang".

| Surface | Route |
|---|---|
| Menunggu Saya (Activity Center) | `/studioflow` atau `/studioflow/activity` |

**Karakteristik:** workflow-state grouping (bukan project grouping), diurut
berdasarkan umur (terlama di atas), tidak ada filter tersimpan, tidak ada auto-hide.

---

## 2. Aturan UI Engine per tier

### Tier A — Directory: pola directory diizinkan penuh

`DirectoryShell`, `DataTable`, `EntityPrimaryCell`, `RowActionMenu` — semua
boleh dan dianjurkan. Ini konteks yang tepat untuk pola tersebut.

### Tier B — Workspace: pola directory dilarang sebagai container utama

| Pola | Status di workspace | Pengganti |
|---|---|---|
| `DirectoryShell` sebagai page frame | ❌ Dilarang | `PageShell` + komposisi section |
| `DataTable` sebagai interaksi utama | ❌ Dilarang | List dengan baris kontekstual (lihat §3) |
| `EntityPrimaryCell` sebagai cell standar | ❌ Dilarang | Layout baris spesifik per domain |
| `RowActionMenu` sebagai satu-satunya aksi | ⚠️ Dibatasi | Aksi inline utama + overflow sekunder |
| `PageShell`, `PageHeader`, `Field` | ✅ Diizinkan | Tetap gunakan |
| `DraftDialog`, `ConfirmDialog` | ✅ Diizinkan | Tetap gunakan |
| `Combobox`, `InlineEdit` | ✅ Diizinkan | Tetap gunakan |

**DataTable boleh dipakai** di workspace hanya untuk data tabular read-only
(contoh: riwayat iterasi sebagai tabel ringkasan). Tidak boleh sebagai container
interaksi utama (create, edit, satisfy, archive).

### Tier C — Reporting: tidak ada tabel, tidak ada form

Tidak ada `DataTable`, tidak ada `DirectoryShell`, tidak ada form input.
Layout adalah grouping + baris lintas-project yang bisa diklik, bukan entitas
yang dikelola.

---

## 3. Kosakata interaksi workspace

Ini bukan nama komponen yang harus dibuat sekarang — ini spesifikasi perilaku
yang menjadi acuan saat komponen workspace-local dibangun di SF-B dan seterusnya.

### 3.1 Baris kontekstual (menggantikan DataTable row)

Sebuah baris workspace menampilkan:
- Status (chip atau teks, bukan dropdown)
- Konten utama (judul/nama)
- Metadata pendukung (umur, assignee, tanggal) — hanya yang relevan per keadaan
- Aksi inline: **satu aksi primer** yang relevan dengan state saat ini
- Overflow menu (⋯) untuk aksi sekunder; muncul saat hover/focus

Tidak pernah ada dua aksi primer di satu baris secara bersamaan.

### 3.2 Section pinned (menggantikan tab teratas)

Requirement umum dan General Task hidup sebagai section pinned di puncak
Project Detail — selalu terlihat, tidak pernah hilang saat filter fase aktif.
Ini perilaku yang ditetapkan UX spec §3.2 untuk General Task; berlaku sama
untuk General Requirement.

### 3.3 Expandable phase row

Fase ditampilkan sebagai baris yang bisa dibuka/tutup. Fase aktif
(`IN_PROGRESS`, `WAITING_CLIENT`) terbuka secara default. Fase selesai collapsed
secara default. Ini bukan accordion UI Engine umum — ini komponen `PhaseRow`
milik StudioFlow (UX spec §7).

### 3.4 Aksi berdasarkan state, bukan menu bebas

Tidak ada dropdown status. Aksi yang tersedia berganti berdasarkan state entitas
(UX spec §3.6). Tombol yang tidak relevan dengan state saat ini **tidak dirender**
— bukan disabled. Tombol disabled yang tidak bisa diklik mengajarkan user bahwa
tombol tidak bisa dipercaya.

---

## 4. Keputusan domain Requirements

### 4.1 Definisi ulang

> Requirement = prerequisite / checklist yang melekat ke project dan fase.
> Bukan mini workflow management system dengan domain tersendiri.

Legacy basis: `ChecklistTemplate → ProjectChecklist`, embedded di project/phase.
Rebuild mengeksplisitkan domain-nya — ini perbaikan yang sah. Yang perlu dikoreksi
adalah UX dan lifecycle, bukan domain model-nya.

### 4.2 Hierarki akses (PRIMARY vs SECONDARY)

```
PRIMARY — embedded di Project Detail:
  Project Detail
  ├── [pinned] General Requirements
  │     ☐ Client brief
  │     ☐ Existing drawing
  │     + tambah
  ├── General Tasks
  └── [per fase, di dalam PhaseRow]
        Phase Requirements
        ☐ Layout approved
        ☐ Material direction confirmed

SECONDARY — dedicated route (shortcut, bukan pintu utama):
  /studioflow/projects/[id]/requirements
  /studioflow/projects/[id]/phases/[phaseId]/requirements
```

Dedicated requirement routes tetap ada dan valid — untuk akses cepat, link
langsung, dan pengelolaan. Tapi pengalaman sehari-hari user melihat dan
mencentang requirement dari Project Detail, bukan dengan "masuk ke halaman
Requirement".

**Implikasi untuk Codex:** SF-B harus membangun embedded requirement section
di Project Detail. Dedicated routes yang sudah ada tetap dipertahankan.

### 4.3 Lifecycle — instance (project requirement)

```
OPEN       default saat dibuat atau di-reopen
SATISFIED  requirement terpenuhi; catat note, by, timestamp
WAIVED     requirement tidak lagi berlaku untuk project ini
           (ringan: tidak wajib alasan, tidak ada actor log)
```

**DIHAPUS dari instance lifecycle:**
- `archived_at`, `archive_reason`, `archived_by`
- `restored_at`, `restore_reason`, `restored_by`

Ketiga state di atas cukup untuk use case prerequisite/checklist. Archive/restore
dengan actor dan reason adalah audit trail level enterprise — tidak ada business
case konkret yang dijustifikasi di sini. Kalau kebutuhan itu muncul di masa depan,
tambahkan dengan justifikasi eksplisit.

**Schema implication:** kolom-kolom archive/restore di `sf_project_requirement`
perlu dievaluasi dalam plan tersendiri (SF-REQUIREMENTS-SIMPLIFY) sebelum
data di-populate lebih jauh. Jangan drop tanpa plan eksplisit.

### 4.4 Lifecycle — template (requirement template)

```
soft_delete: archived_at (tanpa reason wajib)
```

Template dikelola admin. Soft delete tanpa reason wajib adalah perilaku yang
sesuai untuk admin tool.

### 4.5 Evidence linking

Tetap dipertahankan sebagai fitur opsional. "File sebagai bukti satisfaksi"
adalah reasonable extension dari konsep checklist legacy.

**UI rule:** evidence link tidak boleh menjadi mandatory flow atau prominent
CTA. Ia tersedia sebagai secondary action setelah Satisfy — bukan langkah yang
dipromosikan saat requirement pertama dibuat.

### 4.6 Satisfaction note

Tetap dipertahankan. Satu-baris note saat satisfy adalah konteks minimal yang
masuk akal.

### 4.7 Settings tetap dedicated route

`/settings/requirements` dan `/settings/phases/[id]/requirements` adalah Tier A
(directory/admin). Dedicated route adalah tepat dan tidak perlu diubah.

### 4.8 Seeding saat project/phase dibuat

Tetap dipertahankan. Template otomatis jadi instance saat project/phase dibuat —
ini behavior legacy yang valid dan sudah diimplementasi di rebuild.

---

## 5. Kontrak narrow-screen (375 px)

Semua workspace surface harus lolos aturan ini tanpa horizontal scroll pada body.

### 5.1 Aturan wajib

- **Tidak ada `min-width` lebih lebar dari viewport** pada elemen apapun kecuali
  tabel dan blok kode, yang boleh scroll horizontal dalam container `overflow-x: auto`
  miliknya sendiri.
- **Kolom tunggal**: layout multi-kolom (grid, flex-row) collapse ke satu kolom
  di bawah 640 px.
- **Touch target minimum 44 × 44 px** untuk semua tombol dan aksi interaktif.
- **Side gutter minimum 16 px** pada kedua sisi — ditetapkan satu kali di body
  atau outer wrapper.
- **Chip dan label fase**: wrap, tidak truncate tanpa tooltip.
- **Baris kontekstual**: aksi overflow (⋯) tetap accessible dan tidak tertutup
  konten yang overflow.

### 5.2 Perilaku yang diizinkan di 375 px

- PhaseRow collapsed secara default (menghemat ruang vertikal)
- Kolom metadata (umur, assignee) bisa disembunyikan di breakpoint sempit
  *asal* informasi kritis (status, nama) tetap terlihat
- Section pinned tetap di atas, tidak dipindahkan atau disembunyikan

### 5.3 Perilaku yang dilarang di 375 px

- Body scroll horizontal
- Tombol atau aksi terpotong atau tidak reachable
- Form yang meluber keluar viewport
- Modal/dialog yang tidak bisa di-dismiss karena tombol tutup terpotong

---

## 6. Resolusi TODO(SF-0)

Scaffold `// TODO(SF-0)` yang ditambahkan di R8.72 menandai lokasi di mana
pola directory dipaksakan ke workspace. Masing-masing harus diselesaikan
sesuai tier yang tepat, bukan sekadar dihapus comment-nya.

### Project List — DataTable / DirectoryShell

**Tier:** A (Directory). DataTable dan DirectoryShell **tetap dipertahankan**.
Project List adalah directory surface yang sah.

**Yang dikoreksi jika ada:** pastikan kolom "Ringkasan fase" menampilkan
informasi workspace yang relevan (UX spec §4) bukan sekadar enum status mentah.

### Requirements route — standalone page pattern

**Tier:** B secondary. Page pattern (`PageShell` + list) pada dedicated
requirement routes **dipertahankan** sebagai akses sekunder.

**Yang perlu ditambah:** embedded requirement section di Project Detail (SF-B)
sebagai primary access.

### Komponen lain yang diberi TODO(SF-0)

Setiap komponen harus dibaca konteksnya: jika permukaan adalah Tier A, hapus
TODO dan pertahankan pola. Jika Tier B, ganti dengan pola workspace sesuai §3.
Catat keputusan di PR description.

---

## 7. Implikasi per fase SF-B hingga SF-G

### SF-B (Activity Center / Menunggu Saya)

- Tier C — gunakan workflow-state grouping
- Urutan: umur menurun (terlama di atas)
- Tidak ada DataTable, tidak ada filter tersimpan
- Referensi: UX spec §2a

### SF-B (Project Detail — workspace surface)

- Tier B — gunakan `PageShell` + section komposisi
- Bangun PhaseRow, IterationRow sebagai komponen local (UX spec §7)
- General Requirements sebagai section pinned di atas (§4.2 dokumen ini)
- Phase Requirements embedded dalam PhaseRow
- Tidak ada DirectoryShell sebagai frame halaman detail

### SF-B (Project List)

- Tier A — DataTable dipertahankan
- Kolom "Ringkasan fase" menampilkan bahasa manusia (UX spec §4), bukan enum

### SF-C dan seterusnya (fase yang belum defined)

Sebelum plan phase dibuat, classifier surface-nya ke Tier A/B/C, lalu pilih
pola sesuai tabel §2. Jika surface baru tidak masuk ke tiga tier yang ada,
buat owner decision dan update dokumen ini.

---

## 8. Perubahan yang butuh plan tersendiri (belum dieksekusi)

Keputusan di SF-0 ini membutuhkan execution plans terpisah. Jangan implementasikan
tanpa plan eksplisit yang mengacu ke SF-0.

| Item | Plan ID (diisi saat dibuat) |
|---|---|
| Schema cleanup: drop archive/restore columns di `sf_project_requirement` | SF-REQUIREMENTS-SIMPLIFY |
| Tambah `WAIVED` state ke schema dan service | SF-REQUIREMENTS-SIMPLIFY |
| Embedded requirement section di Project Detail | SF-B |
| Phase requirement embedded di PhaseRow | SF-B |
| Activity Center (workflow-state grouping) | SF-B |

---

## 9. Amandemen

Dokumen ini hanya bisa diamandemen dengan owner decision yang eksplisit.
Amandemen dicatat di tabel ini dan dokumen di-update dalam revision yang sama.

| Tanggal | Item | Perubahan | Owner decision |
|---|---|---|---|
| — | — | — | — |
