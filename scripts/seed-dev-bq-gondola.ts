import { config as loadEnv } from "dotenv";

/**
 * Development seed for the BQ "Gondola Sociolla" walk (R9.171): two material suppliers with different prices for
 * the same SKUs (gypsum 9 mm, multiplek, HPL, hollow, LED strip), two labor vendors, and one example Assembly.
 * Every record goes through the Master Data and BQ services (validation, audit), is named "(contoh)" with a note
 * carrying SEED_TAG, and is reused when it already exists, so running it twice changes nothing.
 *
 *   STUDIOFLOW_LOCATION=kantor npm run seed:dev-bq
 *
 * It refuses any database other than the rebuild development database `studioflow_rebuild`.
 */

const SEED_TAG = "Data contoh BQ (seed R9.171)";
/** What is being seeded, for a readable failure. */
let step = "start";
const location = process.env.STUDIOFLOW_LOCATION;
const envFile = location === "rumah" ? ".env.rumah" : location === "kantor" ? ".env.kantor" : null;
if (!envFile) throw new Error("Set STUDIOFLOW_LOCATION to rumah or kantor before seeding.");
loadEnv({ path: envFile, quiet: true });

const SUPPLIER_A = "Sinar Gypsum (Supplier A, contoh)";
const SUPPLIER_B = "Mitra Plafon (Supplier B, contoh)";
const LABOR_A = "Tim Tukang Andalan (contoh)";
const LABOR_B = "CV Karya Interior (contoh)";

