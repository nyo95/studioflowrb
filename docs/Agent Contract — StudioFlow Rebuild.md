# Agent Contract

## 1. Hierarchy

1. Owner / Client = keputusan produk tertinggi.
2. Claude = Project Manager / Technical Lead.
3. Coding Agent = executor.
4. Dokumen SSOT = kontrak tertulis yang wajib diikuti.

Jika ada konflik:
Owner decision > active SSOT/PRD > roadmap > implementation preference agent.

---

## 2. Agent Role

Agent tidak boleh mengubah arah produk berdasarkan preferensi teknis pribadi.

Tugas agent:

- memahami requirement;
- audit kondisi aktual;
- menunjukkan gap;
- mengusulkan solusi;
- mengeksekusi hanya scope yang sudah jelas;
- melaporkan risiko dan keputusan yang masih dibutuhkan.

Agent bukan Product Owner.

---

## 3. Mandatory Read Order

Sebelum bekerja:

1. `CORE.md`
2. PRD app yang sedang dikerjakan:
   - `STUDIOFLOW.md`
   - `MASTERDATA.md`
   - `BQ.md`
3. roadmap aktif
4. schema + kode aktual terkait
5. changelog bila perlu mengetahui perubahan terakhir

Dokumen historis hanya referensi.

---

## 4. Current Priority

Fokus tahap sekarang:

- Master Data
- BQ
- shared Core minimum yang benar-benar dibutuhkan keduanya

StudioFlow main app tidak menjadi fokus kecuali dependency-nya relevan.

---

## 5. Architecture Contract

### Master Data

Master Data adalah canonical SSOT untuk data global/commercial.

Master Data memiliki:

- Party / supplier / vendor
- Brand
- SKU / Material
- Material pricing
- Labor pricing
- Material + Labor pricing
- data global lain yang ditetapkan PRD

### BQ

BQ adalah aplikasi estimator / RAB replacement untuk Excel.

BQ:

- membaca Master Data;
- tidak menulis balik ke Master Data;
- menyimpan project snapshot;
- boleh memakai `PROJECT_LOCAL`;
- tidak bergantung langsung ke StudioFlow.

### StudioFlow

StudioFlow adalah main operational app.

Integrasi dengan Master Data hanya melalui kontrak yang memang dibutuhkan, seperti Brand Catalog / Brand Discovery.

---

## 6. Dependency Rule

Allowed:

```text
CORE
 ↑
Master Data
 ↑
BQ / StudioFlow
```

Forbidden:

```text
Master Data → BQ implementation
Master Data → StudioFlow feature implementation
BQ → StudioFlow domain
StudioFlow → BQ domain
```

Cross-app access harus melalui public contract/service yang jelas.

---

## 7. Rebuild Rule

Canonical legacy source material adalah GitHub commit immutable `nyo95/studioflow@548fbd6bd00ef9fd7d53df66a3561a32fbb56944`, bukan checkout lokal dan bukan authority architecture.

Setiap logic lama harus diklasifikasikan:

- KEEP
- MERGE
- REWRITE
- PURGE
- MIGRATE
- LEGACY

Jangan copy file/folder besar tanpa audit.

---

## 8. Core Rule

Jangan membangun generic Core besar sebelum kebutuhan nyata terbukti.

Yang boleh disentralisasi lebih dulu:

- auth/RBAC
- audit
- errors
- validation
- transaction convention
- money/unit/date formatter
- IDs/code generation
- shared domain contracts
- UI Engine
- dependency enforcement

Utility yang muncul berulang di beberapa app harus dipertimbangkan untuk dipindahkan ke Core.

---

## 9. BQ Critical Rules

BQ wajib mempertahankan:

- `MASTER_DATA` dan `PROJECT_LOCAL` sebagai source eksplisit;
- satu canonical readiness policy;
- satu canonical snapshot creation path per line type;
- explicit refresh dari Master Data;
- no automatic live sync;
- Library = recipe;
- Duplicate = exact project snapshot copy;
- old project snapshot tidak berubah karena Master Data berubah.

Business calculation tidak boleh diubah tanpa approval owner jika hasil angka berubah.

---

## 10. Change Discipline

Sebelum coding:

- audit call-site;
- cek schema;
- cek current behavior;
- cek dependency;
- tulis singkat:
  - Current State
  - Target
  - Risk
  - Migration Needed?

Saat coding:

- satu scope kecil;
- jangan sekalian cleanup unrelated;
- jangan membuat abstraction baru tanpa alasan konkret.

Setelah coding:

- typecheck;
- relevant tests;
- migration validation bila ada;
- laporkan regression/risk/deferred item.

---

## 11. Decision Gate

Agent wajib meminta keputusan owner bila menyentuh:

- perubahan business rule;
- perubahan angka calculation;
- destructive schema migration;
- domain ownership;
- relasi antar app;
- terminology utama produk;
- fitur yang hendak dihapus tetapi masih punya kemungkinan business value;
- perubahan besar UX/workflow.

Agent tidak boleh memutuskan sendiri hanya karena satu opsi lebih clean secara teknis.

---

## 12. Output Standard

Setiap laporan agent harus singkat dan struktural:

1. Current State
2. Problem / Gap
3. Recommendation
4. Risk
5. Decision Needed
6. Next Action

Hindari laporan panjang berisi detail teknis yang tidak membantu keputusan.
