# Audit Relasional dan Logika Master Data — Oktober 2026

- Work Order: **WO-MD-AUDIT-01**
- Pelaksana: Backend Executor
- Tanggal: 2026-10-01
- Baseline: `fff603a1981ee8b5bad26a8acf4c38fa49759aeb` (`main`, R8.263)
- Lokasi: kantor (`STUDIOFLOW_LOCATION=kantor`)

## Kesimpulan

Struktur antaraplikasi sudah mengikuti batas utama: tidak ada foreign key lintas schema, dan pembacaan lintas aplikasi memakai public port atau snapshot. Data kantor yang diperiksa juga tidak mengandung pelanggaran relasi yang dicari. Namun, jalur tulis Master Data masih mempunyai satu celah kehilangan data (**P0**), tiga celah integritas yang dapat dicapai lewat alur aplikasi (**P1**), dan beberapa perlindungan lapis kedua yang belum ada (**P2**).

Temuan terpenting:

1. Form pembaruan Supplier dengan JSON kontak rusak diterjemahkan menjadi daftar kosong dan menghapus semua kontak Supplier.
2. Harga material belum membuktikan rantai Brand → Supplier → Price.
3. Category dapat dinonaktifkan ketika masih dipakai data aktif.
4. Vendor Type dapat diarsipkan tanpa guard kemampuan yang sudah diterapkan saat mengubah tipe Supplier.

Rekomendasi urutan: kerjakan **MD-AUD-001 sampai MD-AUD-004** di `WO-MD-HARDEN-01`, lanjutkan constraint/index murah yang disertai pre-check data, lalu kerjakan aturan rantai harga di `WO-MD-CHAIN-01`. Audit ini tidak mengubah perilaku atau data.

## Ruang lingkup dan cara pemeriksaan

- Membaca empat schema Prisma, seluruh migration yang membentuk index/constraint, boundary contract, dan empat contract Master Data.
- Memetakan semua relasi, nullability, `onDelete`, id string tanpa FK, timestamp, angka uang, lifecycle, dan index FK.
- Menelusuri setiap public method Master Data dan semua action Master Data dari input, izin, validasi, transaksi, audit, sampai penyimpanan.
- Menelusuri secara khusus Brand–Supplier–SKU–Price, Category, kemampuan Vendor Type, archive/restore/delete, workbook, quick-create, sample request, dan public read port.
- Menjalankan query katalog dan pemeriksaan data dalam transaksi `READ ONLY`. Sebelum query, target dibuktikan sebagai database `studioflow_rebuild` pada konfigurasi `localhost`; sesi server melaporkan `transaction_read_only=on`. Tidak ada secret dicetak.
- Menjalankan `npm test` sebelum audit. Hasil awal: **712 lulus, 0 gagal, 158 suite, sekitar 69,5 detik**.

Query data mengikuti pola ini sehingga dapat dijalankan ulang tanpa menulis:

```sql
SET default_transaction_read_only = on;
BEGIN READ ONLY;
SELECT current_database(), inet_server_addr(), current_setting('transaction_read_only');
-- SELECT pemeriksaan
ROLLBACK;
```

## Peta relasi

### Master Data — 21 model

Model: `Unit`, `Category`, `VendorType`, `Vendor`, `VendorCategory`, `VendorVendorType`, `VendorContact`, `Brand`, `BrandSupplier`, `BrandLink`, `BrandHashtag`, `BrandCategory`, `BrandCategoryOrigin`, `Sku`, `SkuCategory`, `PriceMaterial`, `PriceMaterialLabor`, `PriceLabor`, `ArchiveCause`, `DeletionRequest`, `SampleRequestIntake`.

