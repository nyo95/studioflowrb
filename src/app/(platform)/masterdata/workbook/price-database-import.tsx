"use client";

import { useRef, useState } from "react";

import { Field, Select } from "@/platform/ui_engine";

import { applyPriceDatabaseImportAction, exportPriceDatabaseAction, previewPriceDatabaseImportAction, priceDatabaseTemplateAction } from "./actions";
import { TemplateImport, type CheckSummary } from "./template-import";

type Kind = "labor" | "material-labor";

/** Suppliers and work prices as one plain Prices table (and, in Excel, a Suppliers sheet): template, current data, upload, save. */
export function PriceDatabaseImport({ canExport, canImport, units }: { canExport: boolean; canImport: boolean; units: Array<{ id: string; code: string; name: string }> }) {
  const [priceKind, setPriceKind] = useState<Kind>("labor");
  const [defaultUnitId, setDefaultUnitId] = useState("");
  // The check reads the latest choices from here, so changing one and checking again in the same moment never sees a stale value.
  const latest = useRef<{ priceKind: Kind; defaultUnitId: string }>({ priceKind: "labor", defaultUnitId: "" });

  const form = (file: File, hash?: string) => {
    const data = new FormData();
    data.set("file", file);
    data.set("priceKind", latest.current.priceKind);
    data.set("defaultUnitId", latest.current.defaultUnitId);
    if (hash) data.set("hash", hash);
    return data;
  };

  return (
    <TemplateImport
      title="Suppliers and work prices"
      description="Labor and material + labor prices, one row per price of one supplier. A supplier or category that is not there yet is created."
      limits="Excel (.xlsx) or CSV, up to 8 MB and 1,500 price rows. A CSV holds the Prices table only."
      canImport={canImport}
      templates={canImport ? [
        { label: "Download template (Excel)", run: () => priceDatabaseTemplateAction("xlsx") },
        { label: "Download template (CSV)", run: () => priceDatabaseTemplateAction("csv") },
      ] : []}
      current={canExport ? { label: "Download current data to edit", run: () => exportPriceDatabaseAction({ priceKind, format: "xlsx" }) } : undefined}
      options={(recheck) => (
        <>
          <Field label="Price kind" description="Which prices this file holds.">
            <Select
              value={priceKind}
              onChange={(event) => {
                const next = event.target.value === "material-labor" ? "material-labor" : "labor";
                latest.current = { ...latest.current, priceKind: next };
                setPriceKind(next);
                recheck();
              }}
            >
              <option value="labor">Labor only</option>
              <option value="material-labor">Material + labor</option>
            </Select>
          </Field>
          <Field label="Unit for rows without one" description="Used when a row's Unit is blank or unknown.">
            <Select
              value={defaultUnitId}
              onChange={(event) => {
                latest.current = { ...latest.current, defaultUnitId: event.target.value };
                setDefaultUnitId(event.target.value);
                recheck();
              }}
            >
              <option value="">No default: such rows are skipped</option>
              {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.code}</option>)}
            </Select>
          </Field>
        </>
      )}
      check={async (file) => {
        const result = await previewPriceDatabaseImportAction(form(file));
        if (result.ok === false) return result;
        const { totals, errors, messages } = result.data;
        const where = (item: { sheet?: string; row?: number }) => [item.sheet, item.row ? `row ${item.row}` : null].filter(Boolean).join(", ") || "File";
        const suppliers = totals.suppliersCreated + totals.suppliersFromPrices;
        const summary: CheckSummary = {
          hash: result.data.hash,
          badges: [
            { label: `${totals.pricesCreated} new prices`, tone: "success" },
            { label: `${totals.pricesUpdated} changed`, tone: "warning" },
            { label: `${totals.pricesUnchanged} unchanged`, tone: "neutral" },
            ...(suppliers > 0 ? [{ label: `${suppliers} new ${suppliers === 1 ? "supplier" : "suppliers"}`, tone: "success" as const }] : []),
            ...(totals.suppliersExisting > 0 ? [{ label: `${totals.suppliersExisting} ${totals.suppliersExisting === 1 ? "supplier" : "suppliers"} already there, not changed`, tone: "neutral" as const }] : []),
            ...(totals.categoriesCreated > 0 ? [{ label: `${totals.categoriesCreated} new ${totals.categoriesCreated === 1 ? "category" : "categories"}`, tone: "neutral" as const }] : []),
            { label: `${errors.length} with problems`, tone: errors.length > 0 ? "danger" as const : "neutral" as const },
          ],
          problems: errors.map((item) => ({ where: where(item), message: item.message })),
          notes: messages.filter((item) => item.sheet === "Suppliers" && item.level === "info").map((item) => ({ where: where(item), message: item.message })),
          changes: totals.pricesCreated + totals.pricesUpdated + suppliers,
          empty: totals.pricesCreated + totals.pricesUpdated + totals.pricesUnchanged + suppliers + errors.length === 0,
        };
        return { ok: true, data: summary };
      }}
      save={async (file, hash) => {
        const result = await applyPriceDatabaseImportAction(form(file, hash));
        if (result.ok === false) return result;
        const { totals, skipped } = result.data;
        return { ok: true, data: { message: `Saved: ${totals.pricesCreated} new and ${totals.pricesUpdated} changed prices${skipped.length > 0 ? `; ${skipped.length} problem${skipped.length === 1 ? "" : "s"} skipped` : ""}.` } };
      }}
    />
  );
}
