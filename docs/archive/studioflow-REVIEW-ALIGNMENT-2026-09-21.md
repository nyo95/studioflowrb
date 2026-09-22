# StudioFlow Rebuild — Review & Alignment (Acuan Perbaikan) (ARCHIVED 2026-09-22)

> **Superseded.** Its B1–B5/C1–C2/D1 findings were already fixed in R8.98
> (2026-09-21), one day before this document's own date — confirmed by
> re-reading the exact functions cited. The A1–A4 (contract text drift) and D2
> (archived branch) findings were still open and were carried forward into
> [`docs/BACKLOG.md`](../BACKLOG.md)'s Cleanup section on 2026-09-22. Kept as
> the historical evidence trail for the R8.98 fix pass.

Status: DRAFT untuk ditindaklanjuti (bukan PLAN aktif, belum di-rating per revisi)
Tanggal: 2026-09-21
Lane: PLANNER/REVIEWER
Metode: verifikasi langsung atas kode, skema, tes, dan kontrak di checkout ini; hanya temuan yang **terbukti di kode** yang ditulis. Klaim tanpa bukti sengaja DIBUANG (lihat §2).

Otoritas kontrak saat ini:
- `docs/apps/studioflow/STUDIOFLOW-REWORK-CONTRACT.md` (R8.70, owner-ratified 2026-09-15)
- `docs/apps/studioflow/STUDIOFLOW-PHASE-ENGINE-V2-CONTRACT.md` (R8.87, 2026-09-16) — supersede sebagian (§1), menang atas konflik (§0)

Notasi bukti: `path:baris`. Semua baris aktual pada checkout ini.

---

## 1. Ringkasan eksekutif

Arsitektur inti sudah konsisten: SSOT Todo = `SfChecklistItem` (V2-D1), `SfActivity` FEEDBACK-only,
label revisi `{PREFIX}{major}.{minor}` (V2 §6), blocker `todoBlockers`/`fullBlockers` sudah
mendokumentasikan pembedaan submitInternal vs approval, MOM live berjalan pada batas 3 MB sesuai
kontrak §10.

Temuan berkonsentrasi di 4 area:

| # | Area | Sifat |
|---|------|-------|
| A | Gas kontrak (teks) vs kode | Teks kontrak yang tersupersede/ketinggalan zaman masih dikunci tes (§3, §4, §5) |
| B | Celah logika backend + baca inkonsisten | Guard hilang, dua read tidak sepakat, path mati pasca V2-D1 (§6) |
| C | Skoping per-user pada read layer | `ownerId`/`userId` berasal dari pemanggil, bukan principal (§7) |
| D | Debt teknis & invariant tak tertulis | Branch arsip terkunci tes, invariant gapless tidak terdokumentasi (§8) |

Tidak ditemukan cacat korupsi data aktif pada alur utama yang diuji. Risiko tertinggi ada di
**B1 (default template bisa non-aktif → pembuatan proyek macet)** dan **C1/C2 (read per-user
mempercayai id dari pemanggil)**.

Perbandingan logika dengan legacy (commit `c4b0c466…a27`, dibaca read-only) terdokumentasi di
**§11** — dinyatakan sebagai perbedaan saja, tanpa penilaian mana yang lebih baik.

---

## 2. Klaim yang sempat dianggap bug lalu TERBALIK saat verifikasi

Agar acuan ini tidak menyesatkan, daftar berikut JANGAN dijadikan temuan:

- **MOM `setImage` "race condition"** — bukan bug. Pola precheck scope-guard + reload dalam
  transaksi sudah benar.
- **`submitForInternalReview` "kehilangan fullBlockers"** — bukan bug, sengaja. `domain/blockers.ts`
  mendokumentasikan `todoBlockers` untuk submitInternal dan `fullBlockers` untuk approval;
  `phases/service.ts:168` memakai `todoBlockers`.
- **Prefix fase "case beda create vs update"** — bukan gap; keduanya `toUpperCase()`
  (`phases/service.ts:721` create, `:753` update).
- **`allocateName` ("race nomor proyek")** — aman (mekanisme kunci + `ON CONFLICT`).

---

## 3. Gas kontrak ↔ codecode — artefak arsip masih dikunci (PERLU PURGE/RESYNC)

