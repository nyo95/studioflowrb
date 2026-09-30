"use client";

import { useRef, useState, useTransition } from "react";

import {
  Button,
  DataTable,
  Field,
  InlineError,
  SectionCard,
  Select,
  StatusBadge,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from "@/platform/ui_engine";

import { applySkuPriceImportAction, exportSkuPriceWorkbookAction, previewSkuPriceImportAction, skuPriceImportTemplateAction } from "./actions";

type Preview = {
  hash: string;
  totals: { create: number; update: number; unchanged: number; error: number };
  rows: Array<{ row: number; outcome: "create" | "update" | "unchanged" | "error" }>;
  errors: Array<{ row: number; column: string; message: string }>;
};

type ExportFormat = "xlsx" | "csv" | "pdf";
type Busy = "export" | "template" | "preview" | "apply" | null;

const FORMAT_HELP: Record<ExportFormat, string> = {
  xlsx: "Excel file. Edit it and bring it back in with the import on this page.",
  csv: "Plain CSV file. Also works for importing back.",
  pdf: "Read-only price list to view or print. It cannot be imported.",
};

const OUTCOME_LABEL = { create: "new", update: "changed", unchanged: "unchanged", error: "error" } as const;

function download(filename: string, base64: string, mimeType: string) {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Get the data out (Excel, CSV or PDF), or bring edited data back in: choose a file, check it (saves nothing), then save. Saving is all-or-nothing on the server. */
export function WorkbookImport({ canExport, canImport }: { canExport: boolean; canImport: boolean }) {
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const changes = preview ? preview.totals.create + preview.totals.update : 0;
  const clean = Boolean(preview) && preview!.totals.error === 0 && preview!.errors.length === 0;
  const canApply = clean && Boolean(file) && changes > 0;

  const run = (kind: Exclude<Busy, null>, work: () => Promise<void>) => {
    if (busy) return;
    setBusy(kind);
    setError(null);
    startTransition(async () => {
      try { await work(); } catch { setError("The action could not be completed. Please try again."); } finally { setBusy(null); }
    });
  };

  const formFor = (hash?: string) => {
    const data = new FormData();
    data.set("file", file!);
    if (hash) data.set("hash", hash);
    return data;
  };

  const step = (number: number, title: string, active: boolean) => (
    <span className="flex items-center gap-2">
      <span className={active ? "grid size-5 place-items-center rounded-full bg-action text-xs font-semibold text-white" : "grid size-5 place-items-center rounded-full bg-surface-muted text-xs font-semibold text-ink-tertiary"}>{number}</span>
      <span>{title}</span>
    </span>
  );

  return (
    <div className="grid gap-4 p-(--ui-section-px) lg:grid-cols-2 lg:items-start">
      {error ? <div className="lg:col-span-2"><InlineError>{error}</InlineError></div> : null}

      {canExport ? (
        <SectionCard title="Get the data out" description="One row per SKU and supplier price. The ID columns tell the import which record a row belongs to, so leave them as they are." padded>
          <div className="grid gap-3">
            <Field label="File type" description={FORMAT_HELP[format]}>
              <Select value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)}>
                <option value="xlsx">Excel (.xlsx)</option>
                <option value="csv">CSV (.csv)</option>
                <option value="pdf">PDF price list (.pdf)</option>
              </Select>
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                pending={busy === "export"}
                onClick={() => run("export", async () => {
                  const result = await exportSkuPriceWorkbookAction(format);
                  if (result.ok === false) { setError(result.error.safeMessage); return; }
                  download(result.data.filename, result.data.base64, result.data.mimeType);
                })}
              >
                Download
              </Button>
              {canImport ? (
                <Button
                  variant="ghost"
                  pending={busy === "template"}
                  onClick={() => run("template", async () => {
                    const result = await skuPriceImportTemplateAction(format === "csv" ? "csv" : "xlsx");
                    if (result.ok === false) { setError(result.error.safeMessage); return; }
                    download(result.data.filename, result.data.base64, result.data.mimeType);
                  })}
                >
                  Download a blank template
                </Button>
              ) : null}
            </div>
            {canImport ? <Text tone="tertiary" size="sm">A blank template has the right columns and one example row. Use it to add new SKUs from scratch.</Text> : null}
          </div>
        </SectionCard>
      ) : null}

      {canImport ? (
        <SectionCard title="Bring changes in" description="Suppliers, units, categories and brands must already exist. They are never created here. Nothing is saved until step 3." padded>
          <div className="grid gap-5">
            <div className="grid gap-2">
              <Text weight="semibold" size="sm">{step(1, "Choose your file", !file)}</Text>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.csv"
                  className="text-sm"
                  aria-label="Excel or CSV file to import"
                  onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setDone(null); setError(null); }}
                />
              </div>
              <Text tone="tertiary" size="sm">Excel (.xlsx) or CSV, up to 5 MB and 2,000 rows.</Text>
            </div>

            <div className="grid gap-2">
              <Text weight="semibold" size="sm">{step(2, "Check it", Boolean(file) && !preview)}</Text>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  disabled={!file}
                  pending={busy === "preview"}
                  onClick={() => run("preview", async () => {
                    setDone(null);
                    const result = await previewSkuPriceImportAction(formFor());
                    if (result.ok === false) { setPreview(null); setError(result.error.safeMessage); return; }
                    setPreview(result.data as Preview);
                  })}
                >
                  Check file
                </Button>
                <Text tone="tertiary" size="sm">Every row is checked and you see what would happen. Nothing is saved.</Text>
              </div>

              {preview ? (
                <div className="mt-1 grid gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone="success">{preview.totals.create} new</StatusBadge>
                    <StatusBadge tone="warning">{preview.totals.update} changed</StatusBadge>
                    <StatusBadge tone="neutral">{preview.totals.unchanged} unchanged</StatusBadge>
                    <StatusBadge tone={preview.totals.error > 0 ? "danger" : "neutral"}>{preview.totals.error} with problems</StatusBadge>
                  </div>

                  {preview.errors.length > 0 ? (
                    <div className="grid gap-2">
                      <Text tone="secondary" size="sm">Fix these in your file, then choose it again and check. Nothing can be saved until every row is clean. Row numbers are the row numbers in your file.</Text>
                      <DataTable density="compact" minWidth={480}>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Row</TableHead>
                            <TableHead>Column</TableHead>
                            <TableHead>Problem</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {preview.errors.map((item, index) => (
                            <TableRow key={`${item.row}-${item.column}-${index}`}>
                              <TableCell>{item.row}</TableCell>
                              <TableCell>{item.column}</TableCell>
                              <TableCell>{item.message}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </DataTable>
                    </div>
                  ) : (
                    <Text tone="secondary" size="sm">
                      {changes > 0
                        ? `Ready: ${preview.totals.create} new and ${preview.totals.update} changed row(s). Unchanged rows are left alone.`
                        : preview.rows.length === 0
                          ? "The file has no data rows."
                          : "Nothing to save. Every row matches what is already stored."}
                    </Text>
                  )}

                  {clean && changes > 0 ? (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-ink-secondary">Rows that will change ({changes})</summary>
                      <Text tone="tertiary" size="sm" className="mt-1">
                        {preview.rows.filter((row) => row.outcome === "create" || row.outcome === "update").map((row) => `${row.row} (${OUTCOME_LABEL[row.outcome]})`).join(", ")}
                      </Text>
                    </details>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="grid gap-2">
              <Text weight="semibold" size="sm">{step(3, "Save", canApply)}</Text>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="primary"
                  disabled={!canApply}
                  pending={busy === "apply"}
                  onClick={() => run("apply", async () => {
                    const result = await applySkuPriceImportAction(formFor(preview!.hash));
                    if (result.ok === false) { setError(result.error.safeMessage); return; }
                    const totals = result.data.totals;
                    setDone(`Saved: ${totals.create} new and ${totals.update} changed.`);
                    setPreview(null);
                    setFile(null);
                    if (inputRef.current) inputRef.current.value = "";
                  })}
                >
                  Save changes
                </Button>
                {!preview && !done ? <Text tone="tertiary" size="sm">Check the file first.</Text> : null}
                {preview && !canApply && changes === 0 && clean ? <Text tone="tertiary" size="sm">There is nothing to save.</Text> : null}
                {done ? <StatusBadge tone="success">{done}</StatusBadge> : null}
              </div>
              <Text tone="tertiary" size="sm">All rows are saved together. If anything fails, nothing is saved.</Text>
            </div>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