| Induk → anak | FK/nullability dan `onDelete` | Makna |
|---|---|---|
| `Unit` → `Sku` | base wajib; purchase/dimension opsional; `Restrict` | Unit yang pernah dipakai tidak hilang diam-diam. |
| `Unit` → tiga tabel harga | wajib; `Restrict` | Harga selalu mempunyai satuan. |
| `Category` → `Category.merged_into` | opsional; `Restrict` | Riwayat merge tetap menunjuk survivor. |
| `Category` → `BrandCategory`, `SkuCategory`, `VendorCategory`, dua harga kerja | wajib; `Restrict` | Penghapusan permanen harus dibereskan oleh service. |
| `VendorType` → `VendorVendorType` | wajib; `Restrict` | Assignment tidak ikut hilang. |
| `Vendor` → assignment/category/contact/Brand/BrandSupplier/harga | owner Brand opsional, yang lain wajib; contact `Cascade`, lainnya `Restrict` | Contact adalah anak milik Supplier; relasi bisnis dan harga dilindungi. |
| `Brand` → supplier/link/tag/category/SKU/contact | SKU/contact opsional; semuanya `Restrict` | Penghapusan memakai choreography service. |
| `BrandCategory` → `BrandCategoryOrigin` | wajib; `Restrict` | Sumber kategori Brand disimpan terpisah. |
| `Sku` → category/material price/origin | wajib kecuali origin; `Restrict` | Harga material tidak ikut hilang otomatis. |
| `PriceMaterial` → `BrandLink` | opsional; `SetNull` | Bukti link boleh hilang tanpa menghapus harga. |

`ArchiveCause`, `DeletionRequest`, dan referensi `SampleRequestIntake` memakai id string. Ini sengaja untuk relasi polymorphic atau snapshot dari aplikasi lain; tidak tepat diubah menjadi FK lintas aplikasi. Kekurangannya adalah jenis/nilai dan konsistensi pasangan belum seluruhnya dipaksa database (MD-AUD-006 dan MD-AUD-010).

Lifecycle tidak seragam secara fisik tetapi dapat dijelaskan: `Unit` dan `Category` memakai `status`; Brand, Supplier, Vendor Type, SKU, dan harga memakai `deleted_at`; tabel join tidak punya lifecycle sendiri. Partial unique index aktif tersedia untuk Category, SKU, Brand, Supplier, serta pasangan harga yang harus unik. `Sku` mempunyai CHECK kelengkapan/positivitas dimensi. Harga belum mempunyai CHECK nilai dan currency.

### Platform — 14 model

Model: `User`, `UserPreference`, `Role`, `UserRole`, `RolePermission`, `Session`, `LoginRateLimit`, `PlatformGeneralSettings`, `AuditEvent`, `Notification`, `MessengerConversation`, `MessengerParticipant`, `MessengerMessage`, `MessengerAttachment`.

| Induk → anak | FK/nullability dan `onDelete` | Makna |
|---|---|---|
| `User` → `UserPreference` | wajib; `Cascade` | Preference milik satu user. |
| `User`/`Role` → `UserRole`; `Role` → `RolePermission`; `User` → `Session` | wajib; `Restrict` | Akun/role tidak hilang saat masih dipakai keamanan. |
| Conversation → participant/message → attachment | wajib; `Cascade` | Anak messenger ikut agregatnya. |

`AuditEvent`, notification recipient/actor, dan sebagian id user messenger berupa string, bukan FK. Contract platform memang menjaga audit/snapshot meskipun akun berubah atau hilang. Tidak ada FK `platform → app`.

### StudioFlow — 29 model

Model: `SfSettings`, `SfAssetCleanupFailure`, `SfClient`, `SfProject`, `SfPhase`, `SfRevision`, `SfActivity`, `SfChecklistTemplate`, `SfChecklistItem`, `SfCdItem`, `SfChecklistLabel`, `SfChecklistItemLabel`, `SfChecklistFilterView`, `SfPhaseTemplate`, `SfPhaseDefinition`, `SfDeliverable`, `SfMomDocument`, `SfMomRevision`, `SfMomItem`, `SfMomImage`, `SfSchedulePrefix`, `SfScheduleTemplateCategory`, `SfScheduleTemplateItem`, `SfScheduleEntry`, `SfPresentationBoard`, `SfPresentationSlide`, `SfPresentationAnnotation`, `SfScheduleOption`, `SfScheduleSampleRequest`.