### A1. `mom-images.ts` (batas 10 MB) mati, tapi dikunci `mom.contract.test.ts`
- Live chain (satu-satunya yang terpakai): `mom-editor.tsx:160` `ImageWorkspace`
  `maxDimension=1600`, `outputType="image/jpeg"` → `actions.ts:496` `setMomImageAction`
  (komentar: "Size/type policy lives in the service.") → `mom.service.ts:410` `MOM_IMAGE_SIZE`
  batas `MOM_LIMITS.imageBytes` = **3 MB** (`domain/mom.ts:34`). Konsisten dengan rework §10 (≤ 3 MB).
- `src/apps/studioflow/mom-images.ts` (`MAX_IMAGE_BYTES = 10 MB`, baris 4–21) adalah artefak
  arsip: hanya dipakai branch `_legacy_project_id/mom-actions.ts` (tidak-routable, dikecualikan
  dari tsconfig) dan **tes kontrak**.
- `mom.contract.test.ts:8-9` membaca editor **canonical** ditambah `mom-images.ts` (arsip),
  lalu :37 memastikan teks "no larger than 10 MB" — pinned policy mati.

**Dampak:** seorang pembaca kode/contri akan menyimpulkan "10 MB dan server menolak >3 MB, UI
mengizinkan 10 MB" — padahal UI live sudah mem-prepare ≤ 1600px JPEG dan hanya 3 MB yang diterima.
Test mengunci artefak yang tidak lagi menjadi policy.

**Perbaikan:** PURGE `mom-images.ts` (atau seragamkan ke `domain/mom.ts`), arahkan
`mom.contract.test.ts:37` ke policy live (3 MB dari `domain/mom.ts`), hapus/arsipkan branch
`_legacy_project_id` (lihat D2).

### A2. Rework §5.2 masih bicara "open TODO activities … deferred TODOs"; kode memblok checklist saja
- `STUDIOFLOW-REWORK-CONTRACT.md:203` — `submitInternal` diblok "open TODO activities in the
  active revision or phase-tagged deferred TODOs".
- Kode: `phases/service.ts:168-169` memakai `todoBlockers(...)` = hanya `openRootChecklistItems`
  (`blocker-query.ts:11`; `domain/blockers.ts:31`). Tidak ada bucket "deferred reservoir" di
  todoBlockers.
- V2 §3 mengubah SSOT Todo menjadi `SfChecklistItem`; §0 menyatakan klausa rework di luar daftar
  supersede tetap berlaku → teks §5.2 tersisa dalam vokabulari pra-V2.

**Dampak:** pembaca kontrak akan mengharapkan deferral ikut memblok submitInternal/approval,
padahal jalur deferral telah mati (B5). **Perbaikan:** sinkronkan kalimat §5.2 §6.4 ke
bahasa V2-D1 ("unchecked root checklist items") dan bebaskan kontrak dari bucket deferred.

### A3. V2 §3 "existing TODO-mode activities remain readable" vs view yang memaksa FEEDBACK
- V2 `STUDIOFLOW-PHASE-ENGINE-V2-CONTRACT.md:68` — activity TODO lama "remain readable".
- Kode: `activityView` menulis `mode: "FEEDBACK"` tetap (`phases/service.ts:484`); `today/service.ts:65`
  juga `mode: "FEEDBACK"` tetap — mode tersimpan di DB diabaikan.

**Dampak:** di DB rebuild saat ini tidak ada aktivitas TODO (DB dibuat baru), jadi tidak aktif
berbahaya. Tapi pernyataan kontrak tidak cocok dengan bentuk baca; lebih aman kontrak menyatakan
"mode disajikan sebagai FEEDBACK; aktivitas TODO lama tidak diinstans" atau `activityView`
menjaga nilai tersimpan. **Perbaikan:** putuskan salah satu; jangan biarkan keduanya.

### A4. Teks kontrak lain yang tertinggal vokabulari lama
- Rework `:80` tabel KEEP masih menulis "Activity TODO/FEEDBACK per revision, deferral, due date"
  sebagai §6.1 KEEP, padahal §6.1 sudah disupersede V2-D1 (`V2 §1 baris 28`).
- V2 §9 `:160` masih menulis "Revision work (SfActivity FEEDBACK + **deferred items**)", padahal
  deferral tidak bisa sukses lagi (B5).
