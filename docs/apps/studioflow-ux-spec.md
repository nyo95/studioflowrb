# StudioFlow UX/UI Specification

**Status:** DRAFT — menunggu persetujuan owner
**Versi:** R0.2 — koreksi logic PRD R7.07
**Tanggal:** 2026-09-08
**Dibaca bersama:** `studioflow.md`, `studioflow-project-contract.md`

---

## 1. Prinsip desain

### 1.1 Filosofi utama

> "Halaman yang melaporkan, bukan halaman yang diisi."

Legacy meminta pemiliknya menyatakan ulang hal-hal yang sistem sudah tahu: bahwa
sebuah desain sudah dikirim, bahwa ini ronde ketiga, bahwa fase sedang direview.
Setiap pernyataan ulang itu adalah salinan kedua dari kebenaran yang sama, dan
salinan kedua selalu bisa meleset dari yang pertama.

Permukaan StudioFlow dibangun dari satu aturan: **layar menampilkan keadaan,
bukan meminta keadaan.** Pengguna mencatat mulai kerja, pengiriman, jawaban
klien, dan penutupan lingkup fase. Nomor dan ringkasan status mengikuti fakta itu.

**Yang diambil dari legacy:**

- Fase sebagai kerangka kerja studio yang memang nyata
- Riwayat ronde yang bisa dibuka kembali
- Checklist poin revisi

**Yang dibuang dari legacy:**

- Dropdown status di setiap fase
- Halaman fase yang terpisah dari halaman project
- Kolom "desain ke berapa" yang diketik manusia
- Task yang wajib dipilihkan fasenya sebelum boleh disimpan
- Status review internal yang tidak pernah dibaca siapa pun

### 1.2 Pertanyaan yang harus terjawab dalam tiga detik

Halaman project dibuka bukan untuk mengagumi datanya, tapi untuk menjawab:

1. Apa yang menunggu saya sekarang?
2. Apa yang sedang menunggu klien, dan sudah berapa lama?
3. Apa yang sudah selesai?

Kalau sebuah elemen tidak membantu salah satu dari tiga ini, elemen itu tidak
masuk layar utama.

## 2. Shell consumption (wajib dipakai)

StudioFlow memakai UI Engine terlebih dahulu. Kekurangan mekanisme generik
diperbaiki di shared layer sebelum dipakai aplikasi
(`studioflow-project-contract.md` §13.3).

Dipakai dari `@/platform/ui_engine`: `PageHeader`, `NavGroup`, `NavItem`,
`TableCard`, dialog/AlertDialog, dan seluruh state standar (loading, empty,
error, permission-denied, destructive confirmation).

Warna, spasi, dan tipografi memakai design token dari CSS variables. Tidak ada
warna hardcode. Densitas mengikuti `DESIGN.md`.

## 3. Halaman: Project Detail (layar utama)

Ini satu-satunya layar kerja. Tidak ada halaman fase terpisah.

### 3.1 Layout keseluruhan

```
┌────────────────────────────────────────────────────────────┐
│ PageHeader                                                  │
│   Nama Project · SF26-1042 · Nama Klien                     │
│   [Aktif]  Lead: Budi                                       │
├────────────────────────────────────────────────────────────┤
│ TODO UMUM                                        (2 terbuka)│
│   ○ Telepon klien soal handle pintu                         │
│   ○ Cek stok marmer di supplier                             │
│   + tambah                                                   │
├────────────────────────────────────────────────────────────┤
│ [Semua] Moodboard  Layout  3D  CD  Supervisi                │
├────────────────────────────────────────────────────────────┤
│ ▾ 3D                          Nunggu klien · 4 hari         │
│     D4   belum digarap                                       │
│     D3   dikirim 4 hari lalu       [Catat jawaban klien]    │
│     D2   direvisi                                            │
│     D1   direvisi                                            │
│                                                              │
│ ▸ Layout                                Selesai              │
│ ▸ Moodboard                             Selesai              │
│ ▸ CD                    Belum mulai     [Mulai ronde]       │
│ ▸ Supervisi                             Belum mulai          │
└────────────────────────────────────────────────────────────┘
```

