# Diskusi penyimpanan dan akses dari luar

Plan: `DISCUSS-STORAGE-TUNNEL-01`
Tanggal pemeriksaan: 2026-10-09
Peran: Backend Executor, lokasi kantor

## Ringkasan untuk owner

1. Folder penyimpanan boleh menjadi pengaturan Platform, tetapi nilai baru jangan langsung aktif ketika disimpan.
2. Sistem harus menyalin seluruh isi, memeriksa ulang setiap file, lalu baru berpindah; bila satu file gagal, folder lama tetap aktif.
3. Nilai env tetap wajib sebagai titik awal dan jalur pemulihan; gangguan database tidak boleh diam-diam memindahkan aplikasi ke folder lain.
4. Folder rumah dan kantor memang terpisah karena masing-masing memakai database dan env lokal yang terisolasi.
5. Tautan gambar lama tetap dapat dipakai setelah pindah selama kunci dan isi file sama; alamatnya tidak menyimpan nama folder.
6. Semua unggah, pembaca file, pemakaian ruang, dan pekerjaan bersih-bersih harus memakai satu penentu folder yang sama.
7. Untuk akses dari luar, pilihan utama saya adalah Cloudflare Tunnel bernama + Cloudflare Access, bukan membuka port router.
8. Alasannya: dapat dibuka dari browser, HTTPS tersedia, ada pagar login kedua, dan konektornya dapat hidup sebagai layanan Windows.
9. Tailscale lebih aman dan lebih sederhana bila akses hanya untuk sedikit perangkat tim yang semuanya boleh dipasangi aplikasi Tailscale.
10. Server publik harus memakai hasil build produksi, hidup otomatis lewat Task Scheduler, dan hanya mendengarkan koneksi lokal.
11. Aplikasi dan tunnel sebaiknya dua proses yang diawasi terpisah, dengan satu perintah pemeriksaan/start/stop untuk operator.
12. Sebelum dibuka, rahasia sesi, akun owner, pembatas login, cadangan database+folder, health check, dan log harus diperiksa.

## Topik 1 — Folder penyimpanan sebagai pengaturan

### Temuan repositori

#### Nilai, pemeriksaan awal, dan tempat pengaturan

- `src/platform/infrastructure/storage/storage-root.ts` memilih `STUDIOFLOW_STORAGE_ROOT`; hanya development yang boleh jatuh ke `<checkout>/.storage`. Production menolak nilai kosong, relatif, drive root, lokasi di dalam checkout, atau folder yang tidak dapat ditulis.
- `src/instrumentation.ts` menjalankan pemeriksaan env dan kemampuan tulis sebelum registry serta sweep dimulai. Pemeriksaan ini belum membaca database.
- `prisma/schema/platform.prisma` sudah mempunyai singleton bertipe `PlatformGeneralSettings`. `src/platform/core/settings/index.ts` memberi pola yang tepat: izin `platform.settings.read/manage`, transaksi, audit delta aman, dan no-op tanpa audit. Tidak ada tabel key/value umum, dan itu baik.
- `src/app/(platform)/settings/general/page.tsx` dan `actions.ts` adalah permukaan Platform yang sudah memakai izin tersebut. UI akhirnya tetap milik Lead.
- `.env.rumah` dan `.env.kantor` dipilih per mesin, dan pedoman repositori menetapkan database keduanya terisolasi. Jadi nilai yang disimpan di singleton database secara alami berbeda per komputer. Pemeriksaan ini tidak menjalankan perintah database.

**Rekomendasi tempat nilai:** tambah kolom nullable bertipe jelas, misalnya `storage_root_override`, pada singleton `PlatformGeneralSettings`; jangan membuat tabel key/value. `null` berarti memakai env. Pekerjaan salin yang dapat dilanjutkan setelah crash memerlukan tabel operasional kecil tersendiri (misalnya satu job + manifest item), karena status, sumber, tujuan, checksum, kegagalan, dan kemajuan bukan bagian dari General Settings.