| Agregat | Relasi dan `onDelete` |
|---|---|
| Client/project | `SfProject.client_id` opsional. Project menjadi induk Phase, Activity, Checklist, MOM, Schedule, Presentation, dan Deliverable; anak milik project umumnya `Cascade`. |
| Phase/revision | Phase wajib ke Project dan PhaseDefinition; revision wajib ke Phase. Activity dapat menunjuk Phase/Revision; Deliverable wajib ke Project/Phase dan opsional ke Revision. |
| Checklist | Template opsional ke definition; item wajib ke Project, opsional ke Phase/parent/template. Tree dan label join mengikuti anak dengan `Cascade`; template reference memakai `SetNull`. |
| MOM | Document wajib ke Project; revision/item wajib ke document; image wajib ke item; semuanya `Cascade` di dalam agregat. |
| Schedule/presentation | Entry wajib ke Project, template item opsional `SetNull`; Board wajib ke Project, Slide ke Board, Annotation ke Slide dan opsional ke ScheduleEntry (`SetNull`); Option ke Entry dan SampleRequest ke Option memakai `Cascade`. |

Id user dan referensi Master Data disimpan sebagai string/snapshot sesuai boundary; tidak ada FK ke Platform atau Master Data. Risiko cross-row pada FK berulang (misalnya project/phase/revision yang secara individual valid tetapi berasal dari project berbeda) dicatat sebagai MD-AUD-012.

### BQ — 16 model

Model: `BqLibMaterial`, `BqLibLabor`, `BqLibMaterialLabor`, `BqLibCustomItem`, `BqTemplate`, `BqTemplateSection`, `BqTemplateRecommendation`, `BqAssemblyTemplate`, `BqAssemblyLine`, `BqProject`, `BqProjectDeletionRequest`, `BqSection`, `BqSubsection`, `BqItem`, `BqSubObject`, `BqLineItem`.

| Agregat | Relasi dan `onDelete` |
|---|---|
| Template | Template → section `Cascade`; parent section opsional (default `NoAction`/restricting behavior); recommendation → section `Cascade`; empat referensi library opsional dengan CHECK tepat satu, dan `SetNull`/default sesuai migration. |
| Assembly | Template → line `Cascade`. Referensi library disimpan sebagai snapshot/plain id sesuai boundary. |
| Project estimate | Project → section → subsection/item → subobject/line item memakai `Cascade`; CHECK memastikan item dan line item memilih tepat satu parent yang diizinkan. |

`BqProjectDeletionRequest.project_id` dan referensi Master Data pada library/line disimpan sebagai snapshot/plain id; ini menjaga batas aplikasi. Tree template belum menjamin parent berada di template yang sama (bagian dari MD-AUD-012).

### Batas antar-schema

Query katalog `pg_constraint` tidak menemukan FK lintas `platform`, `master_data`, `studioflow`, dan `bq`. Tidak ditemukan import internal lintas aplikasi pada jalur yang diaudit. StudioFlow/BQ membaca Master Data melalui public read port, sedangkan fakta historis disalin. Keadaan ini **sesuai invariant 6** dan tidak perlu “diperbaiki” dengan FK lintas schema.

## Cakupan public method dan action

Tabel ini merekam seluruh permukaan publik. `Ya` pada transaksi berarti write lewat `ports.runTransaction`; runtime production memakai serializable transaction. Semua read memeriksa permission tetapi tidak membutuhkan transaksi tulis.

