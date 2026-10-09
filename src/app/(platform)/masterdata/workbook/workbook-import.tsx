"use client";

import {
  applySkuPriceImportAction,
  exportSkuPriceWorkbookAction,
  previewSkuPriceImportAction,
  skuPriceImportTemplateAction,
} from "./actions";
import { TemplateImport, type CheckSummary } from "./template-import";

/** SKU prices: template (new SKUs), current data with its ID columns (to change existing ones), upload, save. */
export function WorkbookImport({ canExport, canImport }: { canExport: boolean; canImport: boolean }) {
  return (
    <TemplateImport
      title="SKU prices"
      description="SKUs and their material prices. Suppliers, units, categories and brands must already exist; they are never created here."
      limits="Excel (.xlsx) or CSV, up to 5 MB and 2,000 rows."
      canImport={canImport}
      templates={canImport ? [
        { label: "Download template (Excel)", run: () => skuPriceImportTemplateAction("xlsx") },
        { label: "Download template (CSV)", run: () => skuPriceImportTemplateAction("csv") },
      ] : []}
      current={canExport ? { label: "Download current data to edit", run: () => exportSkuPriceWorkbookAction("xlsx") } : undefined}
      extras={canExport ? [{ label: "Price list (PDF)", run: () => exportSkuPriceWorkbookAction("pdf") }] : undefined}
      check={async (file) => {
        const form = new FormData();
        form.set("file", file);
        const result = await previewSkuPriceImportAction(form);
        if (result.ok === false) return result;
        const { totals, errors, rows } = result.data;
        const summary: CheckSummary = {
          hash: result.data.hash,
          badges: [
            { label: `${totals.create} new`, tone: "success" },
            { label: `${totals.update} changed`, tone: "warning" },
            { label: `${totals.unchanged} unchanged`, tone: "neutral" },
            { label: `${totals.error} with problems`, tone: totals.error > 0 ? "danger" : "neutral" },
          ],
          problems: errors.map((item) => ({ where: `Row ${item.row}, ${item.column}`, message: item.message })),
          changes: totals.create + totals.update,
          empty: rows.length === 0,
        };
        return { ok: true, data: summary };
      }}
      save={async (file, hash) => {
        const form = new FormData();
        form.set("file", file);
        form.set("hash", hash);
        const result = await applySkuPriceImportAction(form);
        if (result.ok === false) return result;
        const { totals, skipped } = result.data;
        return { ok: true, data: { message: `Saved: ${totals.create} new and ${totals.update} changed${skipped.length > 0 ? `; ${skipped.length} problem${skipped.length === 1 ? "" : "s"} skipped` : ""}.` } };
      }}
    />
  );
}