- `PHASE-ENGINE-V2-BASELINE-AUDIT.md:19` baris "FEEDBACK → TODO on reject" adalah deskripsi
  superseded (V2-D1 `:69` mengubah target konversi menjadi `SfChecklistItem`).

**Perbaikan:** satu pass "istilah/vokabulari V2" atas 3 dokumen tersebut.

---

## 4. Dead projections pasca V2-D1 (kandidat PURGE)

### B5. `deferActivity` tidak pernah sukses, tapi seluruh jaring blocker/UI/deferred tetap ada
Bukti rantai:
- Semua `SfActivity` FEEDBACK-only: `addActivity` menolak `mode !== "FEEDBACK"`
  (`phases/service.ts:390-392`, `ACTIVITY_TODO_DEPRECATED`); `activityView` memaksa FEEDBACK (`:484`).
- `deferActivity` selalu `DEFER_FEEDBACK_BLOCKED` untuk FEEDBACK (`phases/service.ts:467`) → satu-satunya
  hasil yang bisa dicapai adalah error.
- Namun demikian, `readBlockerCounts` tetap menghitung bucket `revision_id: null` sebagai
  `openDeferredActivities` (`blocker-query.ts:10`); `fullBlockers` memakainya
  (`domain/blockers.ts:25`); `getPhaseDetail` tetap menyajikan `deferred`
  (`phases/service.ts:614`); halaman fase tetap merender seksi "Deferred"
  (`[projectId]/phases/[phaseId]/page.tsx:92-95`); `activity-list.tsx:73` tetap render badge
  "Deferred from …"; action `op === "defer"` masih ada (`studioflow/actions.ts:270`);
  today feed masih menanyakan `revision_id: null` (`today/service.ts:51,55,63,90`).
- Bukti tes: `service.integration.test.ts:294` malah mengunci `DEFER_FEEDBACK_BLOCKED`.

**Dampak:** ~5 bucket query, 1 seksi UI, 1 action branch, 1 deskripsi blocker yang tidak pernah
aktif — biaya mental & pemeliharaan. **Perbaikan:** putuskan mengikuti V2-D1 (deferral = tidak
ada), PURGE jalur/UI/action/bucket `deferred` dan `openDeferredActivities`, lalu hapus baris
V2 §9:160 serta baseline audit :19-20.

### B4. `listGeneralActivities` tidak pernah menghasilkan data
- `phases/service.ts:625-628` mengambil `SfActivity` dengan `phase_id: null`.
- `addActivity` mewajibkan `phaseId` (`:390`) → tidak ada baris `phase_id: null` yang bisa dibuat.
- Beda dengan "General to-dos" (V2 §3 `:71`): itu `SfChecklistItem` `phase_id IS NULL`, sah dan
  terpakai. Hanya **SfActivity general** yang mati.

**Perbaikan:** hapus `listGeneralActivities` (dan query `project.activities` `phase_id: null` di
`today/service.ts:55` bila memang tanpa pemakai UI), pertahankan "General to-dos" checklist.

---

## 5. Konsistensi kebijakan upload — sudah selaras (catatan, bukan temuan)

- MOM live 3 MB: selaras kontrak §10 dan client (ImageWorkspace 1600px JPEG). → lihat A1 untuk
  artefak lama 10 MB yang harus dirapikan.
- Foto jadwal: `schedule/service.ts:142` `SCHEDULE_IMAGE_BYTES` "smaller than 3 MB after
  cropping", client juga `ImageWorkspace 1600/jpeg` (`schedule-board.tsx:804,893-897`) → selaras.
- Deliverable fase: UI `deliverables-panel.tsx:136,147` menampilkan "max 25 MB" — batas ini berlaku
  di sisi service (`uploadDeliverable`, `phases/service.ts:953`); belum diverifikasi ulang angkanya
  pada sesi ini (diluar teladan yang dikunci).

---

## 6. Cacat/gap logika backend (tindak lanjut prioritas)

### B1. `updatePhaseTemplate` dapat menjadikan template non-aktif sebagai default → pembuatan proyek macet
- Guard kode hanya arah sebaliknya: tidak boleh deaktifkan template yang sedang default
  (`phases/service.ts:670`) dan tidak boleh melepas default bila tidak ada template aktif lain
  (`:674-677`). **Tidak ada guard `isDefault=true` wajib `is_active=true`** (`:689-696` menulis
  `is_default` apa adanya).
