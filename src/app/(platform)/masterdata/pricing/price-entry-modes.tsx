"use client";

import { FilterChip } from "@/platform/ui_engine";

export type PriceKind = "material" | "material-labor" | "labor";
export type PriceEntry = { kind: PriceKind; multiSupplier: boolean };

const KIND_LABEL: Record<PriceKind, string> = { material: "Material", "material-labor": "Material + labor", labor: "Labor" };

/**
 * The one "New price" entry (owner, 2026-10-04): the price type and, for work prices, whether the rows are
 * for one supplier or compared across several suppliers are chosen inside the form instead of four separate
 * menu items. Several suppliers opens the multi-supplier grid (formerly "Compare suppliers"), which is an
 * entry method, not a comparison of stored prices. Material prices name a supplier per row already.
 */
export function PriceEntryModes({ entry, canManageMaterial, canManageWork, onChange }: { entry: PriceEntry; canManageMaterial: boolean; canManageWork: boolean; onChange: (next: PriceEntry) => void }) {
  const kinds = ([...(canManageMaterial ? ["material"] : []), ...(canManageWork ? ["material-labor", "labor"] : [])] as PriceKind[]);
  const choose = (next: PriceEntry) => { if (next.kind !== entry.kind || next.multiSupplier !== entry.multiSupplier) onChange(next); };
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {kinds.length > 1 ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Price type">
          {kinds.map((kind) => (
            <FilterChip key={kind} selected={entry.kind === kind} onClick={() => choose({ kind, multiSupplier: kind === "material" ? false : entry.multiSupplier })}>{KIND_LABEL[kind]}</FilterChip>
          ))}
        </div>
      ) : null}
      {entry.kind !== "material" ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Suppliers">
          <FilterChip selected={!entry.multiSupplier} onClick={() => choose({ kind: entry.kind, multiSupplier: false })}>One supplier</FilterChip>
          <FilterChip selected={entry.multiSupplier} onClick={() => choose({ kind: entry.kind, multiSupplier: true })}>Several suppliers</FilterChip>
        </div>
      ) : null}
    </div>
  );
}
