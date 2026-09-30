"use client";

import { useRef, useState, useTransition } from "react";

import {
  Button,
  DataTable,
  InlineError,
  SectionCard,
  StatusBadge,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from "@/platform/ui_engine";

import { applySkuPriceImportAction, exportSkuPriceWorkbookAction, previewSkuPriceImportAction } from "./actions";

type Preview = {
  hash: string;
  totals: { create: number; update: number; unchanged: number; error: number };
  rows: Array<{ row: number; outcome: "create" | "update" | "unchanged" | "error" }>;
  errors: Array<{ row: number; column: string; message: string }>;
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

/** Export, edit in Excel, preview (saves nothing), then confirm. Apply is all-or-nothing on the server. */
export function WorkbookImport({ canExport, canImport }: { canExport: boolean; canImport: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState<"export" | "preview" | "apply" | null>(null);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const changes = preview ? preview.totals.create + preview.totals.update : 0;
  const canApply = Boolean(preview && file) && preview!.totals.error === 0 && preview!.errors.length === 0 && changes > 0;

  const run = (kind: "export" | "preview" | "apply", work: () => Promise<void>) => {
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

  return (
    <div className="grid gap-4 p-(--ui-section-px)">
      {error ? <InlineError>{error}</InlineError> : null}

      {canExport ? (
        <SectionCard title="1. Export" description="Download the current SKUs and material prices. Each row is one SKU with one supplier price. The ID columns tell the import which record a row belongs to, so leave them as they are." padded>
          <Button
            variant="secondary"
            pending={busy === "export"}
            onClick={() => run("export", async () => {
              const result = await exportSkuPriceWorkbookAction();
              if (result.ok === false) { setError(result.error.safeMessage); return; }
              download(result.data.filename, result.data.base64, result.data.mimeType);
            })}
          >
            Download workbook
          </Button>
        </SectionCard>
      ) : null}

      {canImport ? (
        <>
          <SectionCard title="2. Check your changes" description="Choose the edited workbook. Every row is checked and you see what would happen. Nothing is saved yet. Suppliers, units, categories and brands must already exist; they are never created here." padded>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.csv"
                className="text-sm"
                onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setDone(null); setError(null); }}
              />
              <Button
                variant="primary"
                disabled={!file}
                pending={busy === "preview"}
                onClick={() => run("preview", async () => {
                  setDone(null);
                  const result = await previewSkuPriceImportAction(formFor());
                  if (result.ok === false) { setPreview(null); setError(result.error.safeMessage); return; }
                  setPreview(result.data as Preview);
                })}
              >
                Check workbook
              </Button>
            </div>

            {preview ? (
              <div className="mt-4 grid gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone="success">{preview.totals.create} new</StatusBadge>
                  <StatusBadge tone="warning">{preview.totals.update} changed</StatusBadge>
                  <StatusBadge tone="neutral">{preview.totals.unchanged} unchanged</StatusBadge>
                  <StatusBadge tone={preview.totals.error > 0 ? "danger" : "neutral"}>{preview.totals.error} with errors</StatusBadge>
                </div>

                {preview.errors.length > 0 ? (
                  <div className="grid gap-2">
                    <Text tone="secondary" size="sm">Fix these in Excel and check the workbook again. Nothing can be saved until every row is clean.</Text>
                    <DataTable density="compact" minWidth={560}>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Excel row</TableHead>
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
                        ? "The workbook has no data rows."
                        : "Nothing to save. Every row matches what is already stored."}
                  </Text>
                )}

                {preview.errors.length === 0 && changes > 0 ? (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-ink-secondary">Excel rows that will change ({changes})</summary>
                    <Text tone="tertiary" size="sm" className="mt-1">
                      {preview.rows.filter((row) => row.outcome === "create" || row.outcome === "update").map((row) => `${row.row} (${OUTCOME_LABEL[row.outcome]})`).join(", ")}
                    </Text>
                  </details>
                ) : null}
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title="3. Save" description="Applies every row together. If anything fails, nothing is saved." padded>
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
              {!preview ? <Text tone="tertiary" size="sm">Check the workbook first.</Text> : null}
              {done ? <StatusBadge tone="success">{done}</StatusBadge> : null}
            </div>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