**Aturan bootstrap:** env tetap wajib dan divalidasi terlebih dahulu di production. Setelah database tersambung dan migrasi sudah terpasang, resolver membaca override dan memvalidasi folder efektif sebelum readiness dinyatakan sehat atau sweep dimulai. Bila database tidak terjangkau, aplikasi harus berstatus belum siap/gagal tertutup; jangan diam-diam memakai env, karena itu dapat membuat semua file terlihat hilang. Bila kolom migrasi belum ada, startup/deploy juga harus gagal dengan pesan bahwa migrasi belum diterapkan, bukan menganggap override kosong.

#### Semua pemakai root dan object storage

| Pemakai | Perilaku sekarang | Yang harus memakai resolving layer |
| --- | --- | --- |
| `src/platform/runtime.ts` | Menghitung root sekali saat module load; membentuk private storage, public Brand mark storage, dan usage reader sekali | Ya. Ekspor service boleh tetap singleton, tetapi adapter di belakangnya harus mengambil satu snapshot root/generation untuk satu operasi |
| `src/instrumentation.ts` | Hanya memeriksa env saat boot, lalu memulai sweep | Ya. Pertahankan pemeriksaan env awal, kemudian periksa folder efektif sesudah DB siap sebelum readiness/sweep |
| `src/app/api/platform/assets/private/route.ts` | Membaca env langsung saat setiap GET | Ya. Token URL hanya menandatangani key+expiry, bukan folder; route harus membaca root aktif dari resolver yang sama |
| `src/app/api/platform/assets/public/[...key]/route.ts` | Membaca env langsung saat setiap GET | Ya. URL Brand mark tetap sama, tetapi byte harus dibaca dari root aktif yang sama |
| `src/platform/infrastructure/storage/usage.ts` melalui `storageUsage` | Reader menangkap root lama dan cache satu menit | Ya. Cache harus dipisah berdasarkan generation/root dan dihapus saat aktivasi |
| `src/platform/core/settings/brand-mark.ts` dan settings service | Menulis/menghapus Brand mark lewat `brandMarkStorage`; login, shell, dan halaman cetak membuat URL publik | Ya, lewat public adapter dinamis; pembuat URL sendiri tidak perlu berubah format |
| `src/platform/core/messenger/index.ts` | Upload, signed read, dan hapus lampiran lewat `objectStorage` | Ya. `scripts/cleanup-messenger-attachments.ts` juga wajib memakai resolver yang sama; saat ini script menghitung env sendiri |
| `src/apps/studioflow/runtime.ts` | Menyuntikkan satu `objectStorage` ke seluruh StudioFlow dan sample-request command | Ya; jangan membuat resolver privat di StudioFlow |
| `src/apps/studioflow/phases/deliverables.ts` | Upload stream/byte dan signed read | Ya |
| `src/apps/studioflow/phases/notes.ts` | Upload dan signed read gambar catatan | Ya |
| `src/apps/studioflow/mom/service.ts` | Upload dan signed read gambar MOM | Ya |
| `src/apps/studioflow/presentation/service.ts` | Upload, copy antarkey, signed read | Ya; source dan destination harus dipaku ke generation yang sama selama satu copy |
| `src/apps/studioflow/ideas/service.ts` | Upload, copy ke Schedule/Presentation, signed read | Ya; aturan generation yang sama berlaku |
| `src/apps/studioflow/schedule/service.ts` | Upload dan signed read gambar opsi | Ya |
| `src/apps/studioflow/asset-cleanup.ts`, `asset-sweep.ts`, dan archive retention | Menghapus per key dan menyimpan kegagalan hanya berdasarkan key | Ya. Satu batch harus dipaku ke satu generation; sweep dijeda pada cutover agar ledger lama tidak menghapus salinan di root yang salah |
| `src/platform/infrastructure/storage/supabase.ts` | Adapter cloud diparkir dan tidak memakai local root | Tidak untuk slice lokal; jangan mengaktifkannya atau menambah dependency dalam pekerjaan ini |

Ada bahaya balapan yang tidak selesai hanya dengan cache pendek. Contoh: unggah byte selesai ke folder lama, lalu setting diaktifkan sebelum baris database tersimpan; database akhirnya menunjuk key yang hanya ada di folder lama. Karena itu setiap operasi harus memegang snapshot root/generation, dan aktivasi perlu pagar tulis singkat: hentikan unggah/copy/delete baru, tunggu operasi aktif selesai, lakukan pemeriksaan delta terakhir, aktifkan, invalidasi cache, lalu buka kembali.

