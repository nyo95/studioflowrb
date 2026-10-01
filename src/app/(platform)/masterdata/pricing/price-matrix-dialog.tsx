"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, type ClipboardEvent, type FormEvent } from "react";

import { Button, CreatableMultiSelect, CreatableSearch, Dialog, Field, FormActions, IconButton, InlineError, Input, Select, Text } from "@/platform/ui_engine";
import { formatDecimal } from "@platform/utilities/decimal";

import { parseIndonesianAmount, parsePastedAmount } from "./amount-format";
import { saveWorkPriceMatrixAction } from "./actions";

type Ref = { id: string; name: string };
type Cell = { display: string; value: string };
type MatrixRow = { key: number; name: string; unitId: string; notes: string; cells: Record<string, Cell> };
type CellProblem = { rowIndex: number; vendorId?: string; message: string };

const SUPPLIER_LIMIT = 12;

function emptyRow(key: number, unitId: string): MatrixRow {
  return { key, name: "", unitId, notes: "", cells: {} };
}

/**
 * Compare-suppliers entry: one category, several suppliers, one row per item with an amount per supplier.
 * Blank cells mean "this supplier has no price for the item". A block copied from Excel can be pasted straight in:
 * columns are Name, Specification (goes to notes), then one amount per chosen supplier in the order shown.
 */
