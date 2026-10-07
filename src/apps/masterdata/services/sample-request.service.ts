import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { type AuditActor } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { requirePermission, type PermissionGrants } from "@platform/core/rbac";

import { MASTERDATA_PERMISSIONS, type MasterDataServicePorts, type TxClient, actorIsUsable, requiredAmount, requiredCurrency, writeAudit } from "./shared";
import { createPricingService } from "./pricing.service";

const ENTITY = "sample_request_intake";
const TEXT_MAX = 300;
const NOTE_MAX = 1000;
const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 500;

export type SampleRequestIntakeStatus = "IN_PROGRESS" | "PRICED" | "DECLINED";

/** Facts copied from the StudioFlow request when staff take it. Supplied by the coordinator, never by a browser. */
export type SampleRequestSnapshot = {
  sourceRequestId: string;
  sourceProjectId: string;
  sourceProjectName: string;
  sourceOptionId: string;
  productName: string;
  brandName: string | null;
  color: string | null;
  pattern: string | null;
  finishing: string | null;
  dimension: string | null;
  requestedFrom: string;
  requestNote: string | null;
  requesterUserId: string;
  requesterLabel: string;
  requestedAt: Date;
};

export type SampleQuoteInput = {
  vendorId?: string | null;
  quotedAmount?: string | null;
  quotedCurrency?: string | null;
  staffNote?: string | null;
  skuId?: string | null;
  priceMaterialId?: string | null;
};

export type SampleRequestIntakeRead = SampleRequestSnapshot & {
  id: string;
  status: SampleRequestIntakeStatus;
  vendorId: string | null;
  quotedAmount: string | null;
  quotedCurrency: string | null;
  staffNote: string | null;
  skuId: string | null;
  priceMaterialId: string | null;
  linkedSkuName: string | null;
  linkedSkuCode: string | null;
  linkedPriceAmount: string | null;
  handledBy: { id: string; label: string };
  startedAt: Date;
  resolvedAt: Date | null;
  shelvedSample?: { id: string; rack: string; box: string } | null;
};

type Row = Awaited<ReturnType<PrismaClient["sampleRequestIntake"]["findUniqueOrThrow"]>>;

function toRead(row: Row, links: { skuName: string | null; skuCode: string | null; priceAmount: string | null; shelvedSample: { id: string; rack: string; box: string } | null } = { skuName: null, skuCode: null, priceAmount: null, shelvedSample: null }): SampleRequestIntakeRead {
  return {
    id: row.id,
    status: row.status,
    sourceRequestId: row.source_request_id,
    sourceProjectId: row.source_project_id,
    sourceProjectName: row.source_project_name,
    sourceOptionId: row.source_option_id,
    productName: row.product_name,
    brandName: row.brand_name,
    color: row.color,
    pattern: row.pattern,
    finishing: row.finishing,
    dimension: row.dimension,
    requestedFrom: row.requested_from,
    requestNote: row.request_note,
    requesterUserId: row.requester_user_id,
    requesterLabel: row.requester_label,
    requestedAt: row.requested_at,
    vendorId: row.vendor_id,
    quotedAmount: row.quoted_amount ? row.quoted_amount.toString() : null,
    quotedCurrency: row.quoted_currency,
    staffNote: row.staff_note,
    skuId: row.sku_id,
    priceMaterialId: row.price_material_id,
    linkedSkuName: links.skuName,
    linkedSkuCode: links.skuCode,
    linkedPriceAmount: links.priceAmount,
    handledBy: { id: row.handled_by_user_id, label: row.handled_by_label },
    startedAt: row.started_at,
    resolvedAt: row.resolved_at,
    shelvedSample: links.shelvedSample,
  };
}