| Kelompok (seluruh method) | Izin | Validasi/constraint | Transaksi + audit | Catatan hasil audit |
|---|---|---|---|---|
| Root: `summary`, `recentChanges`, `listPromotionReferences`, `validatePromotionReference` | Ya | reference divalidasi; limit belum dibatasi | Read only | List promotion tidak dipaginasi. |
| Unit: `list/get/create/update/archive/restore/requestDeletion` | Ya | code/name, penggunaan saat archive/restore | Semua write ya + audit | `updateUnit` tidak menolak Unit archived (MD-AUD-005). |
| Category: `list/get/create/update/deactivate/merge/requestDeletion` | Ya | kind, partial unique, same-kind merge | Semua write ya + audit | Deactivate tidak mengecek pemakai aktif (MD-AUD-003); update tidak menolak inactive (MD-AUD-005). |
| Vendor Type: `list/listForAssignment/get/create/update/archive/restore/requestDeletion` | Ya | capability removal pada update | Semua write ya + audit | Archive melewati capability guard (MD-AUD-004); update archived (MD-AUD-005). |
| Brand: `list/listForVendorAssignment/listRefs/get/create/update/archive/restore/requestDeletion` | Ya | name/link/category/supplier; DB partial unique | Semua write ya + audit | Update archived dan pelepasan BrandSupplier yang masih dipakai harga (MD-AUD-002/005); list lebar. |
| Vendor: `list`, empat reference list, `get/create/createPricingQuick/update/archive/restore/requestDeletion` | Ya | type/category/capability/contact/link | Semua write ya + audit | Action update dapat menghapus contact ketika JSON rusak (MD-AUD-001); update archived (MD-AUD-005); list lebar. |
| SKU: `list/get/create/update/archive/restore/requestDeletion` | Ya | identity, units, dimensions, category; DB partial unique/CHECK | Semua write ya + audit | Initial material prices tidak cek BrandSupplier; `suppressAudit` public (MD-AUD-002/007). |
| Tiga price kind: seluruh `list/get/create/update/archive/restore/requestDeletion` | Ya | amount/currency/unit/category/capability; live uniqueness | Semua write ya + audit | Material price tidak cek BrandSupplier; scalar hanya dijaga service; material audit dapat disuppress; lists lebar. |
| Deletion: `list/reject/hardDeleteArchived/approve` | Ya | allow-list pada hard delete, dependency check | Semua write ya + audit | Target type masih free string di DB (MD-AUD-010). |
| Sample: `start/recordQuote/markPriced/decline/sync/list/listSkuChoices/listVendorChoices/get` | Ya | state, foreign id existence, amount/currency | Semua write ya + aggregate audit | Tiga id quote dicek sendiri-sendiri, bukan sebagai satu rantai (MD-AUD-006); sync suppress price audit (MD-AUD-007). |
| Workbook: `exportPriceList/exportWorkbook/template/preview/apply` | Ya | hash, per-row checks, whole-file transaction | Apply ya + satu batch audit | Preview tidak memakai semua validator apply; child audit disuppress (MD-AUD-007/011). |
| Public port: `listUnits`, Brand get/list, material price list/get/by-SKU, work-price list | Tidak menerima grants karena port internal aplikasi | Hanya live rows, tipe read stabil | Read only | Tidak bocor field rahasia; beberapa list tanpa batas (MD-AUD-008); chain belum difilter (MD-AUD-002). |

Seluruh action berikut juga diperiksa: Units (5), Categories (5), Brands (6), Vendors (5), SKUs (4), Pricing (9), Deletions (2), Sample Requests (5), Workbook (4), serta Settings untuk Vendor Type (4) dan promosi BQ (2). Pola umumnya benar: action membuat session context, memvalidasi payload, lalu service mengulang pemeriksaan permission. Dua pengecualian terbukti adalah JSON kontak Supplier (MD-AUD-001) dan routing `kind` harga yang mempercayai nilai runtime TypeScript (MD-AUD-013).

Error database pada create/update penting dipetakan melalui `mapWriteError`; race check-then-insert yang mempunyai partial/regular unique index akan berakhir sebagai conflict. Tidak ditemukan check-then-insert bisnis kritis tanpa constraint selain bentuk polymorphic/cross-row yang dicatat di temuan.

## Temuan

