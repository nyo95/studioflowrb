import type { PermissionGrants } from "@platform/core/rbac";
import { hasPermission, requirePermission } from "@platform/core/rbac";
import { AppError } from "@platform/core/errors";
import { MASTERDATA_PERMISSIONS, type MaterialPriceOption, type PriceWorkRead } from "@/apps/masterdata/public";

import { BQ_PERMISSIONS, type BqKategori, type BqServiceContext } from "./context";
import type { createLibraryItemService } from "./library-items";
import { snapshotFromMaterialPrice, snapshotFromWorkPrice, type LineItemCreateInput } from "../lib/snapshot";

/**
 * Where a Cost Component's facts come from (WO-BQ-ASSEMBLY-SOURCE-01): a Master Data price, read one way through its
 * public contract, or a BQ Library item. One resolver serves "add a sourced line" (Assembly or project) and "apply an
 * Assembly at today's price", so both read a source the same way.
 */

/** The two Master Data reads BQ needs; `src/apps/bq/runtime.ts` passes the public Master Data read. */
export type BqMasterDataRead = {
  getMaterialPriceOption(priceId: string): Promise<MaterialPriceOption | null>;
  listWorkPricesRead(filter?: { kind?: "material-labor" | "labor" }): Promise<PriceWorkRead[]>;
};

export type CostSourceKind = "material" | "labor" | "material-labor" | "library";
export type CostSourceRef = { sourceType: "MASTERDATA" | "BQ_LIBRARY"; sourceRefId: string; sourceKind?: CostSourceKind };

/** Why an applied Assembly line kept its stored price instead of the source's current one. */
export type PriceKeptReason = "source-missing" | "no-permission" | "unit-changed" | "currency";
export type PriceRefresh = { refreshed: number; kept: Array<{ title: string; reason: PriceKeptReason }> };

type Actor = { kind: string; userId?: string; label: string };
type LibraryItems = ReturnType<typeof createLibraryItemService>;
type Row = { title: string; purchaseUnit: string; baseUnit: string | null; harga: string; currency: string; kategori: BqKategori; koefisien: string; notes: string | null };

const OTHER_COST_KATEGORI = new Set<BqKategori>(["BIAYA_UMUM", "TRANSPORTASI_AKOMODASI", "ALAT"]);

