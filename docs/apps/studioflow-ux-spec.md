# StudioFlow UX/UI Specification

**Status:** ACTIVE REFERENCE — partially implemented; `../alignment.md` and
current owner instructions supersede conflicting interaction details
**Versi:** R0.3 — penegasan konsumsi foundation R7.08
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

Gunakan public surface `@platform/ui_engine`: `PageShell`, `PageHeader`,
`DirectoryShell`, `DataTable`, `Field`, `Combobox`, `InlineEdit`, `DraftDialog`,
`ConfirmDialog`, `RowActionMenu`, dan state standar. App masuk melalui shell
terautentikasi yang sudah ada; navigasi app berupa konfigurasi/content.

Project/Client List memakai pola directory yang sudah dipakai aplikasi rebuild.
Project Detail mengomposisi halaman dan section yang tersedia untuk TODO, fase,
dan ronde. Dialog kirim/jawaban memakai kerangka dialog dan perlindungan draft
bersama; StudioFlow hanya memasok isi, validasi bisnis, dan aksi penyimpanan.
Tidak membuat modal, confirmation hook, table engine, atau page frame baru.

Pemilihan komponen harus cocok dengan perilaku yang diperlukan. Jika komponen
bersama belum memenuhi kebutuhan generik, catat gap sempit lalu perbaiki di
UI Engine; jangan menyalin implementasinya ke app. Peta bukti tersedia di
`studioflow-project-contract.md` §13.0. Reuse tidak menggantikan pemeriksaan
alur nyata: keyboard, input belum tersimpan, loading/error, dan viewport sempit.

Warna, spasi, dan tipografi memakai design token dari CSS variables. Tidak ada
warna hardcode. Densitas mengikuti `DESIGN.md`.

## 2a. Halaman: Menunggu Saya (layar pembuka)

Ini halaman pertama yang dibuka tiap pagi, bukan daftar project. Desainer dengan
delapan project tidak berpikir per-project — ia berpikir *"hari ini ngapain"*.

```
┌────────────────────────────────────────────────────────────┐
│ Menunggu saya                                               │
├────────────────────────────────────────────────────────────┤
│ Sociolla Funan   · 3D · D4      belum digarap    · 2 hari   │
│ Alam Sutera      · CD · CD2     dari drafter     · 1 hari   │
│ Sociolla Funan   ○ Telepon klien soal handle                │
├────────────────────────────────────────────────────────────┤
│ Menunggu klien                                              │
│ Bintaro House    · 3D · D3      dikirim          · 9 hari   │
├────────────────────────────────────────────────────────────┤
│ Belum ada penanggung jawab                                  │
│ Alam Sutera      · Layout · Layout 2                        │
└────────────────────────────────────────────────────────────┘
```

Urut dari yang **paling lama menganggur**, bukan dari tanggal jatuh tempo. Yang
sembilan hari menunggu klien harus terasa mengganggu.

Sengaja **tidak** ada: filter tersimpan, auto-hide setelah 7 hari, dan feed semua
kejadian. Itu yang membuat Today's View legacy melar sampai tidak terbaca. Yang
ada cuma: punya saya, belum selesai, yang tertua di atas.

Ronde yang di-assign ulang oleh drafter muncul di sini. Itulah sinyal serah
terima — tidak perlu status review internal untuk menyatakannya.

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

### 3.8b Jawaban klien bisa dicicil

Feedback jarang datang sekaligus. Dialog Catat jawaban punya **Simpan sebagai
draft**: poin ditambah sesuai tanggal datangnya, ronde tetap "nunggu klien", dan
umurnya terus berjalan.

Selama draft tidak terjadi apa-apa — tidak ada ronde terbuka, fase tidak bergerak.
Baru waktu **Simpan jawaban** ditekan, seluruh konsekuensinya jalan.

Draft ditampilkan sebagai `menyusun jawaban · 2 poin` di baris ronde, supaya jelas
bedanya dengan ronde yang belum dijawab sama sekali.

### 3.8c ACC internal

Tombol **ACC** di baris ronde, untuk pemegang `iteration.review`. Sekali klik:
"Di-ACC Budi · 8 Sep". Tidak mengubah status ronde, tidak masuk status fase.

Kalau phase-nya disetel `requires_internal_approval` dan belum ada ACC, dialog
Kirim memperingatkan — dan tetap mengizinkan lanjut, sama seperti poin revisi.

Untuk ronde yang tidak butuh ACC, **tidak ada apa pun di layar.** Fitur ini tidak
menagih perhatian saat tidak dipakai.

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
| Destructive | `ConfirmDialog` dari UI Engine dengan alasan/konsekuensi milik app |

## 6a. Menyeret file

Satu gerakan, dan sebisa mungkin tanpa pertanyaan.

### 6a.1 Yang terjadi saat file dilepas

1. Aplikasi membaca **nama, ukuran, dan tanggal** file — tanpa mengunggah apa pun.
2. Ekstensi menentukan foldernya dari template (`.skp` → folder 3D). Kalau
   foldernya jelas, **tidak ada dialog sama sekali.**