| ID | Sev | Area | Bukti yang dapat dibuka/diulang | Dampak nyata | Perbaikan yang disarankan | Work Order |
|---|---|---|---|---|---|---|
| MD-AUD-001 | **P0** | Supplier contact | `src/app/(platform)/masterdata/vendors/actions.ts:113-118` menangkap JSON parse error dan membiarkan `contacts=[]`; `src/apps/masterdata/services/vendor.service.ts:184-187` menganggap daftar itu keadaan final lalu menghapus contact yang tidak ada di daftar. Repro: Supplier berisi contact → panggil update dengan `contactsJson` rusak → action tetap sukses dan semua contact hilang. | Data contact Supplier dapat hilang dari satu request rusak/rekayasa tanpa pesan kesalahan. | Parse failure harus menghasilkan validation error; bedakan field tidak dikirim dari array kosong; tambah regression test bahwa data lama tetap ada. | WO-MD-HARDEN-01 |
| MD-AUD-002 | **P1** | Brand → Supplier → Price | `pricing.service.ts:36-52` dan `sku.service.ts:47-76` hanya mengecek SKU serta capability Supplier; schema `PriceMaterial` (`master_data.prisma:327-349`) tidak membawa/menjamin `BrandSupplier`; `brand.service.ts:132-190` dapat melepas supplier; public price reads `public/index.ts:236-293` tetap mengembalikan harga. Query kantor: 0 material price dan 0 pelanggaran saat audit. | Supplier dapat memberi harga untuk barang Brand yang tidak dibawanya; melepas relasi Brand juga dapat membuat harga lama bertentangan dengan aturan bisnis. | Enforce pada create/update/restore/import; block unlink yang masih dipakai; filter reference list supplier-first; pre-check sebelum migration/rollout. | WO-MD-CHAIN-01 |
| MD-AUD-003 | **P1** | Category lifecycle | `category.service.ts:70-79` langsung mengubah status tanpa mengecek `SkuCategory`, `BrandCategory`, `VendorCategory`, atau harga kerja aktif. Public reads memfilter Category aktif. Query kantor menemukan 0 relasi aktif ke Category inactive. | Category masih tertempel pada data aktif tetapi hilang dari pilihan/pembacaan; orang melihat data seolah tidak berkategori. | Deactivate harus ditolak selama masih dipakai data aktif, atau diwajibkan merge lebih dulu. Tambah guard semua empat keluarga pemakai dan test. | WO-MD-HARDEN-01 |
| MD-AUD-004 | **P1** | Vendor Type capability | `vendor-type.service.ts:46-79` menjaga pengurangan capability saat update, tetapi `archiveVendorType` di `:85-94` tidak menjalankan guard. `shared.ts:137-157` menganggap hanya Vendor Type live sebagai capability. Query kantor menemukan 0 Supplier/harga invalid. | Mengarsipkan tipe dapat seketika membuat Supplier aktif tidak lagi memenuhi kemampuan untuk BrandSupplier/harga yang masih aktif. | Jalankan guard ekuivalen sebelum archive; block dengan error khusus dan regression test. | WO-MD-HARDEN-01 |
| MD-AUD-005 | **P2** | Archived root mutation | `brand.service.ts:132-190`, `vendor.service.ts:149-232`, `unit.service.ts:54-68`, `category.service.ts:54-67`, dan `vendor-type.service.ts:46-82` tidak menolak root archived/inactive. Sebaliknya SKU/harga secara eksplisit menolak archived (`sku.service.ts:88-90`, `pricing.service.ts:63-65`, `:174-175`, `:289-290`). | Caller yang memegang id dapat mengubah record yang seharusnya sudah “ditutup”, walau tombol UI biasanya disembunyikan. | Tambah guard status di service dan test langsung per root; UI bukan batas keamanan. | WO-MD-HARDEN-01 |
| MD-AUD-006 | **P2** | Sample request references | `sample-request.service.ts:145-164` mengecek Vendor, SKU, dan PriceMaterial hidup secara terpisah; tidak membuktikan price itu milik SKU dan Supplier yang dipilih. `markSampleRequestPriced` (`:265-279`) menerima kombinasi itu. Query kantor: 0 mismatch/orphan. | Integrasi atau caller baru dapat menutup permintaan dengan link harga milik barang/supplier lain. | Saat `priceMaterialId` ada, baca satu row dan cocokkan `sku_id`/`supplier_vendor_id`; tambah kombinasi negatif di test. | WO-MD-HARDEN-01 |
| MD-AUD-007 | **P2** | Audit trail | `suppressAudit` menjadi input public di `pricing.service.ts:36-79` dan `sku.service.ts:47-129`; workbook memakainya di `sku-price-workbook.service.ts:168-175`; sample sync di `sample-request.service.ts:328-339`. Hanya event aggregate yang tersisa. | Riwayat per SKU/harga tidak menunjukkan siapa/flow apa yang mengubahnya; pencarian audit berdasarkan entity dapat melewatkan perubahan. | Jadikan helper suppress private/scoped dan wajib membawa parent batch event; idealnya tulis child entity event plus satu batch event. | WO-MD-HARDEN-01 |
| MD-AUD-008 | **P2** | Pagination/volume | `vendor.service.ts:15-40` memuat nested type/category/contact/Brand/count tanpa `take`; Brand/SKU/pricing lists juga tanpa pagination; `public/index.ts:170-224` dan `:296-305` tidak membatasi bila caller tak memberi limit. Data kantor hanya 13 Brand, 15 Supplier, 0 SKU, 0 material price, 1 material+labor price, 0 labor price. | Saat data membesar, satu layar dapat membaca seluruh katalog beserta banyak anak dan memperlambat semua pengguna. Ini risiko desain, bukan kelambatan terukur sekarang. | Pakai pagination/cursor canonical dengan batas maksimum; public port mewajibkan/default limit; ukur query setelah ada volume representatif. | WO-MD-HARDEN-01 |
| MD-AUD-009 | **P2** | FK indexes | Query katalog mencari FK yang kolom depannya tidak ditutup index. Master Data: `PriceLabor.unit_id`, `PriceMaterial.source_link_id`, `PriceMaterial.unit_id`, `PriceMaterialLabor.unit_id`, `Sku.base_unit_id`, `Sku.purchase_unit_id`. BQ: empat FK library pada `BqTemplateRecommendation`. StudioFlow: enam FK (`SfActivity.revision_id`, `SfChecklistItem.parent_id/template_id`, `SfDeliverable.revision_id`, `SfPhase.definition_id`, `SfScheduleTemplateItem.template_category_id`). Platform: 0. | Update/delete induk dan beberapa filter dapat memindai seluruh tabel anak dan mengambil lock lebih lama saat volume naik. | Tambah index setelah pre-check nama/duplikasi; ukur index yang benar-benar dipakai dan jangan menggandakan index yang sudah ada. | WO-MD-HARDEN-01 (MD), WO-SCHEMA-HARDEN-01 (lainnya) |
| MD-AUD-010 | **P2** | DB constraints | Schema harga memakai `Decimal(16,2)` dan currency string; `shared.ts:45-80` menjaga nonnegative + 3 huruf, tetapi katalog menunjukkan tidak ada CHECK pada tiga tabel harga. `ArchiveCause.entity_type/kind/parent_*` dan `DeletionRequest.target_type` juga free string tanpa shape/type CHECK. Unique `ArchiveCause` memuat kolom parent nullable, sehingga PostgreSQL tetap mengizinkan DIRECT cause identik; `shared.ts:112-118` mengandalkan `skipDuplicates`. Query kantor menemukan 0 amount/currency/type/duplicate-cause invalid. | Bug atau jalur tulis lain dapat menyimpan harga negatif/currency rusak, jenis lifecycle asing, atau cause ganda yang seharusnya idempotent. | Migration dengan pre-check: CHECK `amount >= 0`, currency tiga huruf besar, allow-list target/entity type dan bentuk DIRECT/PARENT; gunakan partial unique DIRECT/PARENT atau `NULLS NOT DISTINCT`. Jangan menambah FK lintas aplikasi. | WO-MD-HARDEN-01 |
| MD-AUD-011 | **P2** | Workbook preview/apply | Preview hanya mengecek Supplier live di `sku-price-workbook.service.ts:56-66`, bukan capability/BrandSupplier; dimensi memakai `Number(...) > 0` di `:88-90`, sedangkan apply memakai decimal parser service (`shared.ts:93-103`). Apply kemudian memanggil service dan dapat rollback. | File dapat tampil “siap” saat preview tetapi gagal seluruhnya saat Apply, sehingga pengguna harus menebak baris mana yang sebenarnya salah. | Preview harus memakai validator domain yang sama dengan apply dalam mode dry validation, termasuk capability dan chain setelah chain berlaku. | WO-MD-HARDEN-01 / WO-MD-WORKBOOK-01 |
| MD-AUD-012 | **P2** | Cross-row relational consistency | StudioFlow menyimpan Project+Phase+Revision sebagai FK terpisah pada Activity (`studioflow.prisma:209-230`) dan Project+Phase(+Revision) pada Checklist/Deliverable (`:258-285`, `:396-418`); DB tidak memastikan semua berasal dari Project yang sama. `BqTemplateSection.parent_id` (`bq.prisma:154-169`) tidak memastikan parent berada di template yang sama. | SQL, migration, atau service bug dapat membentuk graph yang semua FK-nya valid tetapi antarbaris tidak masuk akal; cascade berikutnya dapat menghapus bagian tak terduga. | Sebelum constraint, audit logic aplikasi terkait. Jika invariant benar, gunakan composite unique+FK atau trigger/constraint yang sempit dan test. | WO-SCHEMA-HARDEN-01 |
| MD-AUD-013 | **P2** | Pricing action trust | `savePriceAction` (`pricing/actions.ts:180-202`) tidak memvalidasi `kind`; nilai selain `material`/`material_labor` jatuh ke cabang labor. Action archive/restore memakai parser kind. TypeScript tidak memvalidasi request runtime. | Caller rusak dapat menyimpan/mengubah jenis harga yang berbeda dari maksud request. Permission tetap dicek, jadi ini bukan bypass. | Gunakan parser `PriceKind` yang sama sebelum routing semua pricing action; regression test nilai asing. | WO-MD-HARDEN-01 |
| MD-AUD-014 | **P3** | Duplicate indexes | Katalog menemukan enam kelompok index dengan definisi identik dari riwayat migration: live Brand name, live Vendor name, PriceMaterial `(sku_id,supplier_vendor_id)`, live vendor+name PriceMaterialLabor/PriceLabor, dan live unbranded-SKU slug. | Setiap write memelihara index ganda dan migration berikutnya lebih membingungkan; tidak mengubah hasil bisnis. | Bandingkan definisi dan `pg_stat_user_indexes`, lalu drop tepat satu dari tiap pasangan dalam migration tersendiri. Index raw slug dan `lower(slug)` bukan duplikat identik dan tidak termasuk daftar ini. | WO-MD-HARDEN-01 |

