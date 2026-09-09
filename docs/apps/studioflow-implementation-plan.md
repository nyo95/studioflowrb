# StudioFlow Implementation Plan

**Status:** READY FOR EXECUTION — pemecahan work order diserahkan ke navigator
**Versi:** R0.1
**Tanggal:** 2026-09-09
**Dibaca bersama:** `studioflow.md`, `studioflow-project-contract.md`,
`studioflow-ux-spec.md`, `studioflow-schedule-contract.md`,
`studioflow-mom-contract.md`, `studioflow-work-orders.md`

Dokumen ini menetapkan **aturan, urutan fase, dan gerbang mutu**. Ia sengaja
tidak memecah pekerjaan menjadi work order — itu tugas navigator. Yang dikunci di
sini adalah *apa yang tidak boleh berubah*; bagaimana pekerjaannya dipotong
adalah keputusan navigator.

---

## 1. Empat aturan pemilik (2026-09-08)

1. **Legacy adalah patokan, read-only.** Dibaca sebagai bukti perilaku bisnis,
   tidak pernah disalin sebagai implementasi. Tidak ada koneksi ke database
   legacy, tidak ada migrasi data, tidak ada file legacy yang dipindahkan.
2. **Semua dibangun ulang di atas foundation rebuild.** Core, Utilities, dan UI
   Engine yang sudah ada adalah basisnya. Tidak ada foundation kedua, tidak ada
   pengganti privat di dalam StudioFlow.
3. **Tema boleh berkembang.** Token boleh ditambah dan dipakai ulang, dan UI
   Engine boleh diperluas — dengan syarat Master Data dan BQ **tidak mengalami
   regresi** (§5).
4. **Semua tunduk pada kontrak.** Kalau implementasi dan kontrak berbeda, yang
   salah adalah implementasinya — kecuali navigator mengubah kontraknya lebih
   dulu, secara eksplisit.

## 2. Aturan eksekusi (anti-halusinasi)

1. **Jangan mengambil keputusan produk sendiri.** Semua ada di kontrak. Kalau
   tidak jelas, **berhenti dan lapor** — jangan mengasumsikan.
2. **Jangan menambah tabel, kolom, state, atau permission yang tidak ada di
   kontrak.** Kalau terasa perlu, itu perubahan kontrak, bukan detail
   implementasi.
3. **Jangan baca tabel `master_data.*` langsung.** Satu-satunya jalan adalah
   `src/apps/masterdata/public/`.
4. **Tidak ada FK lintas schema.** Rujukan lintas app selalu `String` biasa yang
   boleh menunjuk baris yang sudah hilang, dengan snapshot sebagai identitas.
5. **Sebelum menyatakan ada kekurangan di shared layer, buka dulu kodenya.**
   Draf kontrak ini pernah mengklaim Master Data tidak punya pembacaan yang
   ternyata ada, dan pernah mengklaim UI Engine tidak punya dialog yang ternyata
   ada. Klaim gap wajib menyebut file dan baris.
6. **Kalau sebuah slice memaksamu menyunting file milik Master Data atau BQ,
   berhenti.** Itu tanda desainnya salah, bukan izin untuk melanjutkan.

## 3. Yang sudah dikunci vs yang navigator putuskan

| Sudah dikunci di kontrak — jangan diubah | Diputuskan navigator |
|---|---|
| Model domain, nama tabel dan kolom, invariant | Granularitas dan penomoran work order |
| Empat state phase, lima state ronde, dua state task | Susunan file di dalam `src/apps/studioflow/` |
| Aturan pembukaan ronde dan penomoran | Pemecahan komponen React |
| Alur kirim, jawaban, draft jawaban, koreksi, void | Urutan pekerjaan **di dalam** satu fase |
| Tiga perlakuan file, aturan retensi, folder virtual | Organisasi berkas test |
| Kosakata permission (delapan; Schedule/MoM ditunda) | Nomor revisi dan isi changelog |
| Aturan snapshot dan batas lintas app | Bentuk read model dan query |
| Urutan fase dan gerbangnya (§4) | Apakah satu fase jadi satu WO atau beberapa |

## 4. Urutan fase dan gerbang

Fase tidak boleh dibalik. Sebuah fase dibuka hanya kalau gerbang fase sebelumnya
terpenuhi. **Berapa work order per fase adalah keputusan navigator.**