#### Signed URL, Brand mark, dan pekerjaan bersih-bersih saat folder berubah

- Signed URL privat tidak menyimpan path lokal. URL lama tetap sah secara kriptografis dan akan membaca key yang sama dari root aktif. Ia menjadi 404 bila file belum tersalin, sehingga aktivasi sebelum verifikasi penuh tidak aman.
- URL Brand mark publik juga hanya berisi key. Cache browser satu hari (`Cache-Control: public, max-age=86400`) tidak menghalangi cutover bila byte identik; jangan gunakan key sama untuk byte berbeda.
- Usage reader sekarang dapat menampilkan angka root lama sampai satu menit. Cache harus di-key oleh generation/root dan invalidasi harus terjadi pada aktivasi.
- Sweep StudioFlow mulai sekitar 10 detik setelah boot dan kemudian harian. Messenger mempunyai cleanup CLI terpisah. Keduanya harus mengambil lease/snapshot satu root per batch dan tidak berjalan saat final cutover.
- Ledger `SfAssetCleanupFailure` hanya menyimpan key, bukan root. Cutover aman harus menuntaskan/menjeda retry lama sebelum aktivasi. Menambahkan root ke ledger hanya diperlukan bila produk kelak mengizinkan dua root aktif bersamaan; rekomendasi ini tidak mengizinkannya.

### Bentuk perpindahan file yang paling aman

1. Owner memasukkan folder tujuan sebagai **calon folder**, bukan langsung sebagai folder aktif.
2. Server memeriksa: absolute, bukan drive root, di luar checkout, bukan root aktif, dapat dibuat/ditulis, ruang bebas memadai, dan bukan symlink yang keluar dari tujuan.
3. Tampilkan ringkasan awam untuk folder lama dan baru: jumlah file, ukuran, ruang bebas, serta peringatan bila scan dipotong. Untuk keputusan pindah, scan tidak boleh dipotong.
4. Job membuat manifest semua file di bawah `private-assets` dan `public-assets`, lalu menyalin tanpa menimpa file berbeda. Setiap file diverifikasi dengan ukuran **dan SHA-256**. Checksum perlu karena ukuran sama belum membuktikan isi sama.
5. Kemajuan disimpan per file sehingga restart melanjutkan file yang belum lengkap. File sementara harus mempunyai nama terpisah, lalu rename atomik setelah checksum cocok.
6. Bila tujuan sudah punya key dengan checksum sama, tandai selesai. Bila isinya berbeda, tandai konflik dan jangan timpa.
7. Bila ada kegagalan, laporkan nama kelompok/key yang aman, jumlah berhasil/gagal, dan alasan sederhana. Jangan aktifkan tujuan; root lama tetap melayani semua operasi. Retry hanya mengulang yang gagal.
8. Setelah salinan awal lengkap, ambil pagar tulis singkat, tunggu operasi storage aktif habis, scan delta, salin+verifikasi delta, jeda sweep, lalu ubah nilai aktif dan audit satu event cutover.
9. Invalidate cache, lakukan pembacaan uji dari private dan public root, lalu lepaskan pagar. Folder lama tidak dihapus atau dipindah otomatis.
10. Penghapusan folder lama hanya menjadi prosedur manual terpisah setelah masa observasi dan cadangan; bukan bagian tombol pindah.

Objek yang gagal disalin tetap aman di sumber. Layar harus mengatakan misalnya “12.418 file siap, 3 belum berhasil; StudioFlow masih memakai folder lama.” Jangan menawarkan aktivasi sebagian.

### Pilihan dan trade-off