### Hasil pemeriksaan data kantor

Semua query berikut mengembalikan **0 pelanggaran**: rantai BrandSupplier hilang; harga/parent inactive; Supplier capability invalid; unit material tidak cocok; source link beda Brand; SKU live tanpa harga; relasi Category invalid; duplikat nama/slug Category aktif; currency/amount invalid; ArchiveCause malformed/duplicate; row live dengan archive cause; jenis archive/deletion asing; reference sample request orphan/tidak konsisten; root/harga archived tanpa cause; ketidakcocokan status timestamp Unit/Category; VendorCategory inactive; BrandSupplier invalid; contact–Brand invalid; dan target pending deletion yang tidak ada.

Hasil 0 ini hanya snapshot keadaan data kantor pada 2026-10-01; bukan bukti bahwa jalur program aman. Temuan di atas memakai urutan program atau constraint yang dapat direproduksi.

### Query katalog yang dapat dijalankan ulang

FK tanpa leading index (MD-AUD-009) diperoleh dengan query berikut di sesi read-only:

```sql
WITH fk AS (
  SELECT c.conrelid, c.conname, n.nspname AS schema_name,
         t.relname AS table_name, c.conkey
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE c.contype = 'f'
    AND n.nspname IN ('platform', 'master_data', 'studioflow', 'bq')
)
SELECT schema_name, table_name, conname, conkey
FROM fk
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_index i
  WHERE i.indrelid = fk.conrelid
    AND i.indisvalid
    AND (
      SELECT array_agg(k.attnum ORDER BY k.ord)::smallint[]
      FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
      WHERE k.ord <= cardinality(fk.conkey)
    ) = fk.conkey
)
ORDER BY schema_name, table_name, conname;
```