### 3.2 Blok TODO umum — pinned

Selalu di paling atas, **selalu terlihat, dan tidak pernah ikut hilang saat
filter fase dipakai.** Ini menjawab keluhan bahwa task umum tenggelam ketika
semuanya dipaksa masuk fase.

- Input tambah task adalah satu baris teks. **Tidak ada pilihan fase.** Ketik,
  Enter, selesai (`studioflow-project-contract.md` §7.3).
- Judul bisa diedit inline: klik teks → jadi input, Enter/blur simpan, Esc batal.
- Task selesai hilang dari blok setelah dicentang, dan tetap bisa dibuka lewat
  "lihat yang selesai".
- Menyeret task ke baris fase memberinya `phase_scope`. Itu **satu-satunya**
  cara fase pernah ditentukan manual, dan sifatnya koreksi.

### 3.3 Filter fase

Chip, bukan tab — karena "Semua" adalah default dan harus terasa seperti keadaan
normal, bukan salah satu pilihan setara.

Memfilter menyembunyikan baris fase lain. **Tidak pernah menyembunyikan blok
TODO umum.**

### 3.4 Baris fase

Satu baris per fase, collapsed secara default kecuali fase yang sedang aktif
(`IN_PROGRESS` atau `WAITING_CLIENT`) — itu terbuka sendiri.

Kanan baris menampilkan status dalam bahasa manusia, bukan nama enum:

| State | Ditampilkan | Nada |
|---|---|---|
| `NOT_STARTED` | Belum mulai | netral, redup |
| `IN_PROGRESS` | Digarap | netral |
| `WAITING_CLIENT` | Nunggu klien · N hari | **umur wajib tampil** |
| `DONE` | Selesai | redup, bukan perayaan |

Umur pada `WAITING_CLIENT` bukan hiasan — itu mitigasi risiko R2. Fase yang
menunggu jawaban selamanya harus terlihat menua, bukan terlihat tenang.

### 3.5 Kartu iterasi

Di dalam baris fase, satu baris per ronde, terbaru di atas.

- Label diturunkan dari fase dan nomor (`MB 2`, `Layout 1`, `D4`, `CD 1`).
  **Nomor tidak pernah muncul sebagai input di mana pun di aplikasi ini.**
- Ronde `DRAFT` yang belum ada isinya ditampilkan sebagai **"D4 · belum
  digarap"**. Ini bukan placeholder kosong — inilah antrean kerjanya
  (`studioflow-project-contract.md` §7.1). Ia yang menggantikan to-do "update
  desain 3D" yang dulu diketik manual.
- Ronde `VOIDED` tampil “Dibatalkan”, dengan alasan dan isi tetap terbaca; tidak
  masuk antrean kerja. Aksi **Hentikan ronde** pada `DRAFT`/`SENT` memerlukan
  `iteration.review`, alasan, dan konfirmasi. Berguna untuk D4 yang tidak lagi
  diperlukan setelah koreksi; tidak membuat jawaban klien palsu.
- Ronde `SUPERSEDED` tampil redup dengan label "direvisi", tetap bisa dibuka.
- Poin revisi terbuka tampil sebagai checklist di dalam ronde `DRAFT`. Poin
  dengan `source = CLIENT_REVISION` diberi penanda halus — asalnya dari klien,
  bukan catatan sendiri.

### 3.6 Aksi — satu tombol utama per keadaan

Tidak pernah ada dua tombol primer bersamaan di satu ronde.

| Keadaan ronde | Tombol | Permission |
|---|---|---|
| `DRAFT` | **Kirim ke klien** | `iteration.review` |
| `SENT` | **Catat jawaban klien** | `iteration.review` |
| fase terbuka tanpa draft (aksi fase) | **Mulai ronde** | `iteration.manage` |
| `APPROVED` terbaru yang tidak dibatalkan, tanpa ronde terbuka | **Selesaikan fase** | `iteration.review` |

