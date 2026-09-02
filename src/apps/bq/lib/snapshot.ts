/**
 * Snapshot helper — creates BqLineItem data from Master Data or Library sources.
 * All values are stored as plain strings (no FKs to Master Data).
 */

import type { MaterialPriceOption, PriceWorkRead } from "@/apps/masterdata/public";
import type { BqLibItemRead } from "@/apps/bq/public";

export type LineItemCreateInput = {
  sourceType: "MASTERDATA" | "BQ_LIBRARY" | "CUSTOM";
  sourceRefId: string | null;
  sourceImportedAt: Date | null;
  titleSnapshot: string;
  purchaseUnitSnapshot: string;
  baseUnitSnapshot: string | null;
  purchaseToBaseFactorSnapshot: string | null;
  hargaSnapshot: string;
  currencySnapshot: string;
  kategori: string;
  qty: string;
  koefisien: string;
  notes: string | null;
};

export function snapshotFromMaterialPrice(
  option: MaterialPriceOption,
): LineItemCreateInput {
  return {
    sourceType: "MASTERDATA",
    sourceRefId: option.id,
    sourceImportedAt: new Date(),
    titleSnapshot: option.skuName ?? option.skuCode ?? option.skuId,
    purchaseUnitSnapshot: option.unit.code,
    baseUnitSnapshot: option.measurement.baseUnit?.code ?? null,
    purchaseToBaseFactorSnapshot: option.measurement.purchaseToBaseFactor,
    hargaSnapshot: option.amount,
    currencySnapshot: option.currency,
    kategori: "MATERIAL",
    qty: "1",
    koefisien: "1",
    notes: null,
  };
}

export function snapshotFromWorkPrice(
  option: PriceWorkRead,
  kind: "material-labor" | "labor",
): LineItemCreateInput {
  return {
    sourceType: "MASTERDATA",
    sourceRefId: option.id,
    sourceImportedAt: new Date(),
    titleSnapshot: option.name,
    purchaseUnitSnapshot: option.unit.code,
    baseUnitSnapshot: null,
    purchaseToBaseFactorSnapshot: null,
    hargaSnapshot: option.amount,
    currencySnapshot: option.currency,
    kategori: kind === "material-labor" ? "MATERIAL_UPAH" : "UPAH",
    qty: "1",
    koefisien: "1",
    notes: null,
  };
}

export function snapshotFromLibrary(
  libItem: BqLibItemRead,
): LineItemCreateInput {
  return {
    sourceType: "BQ_LIBRARY",
    sourceRefId: libItem.id,
    sourceImportedAt: new Date(),
    titleSnapshot: libItem.name,
    purchaseUnitSnapshot: libItem.purchaseUnit,
    baseUnitSnapshot: libItem.baseUnit,
    purchaseToBaseFactorSnapshot: null,
    hargaSnapshot: libItem.harga,
    currencySnapshot: libItem.currency,
    kategori: libItem.kategori,
    qty: "1",
    koefisien: libItem.defaultKoefisien,
    notes: null,
  };
}

export function snapshotCustom(input: {
  title: string;
  purchaseUnit: string;
  harga: string;
  currency: string;
  kategori: string;
  qty: string;
  koefisien: string;
  notes?: string;
}): LineItemCreateInput {
  return {
    sourceType: "CUSTOM",
    sourceRefId: null,
    sourceImportedAt: null,
    titleSnapshot: input.title,
    purchaseUnitSnapshot: input.purchaseUnit,
    baseUnitSnapshot: null,
    purchaseToBaseFactorSnapshot: null,
    hargaSnapshot: input.harga,
    currencySnapshot: input.currency,
    kategori: input.kategori,
    qty: input.qty,
    koefisien: input.koefisien,
    notes: input.notes ?? null,
  };
}