FK lintas schema diperiksa langsung dari kedua namespace; hasilnya kosong:

```sql
SELECT src.nspname AS source_schema, src_table.relname AS source_table,
       dst.nspname AS target_schema, dst_table.relname AS target_table,
       c.conname
FROM pg_constraint c
JOIN pg_class src_table ON src_table.oid = c.conrelid
JOIN pg_namespace src ON src.oid = src_table.relnamespace
JOIN pg_class dst_table ON dst_table.oid = c.confrelid
JOIN pg_namespace dst ON dst.oid = dst_table.relnamespace
WHERE c.contype = 'f'
  AND src.nspname IN ('platform', 'master_data', 'studioflow', 'bq')
  AND dst.nspname IN ('platform', 'master_data', 'studioflow', 'bq')
  AND src.nspname <> dst.nspname;
```

Index ganda (MD-AUD-014) dibuktikan dengan membandingkan `pg_index.indrelid`, `indkey`, `indclass`, `indcollation`, `indoption`, expression, predicate, dan uniqueness; nama index sengaja diabaikan:

```sql
SELECT n.nspname, t.relname, array_agg(i.indexrelid::regclass::text) AS indexes
FROM pg_index i
JOIN pg_class t ON t.oid = i.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'master_data'
GROUP BY n.nspname, t.relname, i.indisunique, i.indisprimary,
         i.indkey, i.indclass, i.indcollation, i.indoption,
         pg_get_expr(i.indexprs, i.indrelid),
         pg_get_expr(i.indpred, i.indrelid)
HAVING count(*) > 1
ORDER BY t.relname;
```