| Fase | Isi | Gerbang keluar |
|---|---|---|
| **SF-F0** Registrasi & shell | Registrasi app + delapan permission, route group, nav, halaman kosong ber-permission. Tanpa tabel | Tanpa `studioflow.access` rute ditolak. Nav Master Data dan BQ tidak berubah |
| **SF-F1** Schema & fondasi | `studioflow` schema, Client, Project, phase template + snapshot per project, migrasi pertama | Membuat project menghasilkan phase sesuai template. `code` unik dan server-generated. Migrasi hanya menyentuh schema `studioflow` |
| **SF-F2** Ronde & file tercatat | Iteration, aturan penomoran, state phase, drop file `RECORDED`, folder template, penamaan standar, nama-berikutnya | Seret `.skp` tanpa storage apa pun: ronde terbuka, phase maju, nama muncul. Nomor gapless di bawah tekanan konkuren |
| **SF-F3** Pertukaran klien | Kirim, catat jawaban (termasuk draft), koreksi, hentikan ronde, poin revisi + provenance, ACC internal opsional | Seluruh skenario §16 kontrak yang menyangkut jawaban klien lulus, termasuk rollback transaksi dan balapan koreksi |
| **SF-F4** Task & permukaan project | Satu task vocabulary milik project, optional phase scope, lampiran task, halaman project tunggal, filter phase | Semua pekerjaan satu project terjangkau dari satu halaman. Task project-level tetap terlihat; task dari konteks fase otomatis mendapat phase scope |
| **SF-F5** Library global | Brand discovery melalui Master Data public port: hashtag, brand, category/brand-category; reusable catalog read model | Pencarian hashtag, brand, dan kategori menghasilkan brand/katalog yang benar tanpa direct cross-schema read |
| **SF-F6** Menunggu Saya | Read model lintas project (§10.2 kontrak). Tanpa tabel baru | Desainer dengan beberapa project tahu apa yang menunggunya tanpa membuka satu project pun |
| **SF-F7** Project Catalogue/Schedule + MOM | Project-owned catalogue/schedule and MoM surfaces using their approved contracts | Project detail exposes catalogue/FFNI and MOM without forcing either into the phase task model |
| **SF-F8** Pass tema | Perubahan token yang mengenai app lain, dikerjakan sekaligus dan sadar (§5.3) | Master Data dan BQ terbukti tidak berubah tampilannya, atau perubahannya disetujui pemilik |
| **SF-F9** File `STORED` | Byte untuk PDF/render/survey, lewat shared storage port | Unggah, unduh bertanda tangan, pelepasan byte yang tergantikan; file terkirim tidak pernah dilepas |
| **Ditunda** | SketchUp exchange, arsip Drive (`LINKED`), client-facing links, project archival, legacy migration | Tidak menghalangi Library, project catalogue, atau MOM karena kontrak inti mereka sudah tersedia |

**Catatan urutan.** SF-F5 sengaja setelah SF-F4 karena ia membaca ronde dan task;
tapi ia adalah pintu masuk harian aplikasi, jadi jangan digeser ke belakang lagi.
SF-F6 sengaja **tidak** disebar ke fase lain — alasannya di §5.3.

## 5. Aturan evolusi tema dan UI Engine

Aturan pemilik nomor 3 mengizinkan tema berkembang. Bagian ini yang menjaga agar
izin itu tidak menjadi regresi diam-diam di Master Data dan BQ.

### 5.1 Yang aman, kapan saja

| Tindakan | Kenapa aman |
|---|---|
| Menambah token baru | Tidak ada konsumen lama yang membacanya |
| Memakai ulang token yang sudah ada | Justru yang diharapkan |
| Menambah komponen UI Engine yang benar-benar generik | Aditif; tidak ada yang berubah bagi konsumen lama |
| Membuat komponen lokal StudioFlow yang **menyusun** primitif UI Engine | Kebijakan bisnis memang milik app |

### 5.2 Yang dilarang

- **Mem-fork komponen UI Engine ke dalam StudioFlow.** Kalau yang generik kurang,
  perluas yang generik; jangan menyalinnya.
- **Menaruh kebijakan bisnis StudioFlow ke dalam shared layer.** Aturan ronde,
  provenance poin, dan retensi file tidak menjadi milik bersama hanya karena
  memakai pola React atau tabel yang sama.
- **Menulis warna, spasi, atau tipografi secara hardcode.** Semua lewat token.

### 5.3 Yang berisiko — dan kenapa dikumpulkan di SF-F6

Mengubah **nilai token yang sudah ada** atau **API/tampilan bawaan komponen yang
sudah ada** langsung mengenai Master Data dan BQ, karena merekalah konsumen
sekarang.

Kalau perubahan seperti itu disebar sedikit-sedikit di sepanjang SF-F1…SF-F5,
setiap slice membawa dua jenis risiko sekaligus — fitur baru dan tampilan app
lain berubah — dan waktu ada yang rusak, tidak ketahuan yang mana penyebabnya.

Maka: **penambahan token bebas kapan saja, perubahan token dikumpulkan di
SF-F6.** Satu slice, satu jenis risiko, satu pemeriksaan visual menyeluruh.