async function enrichIntakes(db: PrismaClient, rows: readonly Row[]): Promise<SampleRequestIntakeRead[]> {
  const skuIds = [...new Set(rows.flatMap((row) => row.sku_id ? [row.sku_id] : []))];
  const priceIds = [...new Set(rows.flatMap((row) => row.price_material_id ? [row.price_material_id] : []))];
  const [skus, prices, samples] = await Promise.all([
    skuIds.length ? db.sku.findMany({ where: { id: { in: skuIds } }, select: { id: true, name: true, code: true } }) : [],
    priceIds.length ? db.priceMaterial.findMany({ where: { id: { in: priceIds } }, select: { id: true, amount: true } }) : [],
    rows.length ? db.sample.findMany({ where: { source_intake_id: { in: rows.map((row) => row.id) } }, select: { id: true, source_intake_id: true, rack: true, box: true } }) : [],
  ]);
  const skuById = new Map(skus.map((sku) => [sku.id, sku]));
  const priceById = new Map(prices.map((price) => [price.id, price]));
  const sampleByIntakeId = new Map(samples.flatMap((sample) => sample.source_intake_id ? [[sample.source_intake_id, { id: sample.id, rack: sample.rack, box: sample.box }] as const] : []));
  return rows.map((row) => {
    const sku = row.sku_id ? skuById.get(row.sku_id) : undefined;
    const price = row.price_material_id ? priceById.get(row.price_material_id) : undefined;
    return toRead(row, { skuName: sku?.name ?? null, skuCode: sku?.code ?? null, priceAmount: price?.amount.toString() ?? null, shelvedSample: sampleByIntakeId.get(row.id) ?? null });
  });
}

function text(value: string | null | undefined, max: number, code: string, label: string, required = false): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    if (required) throw new AppError("VALIDATION", code, `${label} is required.`);
    return null;
  }
  if (trimmed.length > max) throw new AppError("VALIDATION", code, `${label} must be ${max} characters or fewer.`);
  return trimmed;
}

const notFound = () => new AppError("NOT_FOUND", "SAMPLE_INTAKE_NOT_FOUND", "This sample request is no longer in the queue.");