| Pilihan | Kelebihan | Kekurangan | Putusan |
| --- | --- | --- | --- |
| Override nullable di General Settings + job cutover terpisah | Sesuai kepemilikan Platform, memakai izin/audit yang ada, env tetap default, aman dilanjutkan | Implementasi job dan pagar operasi lebih besar | **Direkomendasikan** |
| Daftar profil `rumah/kantor` dalam satu database | Berguna bila satu database berpindah mesin | Berlawanan dengan kenyataan saat ini: database tiap lokasi sudah terpisah; mudah memilih path milik mesin lain | Jangan untuk sekarang |
| Env tetap satu-satunya nilai + panel status baca-saja | Slice sangat kecil dan risiko rendah | Tidak memenuhi keinginan mengganti dari Settings; masih perlu edit file+restart | Layak sebagai slice pertama, bukan hasil akhir |
| Langsung simpan path dan resolver per-call | Terlihat sederhana, tanpa restart | Dapat membuat file hilang dari pandangan dan operasi menyeberang root | Tolak |

**Opsi yang direkomendasikan:** override nullable pada singleton settings, env sebagai default/rescue, calon tujuan disimpan sebagai job, dan aktivasi hanya setelah copy+checksum lengkap dengan pagar operasi singkat.

### File yang diperkirakan disentuh oleh rekomendasi

Daftar ini untuk Work Order berikutnya, bukan perubahan pada diskusi ini.

- Data dan migrasi: `prisma/schema/platform.prisma`, satu migration baru.
- Kontrak/service Platform: `src/platform/core/settings/index.ts`, tests settings, serta modul Platform baru untuk resolusi root dan job perpindahan.
- Adapter: `src/platform/infrastructure/storage/storage-root.ts`, `filesystem.ts`, `usage.ts` dan tests masing-masing.
- Komposisi: `src/platform/runtime.ts`, `src/instrumentation.ts`.
- Pembaca HTTP: kedua route di `src/app/api/platform/assets/`.
- Cleanup luar proses: `scripts/cleanup-messenger-attachments.ts` dan `docs/operations/LOCAL-PC-SCHEDULER.md`.
- Minimal backend wiring: action Settings General. Form/UX final tetap Lead.
- Bukti: integration tests settings/storage serta satu spec Playwright baru.

### Risiko

- Aktivasi terlalu dini membuat semua key valid tetapi file tampak hilang.
- Database mati tidak boleh memicu fallback diam-diam ke env.
- Root berubah di tengah put/copy/delete dapat memisahkan byte dan baris database.
- Tujuan berisi key berbeda dapat tertimpa bila copy tidak eksklusif dan tidak memakai checksum.
- Scan besar dapat lambat; progress dan resume wajib, dan hitungan terpotong tidak cukup untuk cutover.
- Path lokal akan masuk audit delta. Path bukan credential, tetapi hanya pemegang izin settings yang boleh melihat/mengubahnya.
- Cache public satu hari berarti perubahan byte dengan key sama dapat terlihat terlambat; migrasi wajib mempertahankan byte identik.

### Pengujian yang disarankan

- **Unit:** precedence override/null/env; validasi path; DB error fail-closed; cache per generation+invalidation; adapter mengunci root untuk satu operasi; symlink/path traversal; manifest, checksum, resume, konflik tujuan, ruang tidak cukup.
- **Integration:** izin read/manage, audit tanpa data rahasia, no-op; migrasi dari row lama; upload/read/remove untuk private+public setelah cutover; signed URL yang dibuat sebelum cutover tetap membaca byte yang sama; cleanup dan usage memakai root baru; kegagalan satu file tidak mengaktifkan tujuan; restart job melanjutkan.
- **Playwright (satu alur):** admin melihat root env aktif, memasukkan folder sementara, melihat preview, memulai copy, menunggu “selesai dan aktif”, lalu file lama dan upload baru sama-sama dapat dibuka tanpa restart. Gunakan storage sementara disposable milik test, bukan folder kantor.

### Slice berurutan, masing-masing satu commit dan aman sendiri

1. **Status baca-saja:** tampilkan sumber aktif (env), path yang disamarkan secukupnya, jumlah/ukuran/ruang, tanpa bisa mengganti. Berguna langsung untuk operasi dan tidak mengubah perilaku.
2. **Resolver dinamis tanpa override:** satukan runtime, dua asset route, usage, dan cleanup CLI di satu API resolver yang masih selalu menghasilkan env. Bukti bahwa tidak ada perubahan perilaku.
3. **Override bertipe + fail-closed:** migration/kolom nullable, read/manage/audit, validation, cache+invalidation, readiness; setting masih tidak boleh aktif tanpa job bila source berisi file.
4. **Job salin resumable:** manifest, copy eksklusif, checksum, progress, retry, konflik, dan laporan; belum mengaktifkan otomatis.
5. **Cutover terjaga:** pagar operasi, final delta, pause sweep, aktivasi+audit, invalidasi, probe, rollback sebelum pelepasan pagar.
6. **UI Lead + Playwright:** alur preview/copy/status yang sederhana, kata-kata awam, dan satu acceptance spec penuh.