- Konsumen: `createProject` mencari `{ is_default: true, is_active: true }` dan melempar
  `PROJECT_PHASE_TEMPLATE_MISSING` bila tidak ketemu (`projects/service.ts:409-411`).
- Urutan pemicu: buat template T2 `is_active=false` → `updatePhaseTemplate(T2, isDefault:true)` →
  T2 default & non-aktif → **semua pembuatan proyek baru gagal**. Pemulihan hanya via UI Settings
  (set template aktif lain sebagai default). Klasik "footgun", butuh temuan oleh pengguna.

**Perbaikan:** tambah guard `if (input.isDefault === true && !template.is_active) throw conflict(...)`
+ update, tambah guard simetris "tidak boleh default non-aktif" pada `createPhaseTemplate` jika
  direktif kontrak mengizinkan `isDefault` saat create (`:650-661`), dan tulis tes transaksi
  `service.integration.test.ts` untuk dua urutan.

### B2. `completeSupervision` menandai proyek COMPLETED tanpa cek fase terakhir
- `phases/service.ts:295-310`: set fase COMPLETED, lalu `project status = COMPLETED` tanpa
  `nextPhaseExists` — tidak seperti `completeProjectIfLast` (`:94-101`) yang digunakan jalur
  `bypassPhase` (`:156`) dan `approveClient`.
- Juga digerbang `isLegacySupervisionPhase` (`domain/phase.ts:86`, dipakai `:299`), sehingga untuk
  template V2 (definisi bebas) perintah ini hanya cocok bila SUPERVISION = fase terakhir.

**Dampak:** latensi bug jika suatu template V2 menempatkan fase lain setelah SUPERVISION —
proyek terkunci COMPLETED padahal fase sesudahnya belum selesai.

**Perbaikan:** `completeSupervision` memakai `completeProjectIfLast` (atau guard eksplisit
"harus fase terakhir"), dan keputusan template-V2 (tetap pakai SUPERVISION sebagai "final") dicatat
di kontrak V2 (saat ini tidak disebut).

### B3. `waitingDays` tidak konsisten antar-read
- `listProjectPhases` (rail/Overview card): `null` untuk PENDING/COMPLETED/READY_FOR_NEXT, dihitung
  untuk status lain (`phases/service.ts:542`).
- `getPhaseDetail` (detail): dihitung untuk semua status (`phases/service.ts:606`) berdasar
  `status_changed_at` (`domain/phase.ts:245`).

**Dampak:** angka "menunggu X hari" bisa beda antara kartu fase dan halaman detail untuk status
yang sama; semantik "berapa lama menunggu" tidak didefinisikan satu kali.

**Perbaikan:** definisikan sekali di domain (mis. hanya status berjalan yang bermakna; PENDING dari
`created_at`, READY_FOR_NEXT dari `status_changed_at` dst.), satu pemanggil bersama, lalu konsisten
di UI Overview vs detail.

---

## 7. Skoping per-user pada read layer (defense-in-depth)

### C1. `listFilterViews` mempercayai `ownerId` dari pemanggil
- `tasks/service.ts:352-354` — `requireRead(input.grants)` hanya mengecek `P.projectRead`
  (`shared.ts:35-37`); `where: { owner_id: input.ownerId }` memakai id dari input.
- Bandingkan `saveFilterView`/`deleteFilterView` yang mengambil identitas dari actor
  (`tasks/service.ts:362,375`), dan `ReadContext` memang tidak membawa actor (`shared.ts:26`).
- Filter view menyimpan query (filter status/assignee/label) tiap pengguna → pengguna dengan
  `projectRead` dapat membaca query filter pengguna lain dengan memakai id-nya.

### C2. `getToday` "mine" mempercayai `userId` dari pemanggil
- `today/service.ts:33-35,40` — `scope "all"` digerbang `projectManage`, tapi "mine" memfilter
  `pic_designer_id / pic_drafter_id = input.userId` tanpa memeriksa identitas principal.
- Di UI request selalu dikirim id pengguna saat ini, sehingga tidak menimbulkan kebocoran tampilan;
  namun service sendirinya tidak mengikat ke principal.