type Dimensions = { length?: string; width?: string; thickness?: string };
const MATERIALS: Array<{ name: string; unit: string; dims?: Dimensions; a: string; b: string }> = [
  { name: "Gypsum Board 9mm", unit: "sheet", dims: { length: "1200", width: "2400", thickness: "9" }, a: "72000", b: "76500" },
  { name: "Gypsum Board 12mm", unit: "sheet", dims: { length: "1200", width: "2400", thickness: "12" }, a: "95000", b: "91500" },
  { name: "Hollow Galvalum 4x4", unit: "pcs", a: "28000", b: "26500" },
  { name: "Multiplek 18mm", unit: "sheet", dims: { length: "1220", width: "2440", thickness: "18" }, a: "245000", b: "238000" },
  { name: "HPL Putih Doff", unit: "sheet", dims: { length: "1220", width: "2440" }, a: "185000", b: "179000" },
  { name: "Lampu LED Strip 3000K", unit: "m", a: "65000", b: "62000" },
];
const WORK: Array<{ kind: "labor" | "material-labor"; name: string; unit: string; vendor: string; amount: string }> = [
  { kind: "labor", name: "Upah pasang gypsum", unit: "m2", vendor: LABOR_A, amount: "45000" },
  { kind: "labor", name: "Upah pasang gypsum", unit: "m2", vendor: LABOR_B, amount: "42000" },
  { kind: "labor", name: "Upah rakit gondola", unit: "unit", vendor: LABOR_A, amount: "350000" },
  { kind: "labor", name: "Upah rakit gondola", unit: "unit", vendor: LABOR_B, amount: "375000" },
  { kind: "material-labor", name: "Plafon gypsum 9mm terpasang", unit: "m2", vendor: LABOR_A, amount: "165000" },
];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  const database = url.split("?")[0]?.split("/").pop();
  if (database !== "studioflow_rebuild") throw new Error(`Refusing to seed database "${database ?? "(none)"}": only studioflow_rebuild is allowed.`);

  // A short-lived CLI composition like cleanup-messenger-attachments.ts: no Next runtime, no server-only marker.
  const [{ PrismaPg }, { PrismaClient }, { Pool }, { createAuditEventWriter }, { runSerializableTransaction }, { createMasterDataService }, { createMasterDataPublicRead, MASTERDATA_PERMISSIONS }, { createBqService, BQ_PERMISSIONS }] = await Promise.all([
    import("@prisma/adapter-pg"),
    import("@/generated/prisma/client"),
    import("pg"),
    import("@platform/core/audit/persistence"),
    import("@platform/core/db/transactions"),
    import("@/apps/masterdata/service"),
    import("@/apps/masterdata/public"),
    import("@/apps/bq/service"),
  ]);
  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const owner = await prisma.user.findFirst({ where: { status: "ACTIVE", user_roles: { some: { role: { code: "platform-owner" } } } }, select: { id: true, display_name: true } });
    if (!owner) throw new Error("No active Platform Owner to record as the actor.");
    const actor = { kind: "USER" as const, userId: owner.id, label: owner.display_name };
    const grants = [...Object.values(MASTERDATA_PERMISSIONS), ...Object.values(BQ_PERMISSIONS)];
    const auditWriter = createAuditEventWriter();
    const md = createMasterDataService(prisma, { auditWriter, runTransaction: (work) => runSerializableTransaction(prisma, work) });
    const bq = createBqService(prisma, {
      auditWriter,
      runTransaction: (work) => runSerializableTransaction(prisma, (tx) => work(tx as unknown as typeof prisma)),
      masterData: createMasterDataPublicRead(prisma),
    });
    const created: string[] = [];

    const unitId = async (code: string) => (await prisma.unit.findUniqueOrThrow({ where: { code } })).id;
    const vendorTypeId = async (code: string) => (await prisma.vendorType.findUniqueOrThrow({ where: { code } })).id;
    // Master Data title-cases names, so every lookup ignores letter case.
    const named = (name: string) => ({ equals: name, mode: "insensitive" as const });
    const category = async (name: string, kind: "PRODUCT" | "WORK") => {
      step = `category ${name}`;
      const found = await prisma.category.findFirst({ where: { name: named(name), kind, status: "ACTIVE" } });
      if (found) return found.id;
      created.push(`category ${name}`);
      return (await md.createCategory({ grants, actor, name, kind })).categoryId;
    };
    const vendor = async (name: string, typeCode: string) => {
      step = `vendor ${name}`;
      const found = await prisma.vendor.findFirst({ where: { name: named(name), deleted_at: null } });
      if (found) return found.id;
      created.push(`vendor ${name}`);
      return (await md.createVendor({ grants, actor, name, notes: SEED_TAG, vendorTypeIds: [await vendorTypeId(typeCode)] })).vendorId;
    };

    const materials = await category("Materials", "PRODUCT");
    const sipil = await category("Sipil", "WORK");
    const mm = await unitId("mm");
    const supplierA = await vendor(SUPPLIER_A, "SUPPLIER");
    const supplierB = await vendor(SUPPLIER_B, "DISTRIBUTOR");
    const laborA = await vendor(LABOR_A, "SUBCON");
    const laborB = await vendor(LABOR_B, "SUBCON");

    const priceIds = new Map<string, string>();
    for (const item of MATERIALS) {
      const unit = await unitId(item.unit);
      step = `SKU ${item.name}`;
      let sku = await prisma.sku.findFirst({ where: { name: named(item.name), deleted_at: null } });
      if (!sku) {
        created.push(`SKU ${item.name}`);
        const result = await md.createSku({
          grants, actor, name: item.name, notes: SEED_TAG, categoryId: materials,
          ...(item.dims ? { dimensionLength: item.dims.length, dimensionWidth: item.dims.width, dimensionThickness: item.dims.thickness, dimensionUnitId: mm } : {}),
          priceMaterials: [
            { supplierVendorId: supplierA, amount: item.a, currency: "IDR", unitId: unit },
            { supplierVendorId: supplierB, amount: item.b, currency: "IDR", unitId: unit },
          ],
        });
        sku = await prisma.sku.findUniqueOrThrow({ where: { id: result.skuId } });
      }
      for (const [supplierId, amount, label] of [[supplierA, item.a, "A"], [supplierB, item.b, "B"]] as const) {
        let price = await prisma.priceMaterial.findFirst({ where: { sku_id: sku.id, supplier_vendor_id: supplierId, deleted_at: null } });
        if (!price) {
          created.push(`price ${item.name} / ${label}`);
          await md.createPriceMaterial({ grants, actor, skuId: sku.id, supplierVendorId: supplierId, unitId: unit, amount, currency: "IDR" });
          price = await prisma.priceMaterial.findFirstOrThrow({ where: { sku_id: sku.id, supplier_vendor_id: supplierId, deleted_at: null } });
        }
        priceIds.set(`${item.name}|${label}`, price.id);
      }
    }

    for (const work of WORK) {
      step = `${work.kind} price ${work.name} / ${work.vendor}`;
      const vendorId = work.vendor === LABOR_A ? laborA : laborB;
      const table = work.kind === "labor" ? prisma.priceLabor : prisma.priceMaterialLabor;
      let price = await (table as typeof prisma.priceLabor).findFirst({ where: { name: named(work.name), vendor_id: vendorId, deleted_at: null } });
      if (!price) {
        created.push(`${work.kind} price ${work.name} / ${work.vendor}`);
        const input = { grants, actor, name: work.name, categoryId: sipil, vendorId, unitId: await unitId(work.unit), amount: work.amount, currency: "IDR", notes: SEED_TAG };
        if (work.kind === "labor") await md.createPriceLabor(input);
        else await md.createPriceMaterialLabor(input);
        price = await (table as typeof prisma.priceLabor).findFirstOrThrow({ where: { name: named(work.name), vendor_id: vendorId, deleted_at: null } });
      }
      priceIds.set(`${work.name}|${work.vendor}`, price.id);
    }

    const assemblyName = "Gondola Sociolla (contoh)";
    step = `assembly ${assemblyName}`;
    if (!(await prisma.bqAssemblyTemplate.findFirst({ where: { name: assemblyName } }))) {
      created.push(`assembly ${assemblyName}`);
      const assembly = await bq.createAssemblyTemplate({ grants, actor, name: assemblyName, description: `${SEED_TAG}. Satu bay gondola 120 cm: badan multiplek + HPL, rangka hollow, lampu LED, upah rakit.` });
      const lines: Array<{ key: string; kind: "material" | "labor"; qty: string }> = [
        { key: "Multiplek 18mm|B", kind: "material", qty: "2" },
        { key: "HPL Putih Doff|B", kind: "material", qty: "2" },
        { key: "Hollow Galvalum 4x4|A", kind: "material", qty: "6" },
        { key: "Lampu LED Strip 3000K|A", kind: "material", qty: "3" },
        { key: `Upah rakit gondola|${LABOR_A}`, kind: "labor", qty: "1" },
      ];
      for (const line of lines) {
        await bq.addAssemblySourcedLine({ grants, actor, assemblyId: assembly.id, sourceType: "MASTERDATA", sourceRefId: priceIds.get(line.key)!, sourceKind: line.kind, qty: line.qty });
      }
    }

    console.log(created.length === 0 ? "Seed already present; nothing changed." : `Seeded ${created.length} record(s):\n- ${created.join("\n- ")}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  // Master Data and Prisma errors can carry the useful line last; print the error kind, code and message.
  const code = typeof error === "object" && error !== null && "code" in error ? ` ${String((error as { code: unknown }).code)}` : "";
  const message = error instanceof Error ? error.message.trim().split("\n").filter(Boolean).at(-1) ?? "" : "Unknown error";
  console.error(`BQ gondola seed failed (${step})${code}: ${message}`);
  process.exitCode = 1;
});