function sameUnit(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function sourceMissing(): AppError {
  return new AppError("NOT_FOUND", "bq.source.not-found", "That price or library item is no longer available");
}

export function createCostSourceService(ctx: BqServiceContext, masterData: BqMasterDataRead | undefined, libraryItems: LibraryItems) {
  const { db, auditWriter } = ctx;

  function requireMasterData(): BqMasterDataRead {
    if (!masterData) throw new AppError("INVARIANT", "bq.master-data.unavailable", "Master Data prices are not available here");
    return masterData;
  }

  /** A per-call reader: the work price list is loaded once however many lines point at it. */
  function reader(grants: PermissionGrants) {
    let workPrices: Promise<PriceWorkRead[]> | null = null;
    const canMaterial = hasPermission(grants, MASTERDATA_PERMISSIONS.priceMaterialRead);
    const canWork = hasPermission(grants, MASTERDATA_PERMISSIONS.priceWorkRead);

    async function fromMasterData(id: string, kind?: CostSourceKind): Promise<LineItemCreateInput> {
      if (kind === "library") throw sourceMissing();
      // Permission first: a caller without Master Data access keeps stored prices instead of failing (price-at-use).
      if (!canMaterial && !canWork) throw new AppError("FORBIDDEN", "bq.source.no-permission", "You cannot read Master Data prices");
      const read = requireMasterData();
      if (kind !== "labor" && kind !== "material-labor" && canMaterial) {
        const option = await read.getMaterialPriceOption(id);
        if (option) return snapshotFromMaterialPrice(option);
      }
      if (kind !== "material" && canWork) {
        workPrices ??= read.listWorkPricesRead();
        const option = (await workPrices).find((candidate) => candidate.id === id && (!kind || candidate.kind === kind));
        if (option) return snapshotFromWorkPrice(option, option.kind);
      }
      // Not found where the caller may look: when part of Master Data is hidden from them, it may sit there.
      if ((kind === "material" && !canMaterial) || ((kind === "labor" || kind === "material-labor") && !canWork) || (!kind && (!canMaterial || !canWork))) {
        throw new AppError("FORBIDDEN", "bq.source.no-permission", "You cannot read Master Data prices of this kind");
      }
      throw sourceMissing();
    }

    async function fromLibrary(id: string): Promise<LineItemCreateInput> {
      const [material, labor, materialLabor, custom] = await Promise.all([
        db.bqLibMaterial.findUnique({ where: { id } }),
        db.bqLibLabor.findUnique({ where: { id } }),
        db.bqLibMaterialLabor.findUnique({ where: { id } }),
        db.bqLibCustomItem.findUnique({ where: { id } }),
      ]);
      const item = material ?? labor ?? materialLabor;
      if (item) {
        return { sourceType: "BQ_LIBRARY", sourceRefId: item.id, sourceImportedAt: new Date(), titleSnapshot: item.name, purchaseUnitSnapshot: item.purchase_unit, baseUnitSnapshot: item.base_unit, purchaseToBaseFactorSnapshot: null, hargaSnapshot: item.harga.toString(), currencySnapshot: item.currency, kategori: item.kategori, qty: "1", koefisien: item.default_koefisien.toString(), notes: null };
      }
      if (custom) {
        return { sourceType: "BQ_LIBRARY", sourceRefId: custom.id, sourceImportedAt: new Date(), titleSnapshot: custom.name, purchaseUnitSnapshot: custom.purchase_unit, baseUnitSnapshot: null, purchaseToBaseFactorSnapshot: null, hargaSnapshot: custom.harga.toString(), currencySnapshot: custom.currency, kategori: custom.kategori, qty: "1", koefisien: custom.default_koefisien.toString(), notes: null };
      }
      throw sourceMissing();
    }

    return {
      resolve(ref: CostSourceRef): Promise<LineItemCreateInput> {
        return ref.sourceType === "BQ_LIBRARY" ? fromLibrary(ref.sourceRefId) : fromMasterData(ref.sourceRefId, ref.sourceKind);
      },
    };
  }

  /** The source's facts as a snapshot, refusing a non-Rupiah price (BQ works in Rupiah only). */
  async function resolveSource(grants: PermissionGrants, ref: CostSourceRef): Promise<LineItemCreateInput> {
    const snapshot = await reader(grants).resolve(ref);
    if (snapshot.currencySnapshot.trim().toUpperCase() !== "IDR") {
      throw new AppError("VALIDATION", "bq.source.currency", "BQ works in Rupiah only; this price is in another currency");
    }
    return snapshot;
  }

  /**
   * Today's price for each sourced line (owner 2026-10-22: an Assembly is priced when it is used). A line keeps its
   * stored price, and is reported, when its source is gone, cannot be read by the caller, now prices another unit, or
   * is not in Rupiah. Custom lines are not looked up.
   */
  async function currentPrices<T extends { id: string; source_type: string; source_ref_id: string | null; title_snapshot: string; purchase_unit_snapshot: string }>(grants: PermissionGrants, lines: readonly T[]) {
    const read = reader(grants);
    const prices = new Map<string, string>();
    const refresh: PriceRefresh = { refreshed: 0, kept: [] };
    for (const line of lines) {
      if ((line.source_type !== "MASTERDATA" && line.source_type !== "BQ_LIBRARY") || !line.source_ref_id) continue;
      let reason: PriceKeptReason | null = null;
      try {
        const current = await read.resolve({ sourceType: line.source_type, sourceRefId: line.source_ref_id });
        if (current.currencySnapshot.trim().toUpperCase() !== "IDR") reason = "currency";
        else if (!sameUnit(current.purchaseUnitSnapshot, line.purchase_unit_snapshot)) reason = "unit-changed";
        else prices.set(line.id, current.hargaSnapshot);
      } catch (error) {
        if (!(error instanceof AppError) || (error.kind !== "NOT_FOUND" && error.kind !== "FORBIDDEN")) throw error;
        reason = error.kind === "FORBIDDEN" ? "no-permission" : "source-missing";
      }
      if (reason) refresh.kept.push({ title: line.title_snapshot, reason });
      else refresh.refreshed += 1;
    }
    return { prices, refresh };
  }

  /** Create the Library item a Custom row describes, of the type its kategori maps to (bq-contract K-19). */
  async function createLibraryItemFromRow(grants: PermissionGrants, actor: Actor, row: Row): Promise<string> {
    const common = { grants, actor, name: row.title, purchaseUnit: row.purchaseUnit, harga: row.harga, currency: row.currency, defaultKoefisien: row.koefisien, notes: row.notes ?? undefined };
    const withBase = { ...common, baseUnit: row.baseUnit ?? undefined };
    const item = row.kategori === "MATERIAL" ? await libraryItems.createLibMaterial(withBase)
      : row.kategori === "UPAH" ? await libraryItems.createLibLabor(withBase)
        : row.kategori === "MATERIAL_UPAH" ? await libraryItems.createLibMaterialLabor(withBase)
          : OTHER_COST_KATEGORI.has(row.kategori) ? await libraryItems.createLibCustomItem({ ...common, kategori: row.kategori as "BIAYA_UMUM" | "TRANSPORTASI_AKOMODASI" | "ALAT" })
            : null;
    if (!item) throw new AppError("VALIDATION", "bq.kategori.invalid", "Invalid BQ category");
    return item.id;
  }

  /** "Save to BQ Library" on a Custom Assembly line: the line then points at the new Library item. */
  async function saveAssemblyLineToLibrary(input: { grants: PermissionGrants; actor: Actor; lineId: string }) {
    requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
    const line = await db.bqAssemblyLine.findUnique({ where: { id: input.lineId } });
    if (!line) throw new AppError("NOT_FOUND", "bq.assembly-line.not-found", "Assembly line not found");
    if (line.source_type !== "CUSTOM") throw new AppError("CONFLICT", "bq.library.save-not-custom", "Only a Custom Cost Component can be saved to the BQ Library");
    const libraryId = await createLibraryItemFromRow(input.grants, input.actor, { title: line.title_snapshot, purchaseUnit: line.purchase_unit_snapshot, baseUnit: line.base_unit_snapshot, harga: line.harga_snapshot.toString(), currency: line.currency_snapshot, kategori: line.kategori as BqKategori, koefisien: line.koefisien.toString(), notes: line.notes });
    const updated = await db.bqAssemblyLine.update({ where: { id: line.id }, data: { source_type: "BQ_LIBRARY", source_ref_id: libraryId } });
    await auditWriter({ appId: "bq", action: "bq.assembly-line.saved-to-library", entityType: "BqAssemblyLine", entityId: line.id, actor: input.actor, changes: { libraryItemId: libraryId } });
    return updated;
  }

  /** "Save to BQ Library" on a Custom project Cost Component: it becomes a Library-sourced row with a revertible baseline. */
  async function saveLineItemToLibrary(input: { grants: PermissionGrants; actor: Actor; id: string }) {
    requirePermission(input.grants, BQ_PERMISSIONS.projectManage);
    requirePermission(input.grants, BQ_PERMISSIONS.libraryManage);
    await ctx.requireEditableProjectForLineItem(input.id);
    const line = await db.bqLineItem.findUnique({ where: { id: input.id } });
    if (!line) throw new AppError("NOT_FOUND", "bq.line-item.not-found", "Cost Component not found");
    if (line.source_type !== "CUSTOM") throw new AppError("CONFLICT", "bq.library.save-not-custom", "Only a Custom Cost Component can be saved to the BQ Library");
    const libraryId = await createLibraryItemFromRow(input.grants, input.actor, { title: line.title_snapshot, purchaseUnit: line.purchase_unit_snapshot, baseUnit: line.base_unit_snapshot, harga: line.harga_snapshot.toString(), currency: line.currency_snapshot, kategori: line.kategori as BqKategori, koefisien: line.koefisien.toString(), notes: line.notes });
    const updated = await db.bqLineItem.update({ where: { id: line.id }, data: { source_type: "BQ_LIBRARY", source_ref_id: libraryId, source_imported_at: new Date(), source_price_snapshot: line.harga_snapshot } });
    await auditWriter({ appId: "bq", action: "bq.line-item.saved-to-library", entityType: "BqLineItem", entityId: line.id, actor: input.actor, changes: { libraryItemId: libraryId } });
    return updated;
  }

  return { resolveSource, currentPrices, saveAssemblyLineToLibrary, saveLineItemToLibrary };
}

export type CostSourceService = ReturnType<typeof createCostSourceService>;