**Perbaikan:** bawa identitas principal ke layer service untuk operasi per-user (mis. konteks baca
memuat `userId` dari sesi, bukan dari argumen publik; tindakan read memakai pola yang sama seperti
`requireCommand` yang mengembalikan `userId`). Tambah tes integrasi "pengguna lain tidak bisa
membaca filter/today milik orang lain".

---

## 8. Debt teknis & invariant tak tertulis

### D1. `moveEntryToCategory` memakai `siblings + 1`, jalur lain memakai `nextGapless`
- `schedule/service.ts:587-589` — increment baru = jumlah saudara + 1 (mengandalkan invariant
  gapless), lalu `renumber` hanya band asal.
- Bandingkan `sync.ts:97-98` yang memakai `nextGapless` (max+1, toleran gap), dan `deleteEntry`
  yang men-`renumber` (`service.ts:533`) sehingga saat ini tidak ada gap.
- Invariant ini informal; bila suatu saat ada jalur yang membuat gap (CSV bulk, override urutan),
  `siblings+1` vs `nextGapless` bisa menghasilkan increment dobel → tabrakan unique
  `project_id_section_prefix_increment`.

**Perbaikan:** ganti ke `nextGapless(daftar increment)` di `moveEntryToCategory` (atau dokumentasikan
invariant + uji), dan catat invariant sebagai aturan di domain.

### D2. Branch arsip `_legacy_project_id` masih ditrack + tes still membaca file arsip
- `CHANGELOG.md:616-620` (R8.75): branch lama diarsipkan ke `_legacy_project_id`, dikecualikan dari
  kompilasi (`tsconfig.json:45`), sudah tidak-routable (prefix `_`).
- Namun `src/apps/studioflow/requirements.ui.test.ts:5-8` tetap **membaca file di branch arsip** →
  ini "guard dead code", seperti tercatat `PHASE-ENGINE-V2-BASELINE-AUDIT.md:94`.
- Juga tercatat di `UTILITY-INVENTORY.md:76-78` dan allow-list `scripts/check-boundaries.mjs:26-28`.
- A1 berkaitan: `_legacy_project_id/mom-actions.ts` adalah satu-satunya pemakai `mom-images.ts`.

**Perbaikan:** hapus branch arsip + `mom-images.ts` (atau masukkan ke daftar resmi artifact arsip
dengan tes yang tidak membacanya), pindahkan guard `requirements.ui.test.ts` ke versi canonical
`[projectId]` bila perlu, rapikan inventory/boundary.

---

## 9. Prioritas perbaikan

| Prio | Item | Perbaikan inti | Risiko bila diabaikan |
|------|------|----------------|------------------------|
| **P0** | B1 default template non-aktif | Guard `isDefault ⇒ is_active` + tes | Pembuatan proyek baru macet (butuh intervensi manual via Settings) |
| **P0** | C1/C2 read per-user | Bawa identitas principal ke read; tes | Kebocoran filter/today pengguna lain bagi pemegang `projectRead` |
| **P1** | B2 `completeSupervision` | Pakai `completeProjectIfLast`; keputusan template V2 ditulis | Proyek COMPLETED prematur pada template V2 berfase lanjut |
| **P1** | B5 dead deferral mesh | PURGE deferral bucket/UI/action + sinkron kontrak V2 §9 | 5 query + 1 seksi UI + action branch tak pernah aktif terus dikelola |
| **P1** | B3 `waitingDays` | Definisikan sekali di domain; satu pemanggil | Angka berbeda antar Overview vs detail |
| **P2** | A1/A2/A3/A4 gas kontrak | Sinkron teks kontrak + tes ke policy live/V2-D1 | Kontrak menyesatkan; tes mengunci artefak mati |
| **P2** | B4 `listGeneralActivities` | Hapus + rapikan query today `phase_id: null` | Query mati tersimpan tersembunyi |
| **P2** | D1 `siblings+1` vs `nextGapless` | Seragamkan/dokumentasikan | Tabrakan increment pada skema unik bila invariant longgar |
| **P2** | D2 branch arsip | Hapus branch + `mom-images.ts`, pindah guard tes | Tes terus mengunci kode mati |

---

## 10. Saran proses

1. Sayat minimal 2-3 perubahan pertama (B1, C1/C2 — keduanya P0) sebagai satu PLAN baru yang
   kredibel + revision di `CHANGELOG.md`; jangan campur dengan P2 agar reviewer mudah membuktikan.