## Cakupan constraint, service, dan test per invariant

| Invariant | DB constraint | Service check | Test | Kesimpulan |
|---|---|---|---|---|
| 1. Brand → Supplier → Price | FK terpisah saja; tidak ada chain constraint | **Tidak ada** pada material price/SKU initial price/unlink | Tidak ada negative chain test | **Kosong pada aturan intinya** (MD-AUD-002). |
| 2. Archive/restore/delete simetris | FK Restrict/Cascade, partial uniques, ArchiveCause | Umumnya lengkap untuk Brand/Vendor/SKU/price | Integrasi mencakup flow utama | Gap Category, VendorType, archived-root mutation, dan bentuk ArchiveCause (003/004/005/010). |
| 3. Category satu daftar, kind dan uniqueness | Enum kind + partial unique aktif | Create/rename/merge same-kind dijaga | Ada create/merge/vendor-category tests | Deactivate dependency guard belum ada (003). |
| 4. Decimal/currency/unit | Decimal(16,2), FK unit, dimension CHECK; **tanpa price CHECK** | Amount/currency/unit dijaga | Ada positive/negative service tests | Defense-in-depth DB belum ada (010). |
| 5. Write permission, actor, audit, transaction | DB tidak mewakili permission/audit | Setiap service write memeriksa izin dan serializable transaction | Broad integration coverage | Per-entity audit dapat disuppress (007); action parsing gap (001/013). |
| 6. Boundary/snapshot | Tidak ada cross-schema FK | Public port read-only; app tidak menulis app lain | Boundary test lulus dalam suite | **Terpenuhi.** |

Tidak ditemukan invariant yang benar-benar tanpa DB, service, dan test sekaligus selain aturan inti **BrandSupplier pada material price**, yang hanya memiliki tabel relasi tetapi tidak dihubungkan ke write harga.

## Hal yang masih perlu dipastikan oleh Lead

Ini bukan temuan baru dan tidak boleh ditebak saat membuat Work Order:

1. Untuk Category yang masih dipakai, default yang disarankan adalah **block deactivation dan minta merge/reassign**, bukan cascade otomatis.
2. Audit event workbook/sample sync: putuskan apakah setiap child entity membutuhkan event sendiri. Rekomendasi audit ini: ya, ditambah satu batch/flow event.
3. Cross-row consistency StudioFlow/BQ perlu pemeriksaan service aplikasi masing-masing sebelum memilih composite FK, trigger, atau cukup service+test.
4. Pagination perlu angka default/max dan target volume. Rekomendasi awal: cursor dengan max yang sama di semua directory/public port, lalu ukur.
5. Untuk constraint type polymorphic, daftar type harus diambil dari satu registry canonical agar migration dan service tidak kembali berbeda.

## Yang tidak diaudit

- Tidak ada write, fixture, repair, migration, seed, atau perubahan data.
- Tidak mengakses repository atau database legacy.
- Tidak mengaudit UI/UX atau melakukan browser acceptance.
- Tidak mengaudit seluruh logic StudioFlow/BQ; hanya schema dan jalur yang membaca Master Data melalui public port.
- Tidak melakukan load test, `EXPLAIN ANALYZE` pada volume produksi, race stress test, atau mengeksekusi migration usulan.
- Tidak menilai kebenaran bisnis copy/label layar.

## Verifikasi akhir

- Baseline `npm test`: **PASS — 712/712**, 158 suite, 0 gagal/cancel/skip/todo, sekitar 69,5 detik.
- Final `npm test`: **PASS — 712/712**, 158 suite, 0 gagal/cancel/skip/todo, sekitar 70,8 detik.
- `npm run check`: **PASS** (typecheck, architecture boundaries, legacy-runtime guard).
- `npm run lint`: **PASS dengan 0 error dan 2 warning lama** tentang elemen `<img>` pada dua file Presentation StudioFlow; tidak terkait audit/diff.
- `npm run build`: **PASS** (Next.js production build selesai).
- `git diff --check`: **PASS** sebelum staging; pemeriksaan staged diulang sebelum commit.
- Scope diff: hanya report audit, `docs/BACKLOG.md`, dan `CHANGELOG.md`; tidak ada source/schema/test/contract yang berubah.