**Mulai ronde** memakai aturan yang sama dengan upload dan permintaan revisi.
Jika sudah ada draft, buka draft tersebut. Fase tertutup harus **Buka kembali**
dengan alasan dahulu. Saat ada ronde `SENT`, draft boleh dikerjakan, tetapi
Kirim ditolak dengan penjelasan jawaban ronde sebelumnya masih ditunggu.

Pemegang `iteration.manage` tanpa `iteration.review` — yaitu drafter — melihat
ronde dan bisa mengisinya, tapi tombol Kirim tidak dirender untuknya. Bukan
disabled, **tidak ada**. Tombol mati yang tidak pernah bisa ditekan hanya
mengajari orang bahwa tombol tidak bisa dipercaya.

### 3.7 Dialog Kirim ke klien

Isi minimum: ronde apa yang dikirim, catatan wajib tentang materi dan kanal
pengiriman di luar aplikasi, serta konfirmasi. Aksi ini mencatat pengiriman;
aplikasi tidak otomatis mengirim file atau pesan kepada klien.

Kalau masih ada poin revisi terbuka, dialog **menyebut jumlahnya** dan tetap
mengizinkan lanjut:

> Masih ada **2 poin** yang belum selesai di D4.
> [Batal] [Tetap kirim]

Menyebut angkanya wajib (mitigasi risiko R5). Peringatan yang cuma berbunyi
"ada poin belum selesai" akan dilewati tanpa dibaca dalam seminggu.

### 3.8 Dialog Catat jawaban klien

Dua pilihan, dan pilihan kedua punya konsekuensi yang harus terlihat **sebelum**
dikonfirmasi:

```
Jawaban klien untuk D3

  ( ) Disetujui
  ( ) Minta revisi
      └ Poin revisi:
        + [                                    ]
        catatan bebas: [                       ]

  ⓘ Memilih "Minta revisi" akan menambahkan poin
     ke D4, dan membuat D4 jika belum ada.
     Jika D4 sudah ada, pekerjaan di dalamnya dipertahankan.

  [Batal]  [Simpan jawaban]
```

Kalimat konsekuensi itu bagian dari kontrak, bukan basa-basi UI: aturan
`studioflow-project-contract.md` §6.2 mensyaratkan pembukaan ronde berikutnya
menjadi akibat yang **dinyatakan**, bukan efek samping diam-diam. Layar adalah
tempat pernyataan itu sampai ke manusia.

Jawaban tersimpan tidak diedit atau dihapus. **Koreksi jawaban** di menu ronde
meminta alasan dan jawaban pengganti, lalu menampilkan perubahan sebelum simpan.
Jawaban lama tetap terbaca. Draft penerus dan isinya tetap ada. Jika penerus
sudah dikirim/disetujui, konfirmasi wajib menyatakan pengiriman, jawaban, dan
penutupan yang lebih baru tidak dibatalkan. Poin sumber lama ditandai
“Sumber dikoreksi”; lihat aturan lengkap project §6.5.

Pada pilihan Disetujui, tampilkan checkbox **Sekalian selesaikan fase ini**, default
tidak dicentang, hanya tersedia jika tidak ada ronde lain yang belum selesai.
Tanpa checkbox: “Ronde disetujui · fase masih terbuka”. Jika masih ada pekerjaan
lingkup lain, pengguna mulai ronde berikutnya; tidak perlu override.
Selesaikan fase juga tersedia setelah approval sebagai aksi tersendiri.
Tampilkan jumlah poin/tugas terbuka sebagai peringatan, bukan penghalang.

### 3.9 Menu baris (⋯)

Muncul saat hover/focus, tetap terlihat saat menu terbuka. Isi tergantung
permission: Tarik pengiriman (hanya `SENT` tanpa penerus), Koreksi jawaban,
Ubah assignee, Buka kembali fase, Tutup fase dengan pengecualian. Aksi koreksi,
buka kembali, dan pengecualian meminta alasan sesuai kontrak.

Tidak ada dropdown status bebas. Penutupan pengecualian ada di menu; koreksi
jawaban memakai aksi tersendiri. Supervisi memiliki aksi Mulai, Selesaikan,
dan Buka kembali, tanpa ronde atau status Nunggu klien.