2. Untuk tiap perbaikan tulis tes transaksi di `service.integration.test.ts` (pola
   `rejectsWith`/`assert` yang sudah ada) agar bukti perilaku mengunci perbaikan.
3. Setelah B5/D2, jalankan ulang `npm test`, typecheck, lint, boundary check, legacy-runtime check
   dan bangun produksi (pola verifikasi R8.75).
4. Periksa ulang dokumen kontrak (A1–A4) dalam klausa yang tersentuh agar "docs – codebase –
   business logic – UI/UX" sejajar di satu revisi.

---

## 11. Perbandingan dengan Legacy (pernyataan perbedaan)

> Referensi legacy: checkout `D:\Misc\ProjectsHUB\studioflow`, branch `main`, HEAD
> `c4b0c466d9c3cf2c1a98ef4da393231c1ce12a27`. Working tree tracked bersih; untracked saja:
> `foldering/`, `public/uploads/library/covers/*.jpg` (13), `tmp/recovered-studioflow-*.dump` (2 —
> tidak disentuh). Per `STUDIOFLOW-REWORK-CONTRACT.md` §1 (2026-09-15), legacy read-only adalah
> spesifikasi fungsional. Bagian ini hanya mendokumentasikan perbedaan logika — tidak menetapkan
> mana yang lebih baik. Rujukan "legacy" di bawah selalu commit `c4b0c466…`, "rebuild" = checkout ini.

### 11.1 MOM
- Model: legacy `ProjectMomDocument → ProjectMomItem → ProjectMomPoint / ProjectMomImage`
  (`prisma/schema.prisma:1074-1134`) dengan `file_url` dan tanpa `alt_text`; rebuild
  `SfMomDocument → SfMomItem → SfMomPoint / SfMomImage` dengan `storage_key` + `alt_text` dan slot
  gambar 0/1 (`mom-editor.tsx:52,276`).
- Lifecycle: legacy tidak punya status dokumen — edit langsung berlaku, tidak ada
  draft/issue/supersede (tiada field status di model; `mom-service.ts` tanpa operasi issue).
  Rebuild memiliki lifecycle draft → issue → supersede → discard (`mom/service.ts`
  `createMomDraft`/`updateMomContent`/`issueMom`/`supersedeMom`/`discardMomDraft`).
- Batas gambar per item: legacy 2 gambar (maks) (`mom-service.ts:421-427` "MOM_IMAGE_LIMIT");
  rebuild juga 2 per section (`domain/mom.ts`, slot 0/1).
- Kebijakan ukuran/tipe: legacy **tidak ada** pembatasan ukuran/tipe di sisi server — kompresi murni
  client (`compressImage` >1MB → ~1MB, max 1920px, `image-utils.ts:5-16`); skema validasi hanya
  `file_url` (`validations.ts:87-92`). Rebuild mewajibkan batas server 3MB + whitelist
  jpeg/png/webp (`domain/mom.ts:34`, `mom/service.ts:410`, `sniffImage` di `domain/images.ts`) dan
  client mem-prepare 1600px jpeg (`mom-editor.tsx:160`).
- Vocabulary gaya: legacy `MomListStyle`/`MomPointStyle` (`list_style @default(decimal)`,
  `style @default(default)` di model); rebuild `MOM_LIST_STYLES`/`MOM_POINT_STYLES`
  (NONE/BULLET/NUMBERED dan TEXT/BULLET/NUMBERED, `domain/mom.ts:9-16`).
- Keterbatasan urutan: tidak ada `@@unique` pada `(document_id|item_id, sort_order)` di kedua sisi
  (rebuild dikunci `mom.contract.test.ts:19`; legacy hanya `@@index`) — tidak berbeda di aspek ini.

### 11.2 Deferral aktivitas
- Legacy `executeDeferActivity` (`phase-service.ts:1149-1191`) mengizinkan deferral untuk aktivitas
  non-FEEDBACK dan memblokir FEEDBACK (`DEFER_BLOCKED_BY_TYPE`); hasil sukses menulis
  `revision_id = null`, mempertahankan `phase_id`, dan mencatat `deferred_from_version` (`:1174-1181`).