export function PriceMatrixDialog({ vendors, categories, units, onClose }: { vendors: Ref[]; categories: Ref[]; units: Array<Ref & { code: string }>; onClose: () => void }) {
  const [kind, setKind] = useState<"labor" | "material-labor">("labor");
  const [categoryId, setCategoryId] = useState("");
  const [vendorIds, setVendorIds] = useState<string[]>([]);
  const [keyCounter, setKeyCounter] = useState(1);
  const defaultUnit = units.find((unit) => unit.code === "m2")?.id ?? "";
  const [rows, setRows] = useState<MatrixRow[]>(() => [emptyRow(0, defaultUnit)]);
  const [problems, setProblems] = useState<Record<number, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [pasteNote, setPasteNote] = useState<string | null>(null);

  const chosen = vendorIds.map((id) => vendors.find((vendor) => vendor.id === id)).filter((vendor): vendor is Ref => Boolean(vendor));
  const patchRow = (key: number, patch: Partial<MatrixRow>) => setRows((current) => current.map((row) => row.key === key ? { ...row, ...patch } : row));
  const patchCell = (key: number, vendorId: string, cell: Cell) => setRows((current) => current.map((row) => row.key === key ? { ...row, cells: { ...row.cells, [vendorId]: cell } } : row));
  const addRow = () => { setRows((current) => [...current, emptyRow(keyCounter, current[current.length - 1]?.unitId ?? defaultUnit)]); setKeyCounter((value) => value + 1); };
  const removeRow = (key: number) => setRows((current) => current.length === 1 ? [emptyRow(keyCounter, current[0]?.unitId ?? defaultUnit)] : current.filter((row) => row.key !== key));
  const isFilled = (row: MatrixRow) => row.name.trim() !== "" || chosen.some((vendor) => (row.cells[vendor.id]?.value ?? "") !== "");
  const filled = rows.filter(isFilled);
  const priceCount = filled.reduce((total, row) => total + chosen.filter((vendor) => (row.cells[vendor.id]?.value ?? "") !== "").length, 0);

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const text = event.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return; // a normal single-cell paste
    event.preventDefault();
    if (chosen.length === 0) { setPasteNote("Choose the suppliers first, then paste: columns are Name, Specification, then one amount per supplier."); return; }
    let nextKey = keyCounter;
    const unitId = rows[rows.length - 1]?.unitId ?? defaultUnit;
    const parsed: MatrixRow[] = [];
    let skipped = 0;
    for (const line of text.replace(/\r/g, "").split("\n")) {
      const columns = line.split("\t");
      const name = (columns[0] ?? "").trim();
      const notes = (columns[1] ?? "").trim();
      const cells: Record<string, Cell> = {};
      chosen.forEach((vendor, index) => {
        const value = parsePastedAmount(columns[2 + index] ?? "");
        if (value) cells[vendor.id] = { value, display: formatDecimal(value) };
      });
      if (!name || Object.keys(cells).length === 0) { if (name || columns.some((column) => column.trim())) skipped += 1; continue; } // section headings and empty lines
      parsed.push({ key: nextKey++, name, unitId, notes: notes === "-" ? "" : notes, cells });
    }
    setKeyCounter(nextKey);
    setRows((current) => [...current.filter(isFilled), ...parsed]);
    setPasteNote(`Pasted ${parsed.length} item(s)${skipped ? `; ${skipped} line(s) without a name or an amount (such as section headings) were skipped` : ""}. Check the unit of each row.`);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setError(null); setProblems({});
    if (!categoryId) { setError("Choose the pricing category."); return; }
    if (chosen.length === 0) { setError("Choose at least one supplier."); return; }
    if (priceCount === 0) { setError("Enter at least one amount."); return; }
    const missing: Record<number, string[]> = {};
    filled.forEach((row) => {
      const lacks = [!row.name.trim() && "name", !row.unitId && "unit"].filter(Boolean);
      if (lacks.length) missing[row.key] = [`Needs ${lacks.join(" and ")}.`];
    });
    if (Object.keys(missing).length) { setProblems(missing); setError("Some rows are incomplete. Nothing was saved."); return; }
    setPending(true);
    try {
      const result = await saveWorkPriceMatrixAction({
        kind, categoryId, currency: "IDR", vendorIds: chosen.map((vendor) => vendor.id),
        rows: filled.map((row) => ({ name: row.name.trim(), unitId: row.unitId, notes: row.notes.trim() || null, amounts: Object.fromEntries(chosen.map((vendor) => [vendor.id, row.cells[vendor.id]?.value || null])) })),
      });
      if (result.ok) { onClose(); return; }
      if (result.ok === false) {
        const detail = (result.error.details as { rows?: CellProblem[] } | undefined)?.rows ?? [];
        const next: Record<number, string[]> = {};
        for (const problem of detail) {
          const row = filled[problem.rowIndex];
          if (!row) continue;
          const supplier = problem.vendorId ? vendors.find((vendor) => vendor.id === problem.vendorId)?.name : null;
          (next[row.key] ??= []).push(supplier ? `${supplier}: ${problem.message}` : problem.message);
        }
        setProblems(next);
        setError(result.error.safeMessage);
      }
    } catch {
      setError("The prices could not be saved. Please try again.");
    } finally {
      setPending(false);
    }
  };

  const columns = `minmax(10rem,2fr) 6rem ${chosen.map(() => "minmax(7.5rem,1fr)").join(" ")} minmax(8rem,1.4fr) 2rem`;

  return (
    <Dialog open size="full" dismissible={!pending} onOpenChange={(open) => { if (!open && !pending) onClose(); }} title="Compare suppliers" description="Enter one item per row and one amount per supplier. Leave a cell blank when that supplier has no price.">
      <form className="grid gap-4" onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)_minmax(0,2fr)]">
          <Field label="Price type" required>
            <Select value={kind} onChange={(event) => setKind(event.target.value === "material-labor" ? "material-labor" : "labor")}>
              <option value="labor">Labor only</option>
              <option value="material-labor">Material + labor</option>
            </Select>
          </Field>
          <Field label="Pricing category" required>
            <CreatableSearch label="Pricing category" options={categories.map((category) => ({ id: category.id, label: category.name }))} value={categoryId} onValueChange={setCategoryId} placeholder="Search or select category" searchPlaceholder="Search pricing categories…" emptyLabel="No pricing category matches this search." className="w-full" />
          </Field>
          <Field label={`Suppliers (up to ${SUPPLIER_LIMIT})`} required description="The columns follow the order you choose them in.">
            <CreatableMultiSelect label="Suppliers" options={vendors.map((vendor) => ({ id: vendor.id, label: vendor.name }))} value={vendorIds} onValueChange={(next) => setVendorIds(next.slice(0, SUPPLIER_LIMIT))} placeholder="Search suppliers" searchPlaceholder="Search suppliers…" />
          </Field>
        </div>

        {chosen.length === 0 ? <Text size="sm" tone="secondary">Choose the suppliers to open the grid.</Text> : (
          <div className="grid gap-2" onPaste={onPaste}>
            <Text size="sm" tone="secondary">Tip: copy a block from Excel and paste it here — columns Name, Specification, then one amount per supplier in the order shown. a dash or “By Request” is read as no price.</Text>
            {pasteNote ? <Text size="sm" tone="secondary">{pasteNote}</Text> : null}
            <div className="overflow-x-auto">
              <div className="grid min-w-max gap-2" style={{ gridTemplateColumns: columns }}>
                <span className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Name</span>
                <span className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Unit</span>
                {chosen.map((vendor) => <span key={vendor.id} className="truncate px-1 text-xs font-semibold uppercase tracking-wide text-ink-tertiary" title={vendor.name}>{vendor.name}</span>)}
                <span className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Notes / specification</span>
                <span />
                {rows.map((row, index) => (
                  <div key={row.key} className="contents">
                    <Input aria-label={`Name, row ${index + 1}`} density="compact" textCase="title" maxLength={128} placeholder="e.g. Screeding base" value={row.name} onChange={(event) => patchRow(row.key, { name: event.target.value })} invalid={Boolean(problems[row.key])} />
                    <Select aria-label={`Unit, row ${index + 1}`} density="compact" value={row.unitId} onChange={(event) => patchRow(row.key, { unitId: event.target.value })}>
                      <option value="">Unit</option>
                      {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.code}</option>)}
                    </Select>
                    {chosen.map((vendor, column) => (
                      <Input key={vendor.id} aria-label={`${vendor.name}, row ${index + 1}`} density="compact" inputMode="decimal" placeholder="–" className="tabular-nums" value={row.cells[vendor.id]?.display ?? ""}
                        onChange={(event) => { const parsed = parseIndonesianAmount(event.target.value); if (parsed === null) return; patchCell(row.key, vendor.id, { value: parsed, display: event.target.value.endsWith(",") ? event.target.value : parsed ? formatDecimal(parsed) : "" }); }}
                        onBlur={() => { const cell = row.cells[vendor.id]; if (cell) patchCell(row.key, vendor.id, { value: cell.value, display: cell.value ? formatDecimal(cell.value) : "" }); }}
                        onKeyDown={(event) => { if (event.key === "Enter" && index === rows.length - 1 && column === chosen.length - 1) { event.preventDefault(); addRow(); } }} />
                    ))}
                    <Input aria-label={`Notes, row ${index + 1}`} density="compact" maxLength={1000} placeholder="Specification, brand reference…" value={row.notes} onChange={(event) => patchRow(row.key, { notes: event.target.value })} />
                    <IconButton label={`Remove row ${index + 1}`} icon={<Trash2 size={14} />} size="sm" onClick={() => removeRow(row.key)} />
                    {problems[row.key] ? <div role="alert" className="col-span-full px-1 text-xs text-danger">{problems[row.key]!.map((message) => <div key={message}>Row {index + 1} — {message}</div>)}</div> : null}
                  </div>
                ))}
              </div>
            </div>
            <div><Button type="button" variant="ghost" size="sm" leadingIcon={<Plus />} onClick={addRow}>Add row</Button></div>
          </div>
        )}

        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions>
          <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" pending={pending}>{priceCount > 0 ? `Create ${priceCount} ${priceCount === 1 ? "price" : "prices"}` : "Create prices"}</Button>
        </FormActions>
      </form>
    </Dialog>
  );
}