export function createSampleRequestService(db: PrismaClient, ports: MasterDataServicePorts) {
  const { runTransaction } = ports;

  async function openIntake(tx: TxClient, intakeId: string): Promise<Row> {
    const row = await tx.sampleRequestIntake.findUnique({ where: { id: intakeId } });
    if (!row) throw notFound();
    if (row.status !== "IN_PROGRESS") throw new AppError("CONFLICT", "SAMPLE_INTAKE_NOT_OPEN", "This sample request was already finished.");
    return row;
  }

  function samplePriceNote(row: Row): string {
    return `From sample request: ${row.product_name} (${row.source_project_name})`;
  }

  function appendNote(existing: string | null, note: string): string {
    return existing?.includes(note) ? existing : [existing, note].filter(Boolean).join("\n");
  }

  /** Validates the quote fields against live Master Data and returns only the columns the caller actually set. */
  async function quoteData(tx: TxClient, current: Row, input: SampleQuoteInput) {
    const data: Prisma.SampleRequestIntakeUncheckedUpdateInput = {};
    if (input.vendorId !== undefined) {
      if (input.vendorId !== null && !(await tx.vendor.findFirst({ where: { id: input.vendorId, deleted_at: null }, select: { id: true } }))) {
        throw new AppError("VALIDATION", "SAMPLE_VENDOR_NOT_FOUND", "Choose a supplier that still exists.");
      }
      data.vendor_id = input.vendorId;
    }
    if (input.skuId !== undefined) {
      if (input.skuId !== null && !(await tx.sku.findFirst({ where: { id: input.skuId, deleted_at: null }, select: { id: true } }))) {
        throw new AppError("VALIDATION", "SAMPLE_SKU_NOT_FOUND", "Choose a SKU that still exists.");
      }
      data.sku_id = input.skuId;
    }
    let selectedPrice: { id: string; sku_id: string; supplier_vendor_id: string } | null = null;
    if (input.priceMaterialId !== undefined) {
      if (input.priceMaterialId !== null) selectedPrice = await tx.priceMaterial.findFirst({ where: { id: input.priceMaterialId, deleted_at: null }, select: { id: true, sku_id: true, supplier_vendor_id: true } });
      if (input.priceMaterialId !== null && !selectedPrice) {
        throw new AppError("VALIDATION", "SAMPLE_PRICE_NOT_FOUND", "Choose a material price that still exists.");
      }
      data.price_material_id = input.priceMaterialId;
    }
    const effectivePrice = input.priceMaterialId === undefined
      ? (current.price_material_id ? await tx.priceMaterial.findFirst({ where: { id: current.price_material_id, deleted_at: null }, select: { id: true, sku_id: true, supplier_vendor_id: true } }) : null)
      : selectedPrice;
    if (effectivePrice) {
      const effectiveSkuId = data.sku_id === undefined ? current.sku_id : data.sku_id;
      const effectiveVendorId = data.vendor_id === undefined ? current.vendor_id : data.vendor_id;
      if (effectivePrice.sku_id !== effectiveSkuId || effectivePrice.supplier_vendor_id !== effectiveVendorId) {
        throw new AppError("VALIDATION", "SAMPLE_PRICE_RELATION_MISMATCH", "The selected material price must belong to the chosen SKU and Supplier.");
      }
    }
    if (input.quotedAmount !== undefined) {
      if (input.quotedAmount === null || input.quotedAmount.trim() === "") {
        data.quoted_amount = null;
        data.quoted_currency = null;
      } else {
        data.quoted_amount = requiredAmount(input.quotedAmount);
        const currency = input.quotedCurrency ?? current.quoted_currency;
        if (!currency) throw new AppError("VALIDATION", "CURRENCY_INVALID", "Currency is required with an amount.");
        data.quoted_currency = requiredCurrency(currency);
      }
    } else if (input.quotedCurrency !== undefined) {
      if (input.quotedCurrency === null) {
        // An amount without a currency is meaningless, so clearing the currency alone
        // clears the amount too — the same invariant the amount branch above already keeps.
        data.quoted_currency = null;
        data.quoted_amount = null;
      } else {
        if (current.quoted_amount === null) throw new AppError("VALIDATION", "SAMPLE_AMOUNT_REQUIRED", "Enter the amount before its currency.");
        data.quoted_currency = requiredCurrency(input.quotedCurrency);
      }
    }
    if (input.staffNote !== undefined) data.staff_note = text(input.staffNote, NOTE_MAX, "SAMPLE_NOTE_TOO_LONG", "Note");
    return data;
  }

  function changesOf(current: Row, data: Prisma.SampleRequestIntakeUncheckedUpdateInput) {
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const compare = (field: string, from: unknown, to: unknown) => {
      if (to !== undefined && String(from ?? "") !== String(to ?? "")) changes[field] = { from: from ?? null, to: to ?? null };
    };
    compare("vendorId", current.vendor_id, data.vendor_id);
    compare("skuId", current.sku_id, data.sku_id);
    compare("priceMaterialId", current.price_material_id, data.price_material_id);
    compare("quotedAmount", current.quoted_amount?.toString(), data.quoted_amount?.toString());
    compare("quotedCurrency", current.quoted_currency, data.quoted_currency);
    return changes;
  }

  return {
    /** Staff take a request. One intake per StudioFlow request; a second taker gets a clear conflict. */
    async startSampleRequestIntake(input: { grants: PermissionGrants; actor: AuditActor; snapshot: SampleRequestSnapshot; quote?: SampleQuoteInput }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.sampleRequestManage);
      actorIsUsable(input.actor);
      const s = input.snapshot;
      const data = {
        source_request_id: text(s.sourceRequestId, TEXT_MAX, "SAMPLE_SOURCE_INVALID", "Request id", true)!,
        source_project_id: text(s.sourceProjectId, TEXT_MAX, "SAMPLE_SOURCE_INVALID", "Project id", true)!,
        source_project_name: text(s.sourceProjectName, TEXT_MAX, "SAMPLE_SOURCE_INVALID", "Project name", true)!,
        source_option_id: text(s.sourceOptionId, TEXT_MAX, "SAMPLE_SOURCE_INVALID", "Option id", true)!,
        product_name: text(s.productName, TEXT_MAX, "SAMPLE_SOURCE_INVALID", "Product name", true)!,
        brand_name: text(s.brandName, TEXT_MAX, "SAMPLE_SOURCE_INVALID", "Brand"),
        color: text(s.color, TEXT_MAX, "SAMPLE_SOURCE_INVALID", "Color"),
        pattern: text(s.pattern, TEXT_MAX, "SAMPLE_SOURCE_INVALID", "Pattern"),
        finishing: text(s.finishing, TEXT_MAX, "SAMPLE_SOURCE_INVALID", "Finishing"),
        dimension: text(s.dimension, TEXT_MAX, "SAMPLE_SOURCE_INVALID", "Dimension"),
        requested_from: text(s.requestedFrom, TEXT_MAX, "SAMPLE_SOURCE_INVALID", "Requested from") ?? "",
        request_note: text(s.requestNote, NOTE_MAX, "SAMPLE_SOURCE_INVALID", "Request note"),
        requester_user_id: text(s.requesterUserId, TEXT_MAX, "SAMPLE_SOURCE_INVALID", "Requester", true)!,
        requester_label: text(s.requesterLabel, TEXT_MAX, "SAMPLE_SOURCE_INVALID", "Requester name", true)!,
        requested_at: s.requestedAt,
        handled_by_user_id: input.actor.userId!,
        handled_by_label: input.actor.label,
      };
      return runTransaction(async (tx) => {
        const existing = await tx.sampleRequestIntake.findUnique({ where: { source_request_id: data.source_request_id } });
        if (existing) {
          if (existing.status !== "IN_PROGRESS") throw new AppError("CONFLICT", "SAMPLE_INTAKE_ALREADY_RESOLVED", "This sample request was already finished.");
          // The same person pressing Take twice is not an error; a different person is.
          if (existing.handled_by_user_id === input.actor.userId) return (await enrichIntakes(tx as PrismaClient, [existing]))[0];
          throw new AppError("CONFLICT", "SAMPLE_INTAKE_ALREADY_TAKEN", `${existing.handled_by_label} already took this request.`);
        }
        let row: Row;
        try {
          row = await tx.sampleRequestIntake.create({ data });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            throw new AppError("CONFLICT", "SAMPLE_INTAKE_ALREADY_TAKEN", "Another staff member just took this request.");
          }
          throw error;
        }
        if (input.quote) {
          const quote = await quoteData(tx, row, input.quote);
          row = await tx.sampleRequestIntake.update({ where: { id: row.id }, data: quote });
        }
        await writeAudit(ports, tx, { action: "masterdata.sample-request.started", entityType: ENTITY, entityId: row.id, actor: input.actor, metadata: { sourceRequestId: row.source_request_id, sourceProjectId: row.source_project_id } });
        return (await enrichIntakes(tx as PrismaClient, [row]))[0];
      });
    },

    /** Saves the vendor's quote and links while the request is still being worked. Fields left undefined are unchanged. */
    async recordSampleQuote(input: { grants: PermissionGrants; actor: AuditActor; intakeId: string } & SampleQuoteInput) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.sampleRequestManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const current = await openIntake(tx, input.intakeId);
        const data = await quoteData(tx, current, input);
        if (Object.keys(data).length === 0) return (await enrichIntakes(tx as PrismaClient, [current]))[0];
        const row = await tx.sampleRequestIntake.update({ where: { id: current.id }, data });
        await writeAudit(ports, tx, { action: "masterdata.sample-request.quote-recorded", entityType: ENTITY, entityId: row.id, actor: input.actor, changes: changesOf(current, data), metadata: { sourceRequestId: row.source_request_id } });
        return (await enrichIntakes(tx as PrismaClient, [row]))[0];
      });
    },

    /** Finishes the request as priced. A priced request must state a price: an amount or a linked material price. */
    async markSampleRequestPriced(input: { grants: PermissionGrants; actor: AuditActor; intakeId: string } & SampleQuoteInput) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.sampleRequestManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const current = await openIntake(tx, input.intakeId);
        const data = await quoteData(tx, current, input);
        const amount = data.quoted_amount !== undefined ? data.quoted_amount : current.quoted_amount;
        const priceId = data.price_material_id !== undefined ? data.price_material_id : current.price_material_id;
        if (amount === null && priceId === null) {
          throw new AppError("VALIDATION", "SAMPLE_PRICE_REQUIRED", "Enter the quoted price or link the material price before marking this priced.");
        }
        const row = await tx.sampleRequestIntake.update({ where: { id: current.id }, data: { ...data, status: "PRICED", resolved_at: new Date() } });
        await writeAudit(ports, tx, { action: "masterdata.sample-request.priced", entityType: ENTITY, entityId: row.id, actor: input.actor, changes: changesOf(current, data), metadata: { sourceRequestId: row.source_request_id, sourceProjectId: row.source_project_id } });
        await ports.sampleRequestNotifier?.resolved(tx, { outcome: "priced", intake: toRead(row) });
        return (await enrichIntakes(tx as PrismaClient, [row]))[0];
      });
    },

    /** Finishes the request without a price. The reason is required and is kept in the note. */
    async declineSampleRequest(input: { grants: PermissionGrants; actor: AuditActor; intakeId: string; reason: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.sampleRequestManage);
      actorIsUsable(input.actor);
      const reason = text(input.reason, NOTE_MAX, "SAMPLE_REASON_INVALID", "A reason", true)!;
      return runTransaction(async (tx) => {
        const current = await openIntake(tx, input.intakeId);
        const row = await tx.sampleRequestIntake.update({ where: { id: current.id }, data: { status: "DECLINED", staff_note: reason, resolved_at: new Date() } });
        await writeAudit(ports, tx, { action: "masterdata.sample-request.declined", entityType: ENTITY, entityId: row.id, actor: input.actor, metadata: { sourceRequestId: row.source_request_id, sourceProjectId: row.source_project_id } });
        await ports.sampleRequestNotifier?.resolved(tx, { outcome: "declined", intake: toRead(row) });
        return (await enrichIntakes(tx as PrismaClient, [row]))[0];
      });
    },

    /** Copies a complete sample quote to the matching SKU/supplier material price in one audited operation. */
    async syncSampleQuoteToPrice(input: { grants: PermissionGrants; actor: AuditActor; intakeId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.sampleRequestManage);
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.priceMaterialManage);
      actorIsUsable(input.actor);
      return runTransaction(async (tx) => {
        const current = await tx.sampleRequestIntake.findUnique({ where: { id: input.intakeId } });
        if (!current) throw notFound();
        if (current.status === "DECLINED") throw new AppError("CONFLICT", "SAMPLE_INTAKE_DECLINED", "A declined sample request cannot be added to the price list.");
        const missing = [
          !current.vendor_id ? "supplier" : null,
          !current.sku_id ? "SKU" : null,
          current.quoted_amount === null ? "quoted amount" : null,
          !current.quoted_currency ? "currency" : null,
        ].filter(Boolean);
        if (missing.length) throw new AppError("VALIDATION", "SAMPLE_PRICE_SYNC_INCOMPLETE", `Add the ${missing.join(", ")} before adding this quote to the price list.`);
        const amount = current.quoted_amount!;
        const currency = current.quoted_currency!;

        const linked = current.price_material_id
          ? await tx.priceMaterial.findFirst({ where: { id: current.price_material_id, deleted_at: null }, select: { id: true, amount: true, currency: true, sku_id: true, supplier_vendor_id: true } })
          : null;
        // Already synced only when the linked price is for THIS SKU and supplier at this amount; a changed SKU or supplier must sync again.
        if (linked && linked.sku_id === current.sku_id && linked.supplier_vendor_id === current.vendor_id && linked.amount.toString() === amount.toString() && linked.currency === currency) {
          return (await enrichIntakes(tx as PrismaClient, [current]))[0];
        }

        const existing = await tx.priceMaterial.findFirst({
          where: { sku_id: current.sku_id!, supplier_vendor_id: current.vendor_id!, deleted_at: null },
          select: { id: true, notes: true },
        });
        const pricing = createPricingService(tx as PrismaClient, { ...ports, runTransaction: async (work) => work(tx) });
        const note = samplePriceNote(current);
        const action = existing ? "updated" as const : "created" as const;
        const priceMaterialId = existing
          ? (await pricing.updatePriceMaterial({ grants: input.grants, actor: input.actor, priceMaterialId: existing.id, amount: amount.toString(), currency, notes: appendNote(existing.notes, note) })).priceMaterialId
          : (await pricing.createPriceMaterial({ grants: input.grants, actor: input.actor, skuId: current.sku_id!, supplierVendorId: current.vendor_id!, amount: amount.toString(), currency, notes: note })).priceMaterialId;
        const row = await tx.sampleRequestIntake.update({ where: { id: current.id }, data: { price_material_id: priceMaterialId } });
        await writeAudit(ports, tx, {
          action: "masterdata.sample-request.price-synced", entityType: ENTITY, entityId: row.id, actor: input.actor,
          changes: { priceMaterialId: { from: current.price_material_id, to: priceMaterialId }, action: { from: null, to: action }, amount: { from: null, to: amount.toString() }, currency: { from: null, to: currency } },
          metadata: { sourceRequestId: row.source_request_id, skuId: current.sku_id, vendorId: current.vendor_id },
        });
        return (await enrichIntakes(tx as PrismaClient, [row]))[0];
      });
    },

    async listSampleRequestIntakes(input: { grants: PermissionGrants; status?: SampleRequestIntakeStatus; sourceRequestIds?: readonly string[]; limit?: number }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.sampleRequestManage);
      // A missing or unusable limit falls back to the default; a usable one is capped.
      const requested = Math.trunc(input.limit ?? Number.NaN);
      const limit = Number.isFinite(requested) && requested >= 1 ? Math.min(requested, MAX_LIST_LIMIT) : DEFAULT_LIST_LIMIT;
      const rows = await db.sampleRequestIntake.findMany({
        where: {
          ...(input.status ? { status: input.status } : {}),
          ...(input.sourceRequestIds ? { source_request_id: { in: [...input.sourceRequestIds] } } : {}),
        },
        orderBy: [{ started_at: "desc" }, { id: "asc" }],
        take: limit,
      });
      return enrichIntakes(db, rows);
    },

    /**
     * A narrow supplier reference for the sample-quote form. It deliberately
     * requires the sample-request permission, not the broader vendor-screen
     * permission: staff can link an existing supplier but cannot inspect or
     * administer supplier records from this workflow.
     */
    /** SKUs a Master Data worker can attach to a quote. Needs only the sample-request permission, like the supplier choices. */
    async listSampleRequestSkuChoices(input: { grants: PermissionGrants }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.sampleRequestManage);
      const rows = await db.sku.findMany({
        where: { deleted_at: null },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: { id: true, name: true, code: true, brand: { select: { name: true } } },
        take: MAX_LIST_LIMIT,
      });
      return rows.map((sku) => ({ id: sku.id, name: sku.name, code: sku.code, brandName: sku.brand?.name ?? null }));
    },

    async listSampleRequestVendorChoices(input: { grants: PermissionGrants }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.sampleRequestManage);
      return db.vendor.findMany({
        where: { deleted_at: null },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: { id: true, name: true },
        take: MAX_LIST_LIMIT,
      });
    },

    async getSampleRequestIntake(input: { grants: PermissionGrants; intakeId: string }) {
      requirePermission(input.grants, MASTERDATA_PERMISSIONS.sampleRequestManage);
      const row = await db.sampleRequestIntake.findUnique({ where: { id: input.intakeId } });
      if (!row) throw notFound();
      return (await enrichIntakes(db, [row]))[0];
    },
  };
}