- Rebuild `deferActivity` (`phases/service.ts:463-474`) memblokir SEMUA aktivitas
  (`DEFER_FEEDBACK_BLOCKED`, `:467`) karena V2-D1 membatasi SfActivity ke FEEDBACK-only — jalur
  penulisan `revision_id = null` tetap ada namun tidak pernah sukses.
- Pesan error: legacy "Cannot defer feedback activities…" (`:1162`); rebuild "Client feedback must
  be handled in this revision and cannot be deferred." (`:467`).
- Konstrain approval: legacy menghitung bucket deferred di gate approval
  (`assertNoPendingTasks`, `:51-53`); rebuild tetap menghitung bucket kaki yang sama
  (`blocker-query.ts:10`) meski tak pernah terisi.

### 11.3 waitingDays
- Legacy: satu fungsi baca `readPhase(...)` dipakai untuk semua tampilan; `waitingDays` dihitung
  untuk semua status dengan `daysSince(status_changed_at, now)` dan null hanya bila
  `status_changed_at` tidak diketahui; ditambah label "waiting" vs "elapsed" berbasis actor dan
  bendera `isStalled` dengan ambang per-actor (`phase-presenter.ts:207-243`, `:70-71`).
- Rebuild: dua bacaan terpisah — `listProjectPhases` mengembalikan `null` untuk
  PENDING/COMPLETED/READY_FOR_NEXT (`phases/service.ts:542`); `getPhaseDetail` menghitung untuk
  semua status (`:606`). Tidak ada label bahasa alami/stall.

### 11.4 completeSupervision & penyelesaian proyek
- Legacy `executeCompleteSupervisionPhase` (`phase-service.ts:722-767`): syarat `name_enum ===
  "SUPERVISION"` + IN_PROGRESS; fase → COMPLETED + locked, revisi aktif ditutup, proyek ditandai
  COMPLETED tanpa cek keberadaan fase berikut (`:743-746`).
- Rebuild `completeSupervision` (`phases/service.ts:295-310`): syarat `isLegacySupervisionPhase`
  + IN_PROGRESS + tidak `is_locked`; fase → COMPLETED + locked, revisi aktif ditutup, proyek ditandai
  COMPLETED jika belum; juga tanpa cek fase berikut.
- Jalur approve-client: legacy `executeApproveClientPhase` memeriksa "tidak ada fase berikut"
  sebelum proyek COMPLETED (`phase-service.ts:629-642`); rebuild `completeProjectIfLast`
  (`phases/service.ts:94-101`) digunakan oleh approve/bypass. Jadi cek "fase terakhir" ada pada
  approve-client di keduanya, dan tidak ada pada completeSupervision di keduanya.

### 11.5 Blocker approval & submitInternal
- Gate approval: legacy `assertNoPendingTasks` (`phase-service.ts:44-69`) = aktivitas OPEN pada
  revisi aktif + aktivitas deferred (`revision_id null`) + akar checklist unchecked; dipakai pada
  approveInternal, submitForClient, approveClient (`:550,582,609`). Rebuild `fullBlockers`
  (`domain/blockers.ts:22-27`, `blocker-query.ts:7-13`) = tiga bucket yang sama; dipakai pada
  jalur approval (`phases/service.ts:104,546,610`).
- Gate submitInternal: legacy memblokir hanya jika ada aktivitas **mode TODO** OPEN pada revisi
  aktif ATAU deferred-TODO yang di-tag fase (`phase-service.ts:242-255`); tidak melihat checklist.
  Rebuild memblokir hanya akar checklist unchecked (`todoBlockers`, `phases/service.ts:168-169`);
  tidak melihat aktivitas sama sekali (FEEDBACK maupun deferred).
- Konversi feedback→todo saat reject: legacy menyalin feedback menjadi aktivitas mode TODO
  (per `PHASE-ENGINE-V2-BASELINE-AUDIT.md:19`); rebuild V2-D1 mengubah targetnya menjadi
  `SfChecklistItem` (`STUDIOFLOW-PHASE-ENGINE-V2-CONTRACT.md:69`).

