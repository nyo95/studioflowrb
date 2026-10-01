"use client";

import { useRef, useState, useTransition } from "react";

import { Button, Field, InlineError, SectionCard, Select, Text } from "@/platform/ui_engine";

import { applyPriceDatabaseImportAction, exportPriceDatabaseAction, previewPriceDatabaseImportAction } from "./actions";

type Message = { level: "info" | "warning" | "error"; sheet?: string; row?: number; message: string };
type Totals = { suppliersCreated: number; suppliersExisting: number; suppliersFromPrices: number; categoriesCreated: number; pricesCreated: number; pricesUpdated: number; pricesUnchanged: number };
type Preview = { hash: string; totals: Totals; messages: Message[]; errors: Message[] };
type Busy = "export" | "preview" | "apply" | null;

function download(filename: string, base64: string, mimeType: string) {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const where = (message: Message) => [message.sheet, message.row ? `row ${message.row}` : null].filter(Boolean).join(", ");

/**
 * The supplier and work-price database in the owner's Excel layout: download it, or bring a file in (the existing
 * company file works as it is). The file is checked first, which saves nothing; importing is all or nothing.
 */
export function PriceDatabaseImport({ canExport, canImport, units }: { canExport: boolean; canImport: boolean; units: Array<{ id: string; code: string; name: string }> }) {
  const [file, setFile] = useState<File | null>(null);
  const [priceKind, setPriceKind] = useState<"labor" | "material-labor">("labor");
  const [defaultUnitId, setDefaultUnitId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorLines, setErrorLines] = useState<Message[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const changes = preview ? preview.totals.suppliersCreated + preview.totals.suppliersFromPrices + preview.totals.pricesCreated + preview.totals.pricesUpdated : 0;
  const clean = Boolean(preview) && preview!.errors.length === 0;

  const run = (kind: Exclude<Busy, null>, work: () => Promise<void>) => {
    if (busy) return;
    setBusy(kind); setError(null); setErrorLines([]);
    startTransition(async () => {
      try { await work(); } catch { setError("The action could not be completed. Please try again."); } finally { setBusy(null); }
    });
  };
  const formFor = (hash?: string) => {
    const data = new FormData();
    data.set("file", file!);
    data.set("priceKind", priceKind);
    data.set("defaultUnitId", defaultUnitId);
    if (hash) data.set("hash", hash);
    return data;
  };
  const optionsChanged = () => { setPreview(null); setDone(null); };

  return (
    <div className="grid gap-4 p-(--ui-section-px) lg:grid-cols-2 lg:items-start">
      {error ? <div className="lg:col-span-2"><InlineError>{error}</InlineError>{errorLines.length ? <ul className="mt-2 grid gap-1 text-sm text-danger">{errorLines.map((line, index) => <li key={index}>{where(line)}{where(line) ? " — " : ""}{line.message}</li>)}</ul> : null}</div> : null}

      {canExport ? (
        <SectionCard title="Supplier and price database" description="One Excel file in the company layout: a sheet per supplier type, and the labor and material + labor prices as a grid of items by supplier. Edit it and bring it back with the import." padded>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" pending={busy === "export"} onClick={() => run("export", async () => {
              const result = await exportPriceDatabaseAction();
              if (result.ok === false) { setError(result.error.safeMessage); return; }
              download(result.data.filename, result.data.base64, result.data.mimeType);
            })}>Download Excel</Button>
          </div>
        </SectionCard>
      ) : null}

      {canImport ? (
        <SectionCard title="Import from Excel" description="Use your existing database file or an export. Supplier sheets are named “Database - Subcon”; price sheets have item rows, one column per supplier, and section headings. Check the file first; nothing is saved until you import." padded>
          <div className="grid gap-3">
            <Field label="Excel file">
              <input ref={inputRef} type="file" accept=".xlsx" className="text-sm" onChange={(event) => { setFile(event.target.files?.[0] ?? null); optionsChanged(); }} />
            </Field>
            <Field label="Price sheets are" description="Used for every price sheet in the file.">
              <Select value={priceKind} onChange={(event) => { setPriceKind(event.target.value === "material-labor" ? "material-labor" : "labor"); optionsChanged(); }}>
                <option value="labor">Labor only</option>
                <option value="material-labor">Material + labor</option>
              </Select>
            </Field>
            <Field label="Unit when a row has none or an unknown one" description="Sheets without a Satuan column use this unit for every row.">
              <Select value={defaultUnitId} onChange={(event) => { setDefaultUnitId(event.target.value); optionsChanged(); }}>
                <option value="">None — report the row</option>
                {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.code} — {unit.name}</option>)}
              </Select>
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" disabled={!file} pending={busy === "preview"} onClick={() => run("preview", async () => {
                setDone(null);
                const result = await previewPriceDatabaseImportAction(formFor());
                if (result.ok === false) { setError(result.error.safeMessage); setPreview(null); return; }
                setPreview(result.data);
              })}>Check file</Button>
              <Button variant="primary" disabled={!clean || changes === 0 || !file} pending={busy === "apply"} onClick={() => run("apply", async () => {
                const result = await applyPriceDatabaseImportAction(formFor(preview!.hash));
                if (result.ok === false) {
                  setError(result.error.safeMessage);
                  setErrorLines(((result.error.details as { errors?: Message[] } | undefined)?.errors ?? []).slice(0, 30));
                  return;
                }
                const t = result.data.totals;
                setDone(`Imported: ${t.suppliersCreated + t.suppliersFromPrices} new supplier(s), ${t.pricesCreated} new and ${t.pricesUpdated} changed price(s).`);
                setPreview(null); setFile(null);
                if (inputRef.current) inputRef.current.value = "";
              })}>Import</Button>
            </div>
            {done ? <Text size="sm">{done}</Text> : null}
            {preview ? (
              <div className="grid gap-2 rounded-card border border-line p-3 text-sm">
                <Text weight="semibold">{clean ? "The file is ready to import" : "The file has problems — nothing can be imported yet"}</Text>
                <ul className="grid gap-0.5">
                  <li>Suppliers: {preview.totals.suppliersCreated} new, {preview.totals.suppliersExisting} already exist{preview.totals.suppliersFromPrices ? `, ${preview.totals.suppliersFromPrices} new from price columns` : ""}</li>
                  <li>Categories: {preview.totals.categoriesCreated} new</li>
                  <li>Prices: {preview.totals.pricesCreated} new, {preview.totals.pricesUpdated} changed, {preview.totals.pricesUnchanged} unchanged</li>
                </ul>
                {preview.errors.length ? <ul className="grid gap-1 text-danger">{preview.errors.slice(0, 40).map((line, index) => <li key={index}>{where(line)}{where(line) ? " — " : ""}{line.message}</li>)}{preview.errors.length > 40 ? <li>…and {preview.errors.length - 40} more</li> : null}</ul> : null}
                {preview.messages.length ? <ul className="grid gap-1 text-ink-secondary">{preview.messages.slice(0, 40).map((line, index) => <li key={index}>{where(line)}{where(line) ? " — " : ""}{line.message}</li>)}{preview.messages.length > 40 ? <li>…and {preview.messages.length - 40} more notes</li> : null}</ul> : null}
              </div>
            ) : null}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