3. Kalau fase itu belum punya ronde terbuka, ronde baru terbuka. Kalau sudah,
   file bergabung ke ronde itu — nomornya tidak bertambah.
4. Nama standar ditampilkan beserta tombol salin:
   `20260908 Sociolla Funan D1.skp`.

Langkah 4 harus jujur. Untuk file kerja aplikasi **tidak** mengganti nama file di
komputermu — browser tidak bisa. Ia menunjukkan nama yang benar untuk kamu salin.
Jangan pernah menulis "berhasil diganti nama" untuk file `RECORDED`.

### 6a.2 Kapan bertanya

Hanya kalau tidak bisa disimpulkan. PDF bisa datang dari klien (`IN`) atau
disiapkan untuk keluar — di situ baru muncul satu pertanyaan, dengan tebakan
sistem sudah terpilih:

```
PDF ini apa?
  (•) Dari luar — masuk ke IN
  ( ) Dari kantor untuk dikirim
      └ ☐ sudah dikirim ke klien
```

**Tidak pernah ada pertanyaan "internal atau external".** Jawabannya sudah
mengalir dari §5.3: kalau ronde terakhir sudah terkirim, file berikutnya membuka
nomor baru; kalau belum, ia bergabung. Menanyakannya berarti meminta kamu
menyatakan ulang yang sistem sudah tahu.

Centang "sudah dikirim" ada karena kamu biasanya mengirim lewat WhatsApp
*sebelum* membuka aplikasi. Mencentangnya menyelesaikan aksi Kirim di dialog yang
sama — satu dialog, bukan dua layar. Aturannya tidak berubah: yang menutup ronde
tetap aksi Kirim, bukan drop-nya.

`.skp`, `.dwg`, dan format yang jelas satu arah **tidak pernah ditanya.** Kalau
setiap file memunculkan dialog, aplikasi cuma memindahkan kelelahan dari
mengetik status ke menutup pertanyaan.

### 6a.2b Banyak file sekaligus

Blok lima belas file dari folder unduhan WhatsApp, lepas semuanya, klasifikasi di
**satu layar** — bukan lima belas dialog.

Yang tidak jelas foldernya mendarat di **Belum disortir**, tidak ditolak dan
tidak memaksa keputusan saat itu juga. File di sana sudah tercatat: sudah punya
nama, tanggal, dan pemilik. Menyortirnya nanti memberi folder, bukan membuat
catatannya.

Merapikan filing adalah alasan aplikasi ini dibuat. Kalau memasukkan file ke sini
lebih repot daripada membiarkannya di WhatsApp, aplikasinya gagal di alasan
keberadaannya sendiri.

### 6a.2c Nama muncul sebelum filenya ada

Di tiap ronde ada baris nama berikutnya dengan tombol salin:

```
File berikutnya:  20260908 Sociolla Funan D1.skp   [salin]
```

Kamu Save As dengan nama itu langsung dari SketchUp. Ini urutan kerja desainer
yang sebenarnya — menamai saat menyimpan, bukan menyeret dulu lalu rename.

### 6a.3 Mengganti file kerja

Menyeret file kerja pengganti ke ronde yang sama menaikkan `D1.1` → `D1.2`.
Yang lama ditandai tergantikan. Ronde-nya tidak tutup dan nomornya tidak naik.

**Menyeret file tidak pernah menutup ronde.** Menandai file "untuk dikirim"
hanya menyiapkannya; tombol Kirim yang menutup, dan file itu sudah terpasang di
dialognya. Satu klik lagi, dan klik itulah catatan resmi bahwa barang keluar
studio.

### 6a.4 Tampilan "yang sudah dikirim"

Bukan folder. Daftar hasil penyaringan file bertanda terkirim, dikelompokkan per
ronde — bentuk yang selama ini kantor buat manual sebagai subfolder
`20260906 Sociolla Funan D1` di dalam `OUT`.

Folder `OUT` tidak ada di aplikasi ini. Layout PDF tinggal di folder Layout dan
bertanda "dikirim di Layout 1" — satu file, dua keterangan, nol salinan.

## 7. Komponen StudioFlow-local

Dibuat di `src/apps/studioflow/components/`, **tidak** dipromosikan ke UI Engine
karena mengandung kebijakan bisnis; mekanisme generik tetap milik UI Engine:

- `PhaseRow` — baris fase yang bisa dibuka, dengan status dan umur
- `IterationRow` — kartu ronde beserta checklist poinnya
- `SendDialog` dan `ResponseDialog`
- `GeneralTaskBlock` — blok pinned di atas
- `WaitingOnMeList` — daftar lintas project (§2a)
- `DropTray` — lepas banyak file + kotak belum disortir

## 8. Yang sengaja tidak dibuat

Tidak ada dashboard lintas project, tidak ada kalender, tidak ada grafik
progress, tidak ada notifikasi, dan tidak ada tampilan timeline/Gantt.

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
