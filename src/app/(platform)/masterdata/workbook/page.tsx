import { exportSkuPriceWorkbookFormAction, previewSkuPriceImportFormAction, applySkuPriceImportFormAction } from "./actions";

export const dynamic = "force-dynamic";

/** Temporary executor surface; the Lead replaces this with the approved workflow UI. */
export default function WorkbookToolsPage() {
  return <main>
    <h1>SKU price workbook tools</h1>
    <form action={exportSkuPriceWorkbookFormAction}><button type="submit">Export workbook</button></form>
    <form action={previewSkuPriceImportFormAction}><input name="file" type="file" accept=".xlsx" required /><button type="submit">Preview workbook</button></form>
    <form action={applySkuPriceImportFormAction}><input name="file" type="file" accept=".xlsx" required /><input name="hash" aria-label="Preview hash" required /><button type="submit">Apply workbook</button></form>
  </main>;
}