## Topik 2 — Mencapai aplikasi dari mana saja

### Temuan repositori

- `package.json` menjalankan development di `0.0.0.0:3001`, tetapi `next start` belum menentukan host/port. Development tidak layak menjadi layanan publik.
- `next.config.ts` mengunci `allowedDevOrigins` ke IP kantor `172.16.1.163`. Nilai ini hanya untuk development dan harus menjadi env/list lokal tervalidasi, bukan alamat publik production.
- Konfigurasi Server Actions hanya mengatur batas body. Next membandingkan `Origin` dengan `Host`/`X-Forwarded-Host`; hostname proxy yang sah dapat ditambahkan lewat `serverActions.allowedOrigins`. Rujukan resmi: [Next.js serverActions](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions) dan [allowedDevOrigins](https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins).
- Cookie sesi sudah `httpOnly`, `sameSite=lax`, dan `secure` ketika `NODE_ENV=production` di `src/platform/core/auth/request.ts`. Mode publik wajib production; jangan menurunkan `secure` karena hop tunnel-ke-PC memakai HTTP lokal.
- `src/app/login/actions.ts` selalu membaca `x-forwarded-for`; `src/platform/core/auth/limiter.ts` baru mempercayainya bila `AUTH_TRUST_PROXY_CLIENT_IP` aktif. Saat mati, semua alamat berbagi bucket network lokal, tetapi bucket email tetap berlaku.
- Limiter PostgreSQL saat ini membatasi 5 percobaan per email dan 25 per network dalam 15 menit, blok 30 menit, serta gagal tertutup bila storage limiter rusak. Sesi idle 12 jam dan absolut 7 hari.
- Tidak ada public-origin tunggal, health endpoint khusus, atau runbook start/stop aplikasi publik. Tidak ditemukan asumsi runtime `localhost` lain yang memengaruhi URL aplikasi; kemunculan lain berada di tests atau pengamanan fetch internal.
- Development overlay dan HMR hanya relevan untuk `next dev`. Jangan menjanjikan HMR melalui tunnel publik; gunakan tunnel test sementara hanya untuk diagnosis terarah, lalu matikan.

### Perbandingan jalur akses

| Jalur | Biaya saat laporan | Usaha setup | Keamanan | Setelah PC restart | Penilaian |
| --- | --- | --- | --- | --- | --- |
| **Cloudflare named Tunnel + Access** | Tunnel dan Zero Trust mempunyai pilihan free; perlu akun dan idealnya domain yang dikelola Cloudflare | Sedang: domain/DNS, tunnel, policy email/identity, service Windows | Tidak membuka inbound port; Access memberi pagar identitas sebelum login StudioFlow | `cloudflared` didukung sebagai Windows service dan dapat otomatis hidup | **Pilihan utama** untuk browser dari mana saja |
| **Tailscale private** | Personal $0 untuk non-komersial hingga 6 user; bisnis mengikuti paket berbayar | Rendah-sedang: pasang/login di setiap PC/phone, ACL, unattended mode | Paling kecil permukaan publik karena hanya perangkat tailnet | Windows perlu “Run unattended”; service lalu tetap hidup setelah logout/reboot | Pilihan utama bila hanya perangkat tim |
| Tailscale Funnel | Termasuk fitur Tailscale yang memenuhi syarat | Sedang; HTTPS/ MagicDNS/policy, hostname `ts.net`, batas port/bandwidth | Menjadi publik; tidak sama dengan tailnet privat | Bergantung service dan konfigurasi Funnel | Bukan default; Cloudflare Access lebih cocok untuk browser publik berizin |
| ngrok | Free memberi development domain dan 1 GB transfer; custom domain ada pada paket bayar | Rendah untuk demo, sedang untuk service tetap | TLS dan policy tersedia, tetapi batas/biaya naik untuk pemakaian tetap | Agent perlu dijadikan service/task dan credential lokal | Bagus untuk demo, bukan pilihan operasi utama |
| Port-forward router + DDNS | DDNS bisa gratis/berbayar; biaya utama waktu dan risiko | Tinggi: router, firewall, TLS/reverse proxy, DDNS | Membuka origin langsung ke internet; salah konfigurasi paling berbahaya | Harus memulihkan app, proxy, DDNS updater, dan aturan jaringan | Tolak |