### 11.6 Saved filter (filter view)
- Legacy: lima tab bawaan (`all/today/overdue/p1/mine`) dikodekan sebagai konstanta
  (`types/checklist.ts:71-79`); view kustom dipersistkan pada `checklistFilterView`
  (`owner_id`, `name`, `query_json`) dan dibaca urut `name asc, created_at asc`
  (`checklist-filter-view.ts:5-12`); pembacaan menyisihkan baris tak ter-parse (`:14-19`); editor
  filter sengaja "deferred" ke roadmap §C2 (`task-list.tsx:826-829`).
- Rebuild: `SfChecklistFilterView` per user dengan kunci upsert `(owner_id, name)`
  (`tasks/service.ts:361-369`); `listFilterViews` urut `created_at asc` dan menyisihkan baris tak
  ter-parse (`:352-358`); tidak ada tab bawaan dalam kons fixed-set yang dibandingkan di sini.

### 11.7 Schedule — pindah antar kategori
- Legacy `moveEntryToCategory` (`schedule-service.ts:1769-1795`): hanya reorder dalam kategori yang
  sama; perpindahan antar kategori **dilarang** ("Moving items between categories is prohibited to
  maintain schedule code integrity."); penomoran ulang via `resequence`/`normalize` dengan increment
  negatif sementara untuk menghindari tabrakan unik (`:1442-1460`, komentar `:1302-1322`).
- Rebuild `moveEntryToCategory` (`schedule/service.ts:572-593`): mengizinkan pindah antar kategori,
  memberikan prefix baru dan `increment = jumlah_saudara + 1` (`:587-588`), lalu `renumber` band
  sumber (`:589`); jalur pembuatan lain memakai `nextGapless` (max+1, toleran gap)
  (`schedule/sync.ts:97-98`).

### 11.8 Today feed
- Lingkup: legacy `getTaskFeed(userId)` selalu "mine" — proyek yang PIC-nya sama dengan userId
  (`task-feed-query.ts:76-80`); rebuild `getToday` memiliki `scope "mine" | "all"`, di mana "all"
  hanya bagi pemilik `projectManage` (`today/service.ts:33-35`).
- Status fase aktif: legacy `IN_PROGRESS / ON_REVIEW_INTERNAL / ON_REVIEW_CLIENT`
  (`task-feed-query.ts:39-43`); rebuild menambah `APPROVED_INTERNAL` sehingga empat status
  (`today/service.ts:13`).
- Aktivitas deferred di Today: legacy TIDAK memasukkannya ke feed (hanya aktivitas revisi aktif;
  deferred hanya di halaman fase, `[id]/phases/[phaseId]/page.tsx:137`) (`task-feed-query.ts:88-97`);
  rebuild MEMASUKKAN bucket `revision_id: null` dengan label "· deferred"
  (`today/service.ts:51,63,90`).
- Aktivitas "General" (project-level, `phase_id null`): legacy didukung — `executeAddProjectActivity`
  menulis Activity mode TODO (`project-service.ts:590-621`), tampil di feed
  (`task-feed-query.ts:114-118`), dan quick-add "General Tasks" menulis Activity (`:178-191`).
  Rebuild tidak dapat membuat SfActivity `phase_id null` (addActivity wajib `phaseId`, mode
  FEEDBACK-only; `phases/service.ts:390-392`): bucket general tetap di-query tapi selalu kosong
  (`today/service.ts:55`); item "General" yang dapat dibuat adalah checklist (`phase_id null`).
- Passthrough mode: legacy `fromActivity` meneruskan mode aktual (FEEDBACK vs TODO)
  (`task-feed.ts:61`); rebuild `activityRow` meng-hardcode `mode: "FEEDBACK"`
  (`today/service.ts:65`, selaras V2-D1).
- Routing `#tag` pada teks aktivitas: legacy `parsePhaseTag` (`task-tagger.ts:40-53`) memindahkan
  aktivitas ke fase lain atau GENERAL via suffix `#tag` pada konten (dipakai
  `executeAddActivity`/`executeAddProjectActivity`, `phase-service.ts:883-906`,
  `project-service.ts:598-629`); rebuild tidak memiliki mekanisme ini (tidak ada panggilan
  `parsePhaseTag` di `src/apps/studioflow`).
- Target quick-add: legacy memberi `activeRevisionId` dan `isLocked = phase.is_locked || !revision`
  (`task-feed-query.ts:180-191`); rebuild memberi `disabledReason` ("Approved" saat locked,
  "Not started" tanpa revisi) (`today/service.ts:81-93`).