Setiap perubahan di SF-F6 wajib menyebut layar Master Data dan BQ mana yang
terpengaruh, dan menunjukkan bahwa layar itu masih benar — bukan sekadar masih
bisa dirender.

### 5.4 Kalau shared layer memang kurang

Ikuti CORE §14 dan UI_ENGINE §16: sebutkan konsumen nyata, buat perubahan
kontrak yang sempit, sediakan regression check di shared layer, baru dikonsumsi.
Jangan melebarkan Core atau UI Engine untuk alur kerja yang belum ada.

## 6. Perlindungan Master Data dan BQ

Master Data dan BQ adalah **aplikasi hidup yang harus dilindungi**, bukan kode
untuk ditiru atau dirombak.

| Aturan | Cara memeriksanya |
|---|---|
| Tidak ada file di `src/apps/masterdata/**` atau `src/apps/bq/**` yang disunting oleh slice StudioFlow | `git diff --stat` per slice |
| File bersama yang boleh disentuh hanya `src/app/app-registrations.ts` dan layout platform — dan hanya secara aditif | Diff-nya harus berupa penambahan entri/baris, bukan perubahan yang sudah ada |
| Migrasi hanya menyentuh schema `studioflow` | Tidak ada identifier `platform`, `master_data`, `bq` di luar komentar |
| Test Master Data dan BQ lulus sebelum dan sesudah tiap slice | Dijalankan dua kali, hasilnya dicatat |
| Perubahan UI Engine menyebut layar terdampak dan membuktikannya utuh | Bagian dari catatan slice, bukan klaim lisan |

Kalau salah satu terlanggar: **berhenti dan lapor.** Jangan diperbaiki sambil
jalan — pelanggaran itu sendiri adalah informasi.

## 7. Database dan migrasi

Aturan lengkap ada di `studioflow-work-orders.md` §5. Ringkasnya:

- Target adalah PostgreSQL lokal; StudioFlow menambah schema **keempat**.
- Migrasi **aditif saja**: `CREATE SCHEMA`, `CREATE TYPE`, `CREATE TABLE`,
  `CREATE INDEX`. Tidak ada `ALTER`/`DROP` pada schema app lain.
- `prisma migrate deploy` **tidak** ditambahkan ke script build. Perubahan
  struktur tetap tindakan manusia yang sadar.
- Yang dipakai bersama adalah **buku catatan migrasi**, satu per database. Migrasi
  StudioFlow yang gagal di tengah mengunci antrean rilis Master Data dan BQ juga
  — radius ledakannya adalah kemampuan merilis, bukan data.

## 8. Gerbang mutu tiap slice

Wajib, dan hasilnya dicatat. Yang tidak bisa dijalankan dilaporkan sebagai
keterbatasan, bukan sebagai lulus.

1. `npm run typecheck` bersih
2. `npx eslint` bersih pada berkas yang tersentuh, termasuk boundary rule
3. Unit/integration test untuk aturan domain slice ini
4. **Regression Master Data dan BQ** (§6)
5. `npm run build` sukses
6. Pemeriksaan browser nyata: desktop, rail terkuncup, viewport sempit; keadaan
   loading, kosong, error, permission-denied, dan destruktif
7. **Pemetaan ke skenario kontrak.** Tiap slice menyebut baris §16 mana yang
   sekarang terbukti. Memakai komponen yang benar bukan bukti alur kerja benar.

## 9. Definition of done per fase

Sebuah fase selesai kalau:

- gerbang keluarnya di §4 terpenuhi dan bisa diperagakan di browser;
- setiap aturan kontrak yang disentuhnya punya test yang gagal kalau aturannya
  dilanggar — bukan hanya test yang lulus saat benar;
- tidak ada perilaku baru yang tidak tertulis di kontrak;
- catatan changelog menyebut lingkup, perubahan kontrak/migrasi, pemeriksaan yang
  dijalankan, dan keterbatasan yang tersisa.

## 10. Checklist sebelum handoff akhir

- [ ] Seluruh skenario §16 kontrak project terpetakan ke test atau pemeriksaan browser
- [ ] Tidak ada perilaku legacy yang dipertahankan tanpa klasifikasi KEEP/FIX/MERGE/PURGE
- [ ] Master Data dan BQ terbukti tidak berubah perilakunya
- [ ] Tidak ada `any`, tidak ada Prisma langsung di komponen route, tidak ada kalkulasi domain di client
- [ ] Semua permission dites pada jalur yang ditolak, bukan hanya yang diizinkan
- [ ] Tidak ada token hardcode dan tidak ada komponen UI Engine yang di-fork
- [ ] Domain yang ditunda tidak meninggalkan folder, dependency, atau export kosong