Sumber resmi yang memengaruhi perbandingan: [Cloudflare private web app](https://developers.cloudflare.com/cloudflare-one/setup/secure-private-apps/private-web-app/), [Cloudflare Tunnel sebagai Windows service](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/as-a-service/windows/), [Cloudflare Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/), [Tailscale pricing](https://tailscale.com/pricing), [Tailscale unattended Windows](https://tailscale.com/docs/how-to/run-unattended), [Tailscale Funnel](https://tailscale.com/kb/1223/funnel), dan [ngrok pricing](https://ngrok.com/pricing).

Quick Tunnel memakai URL acak dan ditujukan untuk development/test; jangan dijadikan alamat operasional. Named tunnel + Access memberi hostname stabil dan allowlist pengguna. Bila owner hanya perlu perangkat sendiri dan tim kecil, pilih Tailscale private karena bahkan halaman login StudioFlow tidak terlihat oleh internet.

**Opsi yang direkomendasikan:** Cloudflare named Tunnel + Cloudflare Access dengan hostname tetap untuk pengguna yang diundang, origin aplikasi terikat ke `127.0.0.1:3001`, dan port router tetap tertutup. Jika owner menjawab “hanya perangkat tim”, ganti pilihan menjadi Tailscale private tanpa Funnel.

### Perubahan aplikasi yang diperlukan sebelum exposure

1. Tambah `STUDIOFLOW_PUBLIC_ORIGIN=https://nama.domain` sebagai satu nilai kanonis tervalidasi. Ambil hostname-nya untuk `serverActions.allowedOrigins`; jangan memakai wildcard lebar dan jangan menerima nilai dari request.
2. Ganti hard-code `allowedDevOrigins` dengan env list khusus development, misalnya `STUDIOFLOW_ALLOWED_DEV_ORIGINS`; nilai kantor tetap di `.env.kantor`, bukan source.
3. Jalankan `next start` dengan `NODE_ENV=production`, host `127.0.0.1`, port tetap 3001. Dengan begitu hanya tunnel/service lokal yang dapat mencapai origin dan pengguna tidak dapat memalsukan header proxy dari LAN.
4. Pertahankan cookie `secure`, `httpOnly`, `sameSite=lax`. Tambah regression test bahwa production selalu `Secure`; `x-forwarded-proto=https` hanya menjadi bukti proxy/readiness, bukan alasan menurunkan cookie.
5. Jangan percaya `x-forwarded-for` generik hanya dengan boolean. Untuk Cloudflare mode, ambil `CF-Connecting-IP` yang ditulis Cloudflare, hanya karena origin loopback-only; untuk Tailscale proxy gunakan header yang didokumentasikan dan mode terpisah. Header hilang/tidak valid kembali ke bucket deployment-local.
6. Tetapkan `AUTH_TRUST_PROXY_CLIENT_IP`/penggantinya sesuai mode tunnel agar 25-attempt network bucket benar-benar per pengguna. Pertahankan bucket email, fail-closed, sesi idle 12 jam/absolut 7 hari, dan live permission checks.
7. Pastikan `Origin`, `Host`, dan `X-Forwarded-Host` melewati tunnel sesuai hostname publik. Tambahkan hanya hostname tetap ke allowed origins. Quick URL yang berubah-ubah tidak masuk konfigurasi production.
8. Tambah header keamanan yang proporsional (minimal HSTS untuk hostname HTTPS, `X-Content-Type-Options`, frame policy, dan referrer policy) setelah browser regression; jangan membuat CSP spekulatif yang mematahkan UI.
9. Tambah health endpoint tanpa detail rahasia. Local readiness memeriksa proses, database, dan akses baca ke root efektif; respons luar hanya sehat/tidak sehat.
10. Production tidak mempunyai dev overlay/HMR. Development tetap LAN/lokal. Bila Quick Tunnel dipakai untuk uji, hostname harus masuk dev-origin env sementara dan WebSocket/HMR diuji sebagai best-effort, bukan mode kerja publik.

### Menjalankan tanpa dijaga

**Aplikasi:** gunakan Windows Task Scheduler karena sudah tersedia dan repositori sudah mempunyai runbook scheduler. Build dilakukan sekali saat memasang revisi, bukan setiap reboot. Task startup menjalankan production server dari checkout yang tepat, dengan `STUDIOFLOW_LOCATION=kantor`, “run whether user is logged on or not”, restart on failure, dan tidak membuat instance ganda. Arahkan stdout/stderr ke folder log mesin di luar repo dan batasi rotasinya.

**Tunnel:** jalankan `cloudflared` sebagai Windows service Automatic memakai named-tunnel credential yang tersimpan di mesin. Jangan taruh token/config credential di repo. Cloudflare mendokumentasikan service Windows; health dan log connector dipantau terpisah dari aplikasi.

**Satu atau dua perintah:** dua proses/service terpisah adalah pilihan benar karena kegagalan dan lognya berbeda. Sediakan satu script operator di repo untuk `start|stop|status` yang mengoordinasikan Task Scheduler aplikasi dan service tunnel, tetapi jangan menggabungkan keduanya menjadi satu proses induk. Status harus memeriksa: task hidup, localhost health sehat, service tunnel hidup, dan public health (bila Access token monitor tersedia).

NSSM memberi service/restart/log yang baik tetapi menambah software yang belum disetujui. pm2 juga dependency global lain dan menambah lapisan Node yang tidak diperlukan. Task Scheduler + script terdokumentasi adalah slice awal terkecil; pindah ke NSSM hanya bila Task Scheduler terbukti tidak cukup.

### Checklist keselamatan sebelum dibuka

- `SESSION_SECRET` acak, unik, minimal 32 karakter, bukan contoh; jangan pernah dicatat di Git/chat/log.
- Password owner panjang dan unik; nonaktifkan akun test/demo, akun bekas staf, dan role yang tidak perlu. Aplikasi belum mempunyai MFA, jadi Cloudflare Access menjadi pagar kedua yang penting.
- Login limiter lulus uji melalui tunnel: alamat berbeda menghasilkan network bucket berbeda, spoofed forwarded header tidak mengubah bucket, dan kegagalan limiter menolak login.
- Production bind hanya ke loopback; router tidak mempunyai port-forward; Windows Firewall tidak membuka 3001 ke jaringan.
- Database dan seluruh storage root dicadangkan bersama. Lakukan restore drill; backup salah satu saja tidak cukup karena database hanya menyimpan key.
- Health check lokal berjalan berkala; Task Scheduler mengulang proses setelah crash; log app dan tunnel mempunyai rotasi serta lokasi yang diketahui.
- Pantau audit untuk perubahan role/izin, user disable/enable, settings/storage cutover, dan integration-token create/revoke. Audit saat ini tidak mencatat login gagal, jadi pantau limiter database dan log layanan untuk lonjakan penolakan; jangan menyimpan password/token/IP mentah di log.
- Uji dari jaringan luar: login, logout, satu Server Action, upload+signed read, Brand mark, expiry sesi, respons 413 untuk file terlalu besar, dan restart PC.
- Uji akses ditolak oleh Cloudflare Access untuk email yang tidak diundang dan cabut satu user sebagai latihan.
- Tetapkan siapa yang menerima alert saat app/tunnel/storage/database tidak sehat dan berapa lama log disimpan.

### Yang masuk repositori dan yang tetap di mesin

**Masuk repositori:** parser/config public origin dan dev origins; start/stop/status scripts tanpa rahasia; health route; tests; `.env.example` berisi nama variabel kosong dan penjelasan; runbook setup/update/backup/restore/log/rollback; contoh konfigurasi tunnel yang hanya memakai placeholder; changelog.

**Tetap di mesin:** `.env.kantor`; `SESSION_SECRET`; database password; Cloudflare tunnel token/credential JSON dan config nyata; Access service token; domain/account recovery material; Windows task password; lokasi log aktual bila mengandung nama user; backup dan encryption key.

### File yang diperkirakan disentuh oleh rekomendasi

- `next.config.ts`, `package.json`, `.env.example`.
- Modul config Platform baru untuk public origin/proxy mode beserta unit test.
- `src/app/login/actions.ts`, `src/platform/core/auth/limiter.ts` dan tests untuk sumber IP tepercaya yang provider-aware.
- `src/platform/core/auth/request.ts` test untuk cookie production.
- Route health baru di `src/app/api/`.
- Script PowerShell start/stop/status baru di `scripts/`.
- Runbook publikasi lokal baru di `docs/operations/` dan penyesuaian scheduler runbook.
- Satu integration/smoke spec production-origin; browser acceptance akhir milik Reviewer.

### Risiko

- Public tunnel tanpa Access membuat halaman login diserang terus-menerus.
- Mempercayai `x-forwarded-for` saat port 3001 masih dapat dicapai LAN memungkinkan pemalsuan IP dan pelemahan limiter.
- Salah `allowedOrigins` membuat semua Server Actions gagal atau, bila terlalu lebar, memperbesar risiko CSRF.
- Menjalankan development memaparkan overlay, endpoint development, HMR, dan perilaku yang tidak stabil.
- PC tidur, Windows update, listrik, drive storage lepas, database mati, atau credential tunnel kedaluwarsa tetap membuat layanan tidak tersedia; tunnel bukan hosting.
- Backup database tanpa folder, atau folder tanpa database, tidak dapat memulihkan aplikasi utuh.

### Slice berurutan, masing-masing satu commit dan aman sendiri

1. **Production config hardening:** public origin tervalidasi, env-driven dev origins, production loopback start, allowed Server Action origin, cookie/config tests. Belum memasang tunnel.
2. **Proxy-aware limiter:** mode Cloudflare/Tailscale yang eksplisit, provider header tervalidasi, spoof tests, loopback-origin requirement. Default lama tetap fail-safe saat env kosong.
3. **Unattended app operations:** health endpoint, Task Scheduler/start-stop-status scripts, log rotation, `.env.example`, dan runbook. Uji reboot/crash lokal tanpa exposure.
4. **Machine-only tunnel setup:** owner memasang akun/domain/credential di PC dan Cloudflare Access allowlist menurut runbook. Tidak ada credential atau perubahan router di Git.
5. **Reviewer acceptance:** uji jaringan luar, access denial, Server Actions, upload/read, limiter, restart PC, health/log, dan restore checklist; baru setelah itu tandai siap dipakai.

## Pertanyaan yang masih harus dijawab owner

1. **Ya/tidak — rekomendasi: ya.** Apakah env tetap wajib sebagai default dan jalur pemulihan, sementara Settings hanya menjadi override yang aktif setelah copy+checksum selesai?
2. **Ya/tidak — rekomendasi: ya.** Apakah folder lama harus selalu dibiarkan utuh dan penghapusannya hanya boleh lewat prosedur manual terpisah setelah backup/masa observasi?
3. **Pilih satu — rekomendasi: A.** A) pengguna yang diundang dapat membuka dari browser mana pun melalui Cloudflare Access; B) hanya perangkat tim yang sudah memasang Tailscale.
4. **Ya/tidak — rekomendasi: ya bila memilih A.** Apakah owner bersedia memakai akun Cloudflare dan satu domain/hostname tetap untuk StudioFlow?
5. **Pilih satu — rekomendasi: A.** A) Task Scheduler bawaan Windows untuk aplikasi + `cloudflared` Windows service; B) menyetujui dependency NSSM untuk menjadikan aplikasi service.
6. **Ya/tidak — rekomendasi: ya.** Apakah akses publik ditunda sampai backup database+folder sudah diuji restore dan semua akun test/demo dinonaktifkan?

## Baseline pemeriksaan

`HEAD 89d8d6169922dd9a4a9fe764b9500f64a072fc41; branch main; origin/main sama dengan HEAD; working tree awal bersih; revisi berikutnya R8.485.`