## 4. Halaman: Project List

Tabel dengan `minWidth` semantik dan scroll horizontal, mengikuti pola Master
Data dan BQ.

Kolom: Nama · Klien · Ringkasan fase · Status project · Lead · Dibuka.

“Ringkasan fase” memprioritaskan semua fase yang menunggu klien beserta umur,
lalu fase digarap; fase belum mulai tidak boleh menutupi fase yang sedang aktif.
Jika semua fase `DONE`, tampilkan **Semua fase selesai**. Kolom Status project
menyebut **Aktif / Ditahan / Project selesai** berdasarkan `Project.status`.
Kedua informasi tidak saling mengubah. Menyelesaikan project menampilkan fase
belum selesai untuk dikonfirmasi; tidak menutup fase otomatis.

Default urutan: `priority` menurun, lalu `opened_at` menurun.

Filter: status project, dan "yang menunggu saya" (project dengan ronde
ter-assign ke pengguna aktif dan berstatus `DRAFT`/`SENT`), serta **Perlu
penugasan** (lead tidak tersedia atau ronde/tugas terbuka tanpa assignee yang
tersedia). Status pengguna nonaktif tetap terbaca pada riwayat. Blok Perlu
penugasan juga tampil di project detail bagi pembaca project; pengubahan hanya
bagi pemegang permission yang sesuai. Tidak perlu dashboard baru.

## 5. Halaman: Client

Daftar sederhana + dialog create/edit. Tidak ada kolom relasi ke Master Data —
Client milik StudioFlow (`studioflow.md` §4).

Client dengan project hidup: tombol arsip tidak dirender, dan detailnya
menyebutkan jumlah project yang menahannya.

## 6. State wajib di setiap layar

| State | Perlakuan |
|---|---|
| Loading | Skeleton mengikuti bentuk konten, bukan spinner tengah |
| Empty (belum ada project) | Ajakan satu kalimat + tombol buat project |
| Empty (fase belum ada ronde) | "Belum mulai" + tombol Mulai ronde, bukan ruang kosong |
| Error | Pesan aman dan bisa ditindaklanjuti; error provider mentah tidak pernah tampil |
| Permission denied | Rute ditolak, bukan halaman kosong |
| Destructive | AlertDialog aplikasi, bukan `confirm()` bawaan browser |

## 7. Komponen StudioFlow-local

Dibuat di `src/apps/studioflow/components/`, **tidak** dipromosikan ke UI Engine
karena mengandung kebijakan bisnis; mekanisme generik tetap milik UI Engine:

- `PhaseRow` — baris fase yang bisa dibuka, dengan status dan umur
- `IterationRow` — kartu ronde beserta checklist poinnya
- `SendDialog` dan `ResponseDialog`
- `GeneralTaskBlock` — blok pinned di atas

## 8. Yang sengaja tidak dibuat

Tidak ada dashboard lintas project, tidak ada kalender, tidak ada grafik
progress, tidak ada notifikasi, tidak ada drag-drop file (diblokir storage,
`studioflow.md` §5), dan tidak ada tampilan timeline/Gantt.

Semuanya menarik. Tidak satu pun menjawab tiga pertanyaan di §1.2.

## 9. Provenance dan konflik

Poin klien menampilkan teks kerja dan akses ke teks asli/jawaban sumber. Dalam
draft, “Tarik poin” meminta alasan, bukan menghapus. Poin ditarik atau sumbernya
dikoreksi tetap dapat dibuka dan tidak dihitung sebagai poin aktif yang belum
selesai. Ronde yang sudah dikirim mempertahankan snapshot saat pengiriman.

Dua pengguna menyimpan jawaban/koreksi bersamaan: hanya satu berhasil; yang lain
mendapat pesan muat ulang dengan input belum tersimpan tetap tersedia. Riwayat
menampilkan jawaban efektif, jawaban terdahulu, alasan koreksi, aktor, dan waktu.
Aksi pending menolak klik ganda; gagal simpan tidak terlihat sebagai sukses.
