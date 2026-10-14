"use client";

import { CornerDownLeft, ListPlus, Plus } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import { IconButton, Input, TableCell, TableRow } from "@/platform/ui_engine";
import { UNIT_ALIAS_WORDS, resolveUnit } from "@/apps/bq/lib/unit-alias";

export type QuickEntryFields = { name: string; specification: string; qty: string; unit: string; hargaSnapshot: string };

/* A cell that reads as part of the sheet until it is used: no box at rest, the field outline on hover and focus. */
const CELL_INPUT = "!border-transparent !bg-transparent !shadow-none hover:!border-line focus:!border-line-focus focus:!bg-surface";

/**
 * The empty last row of a table (owner 2026-10-14, "seperti Excel"; one row, same columns as the table): type a Work
 * Item's name, specification, quantity, unit and price, Tab between them, Enter saves and the row is ready for the
 * next one, keeping the unit. An empty price makes the row TBC. Office units such as "titik" are read as the studio's
 * code. "Form lengkap" opens the dialog that can also apply an Assembly.
 */
export function QuickEntryRow({ units, disabled, editableColumn, onAdd, onMore }: {
  units: readonly string[];
  disabled: boolean;
  /** Whether the table has its trailing action column. */
  editableColumn: boolean;
  onAdd: (fields: QuickEntryFields) => Promise<void>;
  onMore?: () => void;
}) {
  const listId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [specification, setSpecification] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving || disabled || !name.trim()) return;
    setSaving(true);
    try {
      await onAdd({ name: name.trim(), specification: specification.trim(), qty: qty.trim() || "1", unit: resolveUnit(unit, units).unit, hargaSnapshot: price.trim() });
      setName(""); setSpecification(""); setQty(""); setPrice("");
      nameRef.current?.focus();
    } catch {
      // The editor shows the refusal; what was typed stays so it can be corrected.
    } finally {
      setSaving(false);
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void save(); }
    if (event.key === "Escape") { setName(""); setSpecification(""); setQty(""); setPrice(""); }
  };
  const typing = name.trim() !== "";

  return (
    <TableRow data-quick-entry className="hover:!bg-transparent">
      <TableCell />
      <TableCell align="center"><Plus aria-hidden="true" className="inline size-3.5 text-ink-tertiary" /></TableCell>
      <TableCell>
        <Input ref={nameRef} density="compact" aria-label="Nama pekerjaan baru" placeholder="Ketik pekerjaan baru…" value={name} disabled={disabled} maxLength={160} onChange={(event) => setName(event.target.value)} onKeyDown={onKeyDown} className={`${CELL_INPUT} text-sm`} />
      </TableCell>
      <TableCell>
        <Input density="compact" aria-label="Spesifikasi pekerjaan baru" placeholder={typing ? "Spesifikasi" : ""} value={specification} disabled={disabled} maxLength={1000} onChange={(event) => setSpecification(event.target.value)} onKeyDown={onKeyDown} className={CELL_INPUT} />
      </TableCell>
      <TableCell>
        <Input density="compact" aria-label="Jumlah pekerjaan baru" placeholder={typing ? "1" : ""} inputMode="decimal" value={qty} disabled={disabled} onChange={(event) => setQty(event.target.value)} onKeyDown={onKeyDown} className={`${CELL_INPUT} text-right tabular-nums`} />
      </TableCell>
      <TableCell>
        <Input density="compact" aria-label="Satuan pekerjaan baru" placeholder={typing ? "ls" : ""} list={listId} value={unit} disabled={disabled} maxLength={40} onChange={(event) => setUnit(event.target.value)} onKeyDown={onKeyDown} className={CELL_INPUT} />
        <datalist id={listId}>{[...units, ...UNIT_ALIAS_WORDS].map((code) => <option key={code} value={code} />)}</datalist>
      </TableCell>
      <TableCell>
        <Input density="compact" aria-label="Harga satuan pekerjaan baru" placeholder={typing ? "kosong = TBC" : ""} inputMode="decimal" value={price} disabled={disabled} onChange={(event) => setPrice(event.target.value)} onKeyDown={onKeyDown} className={`${CELL_INPUT} text-right tabular-nums`} />
      </TableCell>
      <TableCell align="end">
        {typing ? (
          <button type="button" disabled={saving || disabled} onClick={() => void save()} className="inline-flex items-center gap-1 rounded-action px-1.5 py-0.5 text-xs text-ink-secondary hover:bg-surface-muted hover:text-ink disabled:opacity-50">
            <CornerDownLeft aria-hidden="true" className="size-3" />
            {saving ? "Menyimpan…" : "Enter"}
          </button>
        ) : null}
      </TableCell>
      {editableColumn ? (
        <TableCell align="end">
          {onMore ? <IconButton size="sm" variant="ghost" label="Tambah lewat form (bisa pakai Assembly)" icon={<ListPlus aria-hidden="true" />} disabled={disabled} onClick={onMore} /> : null}
        </TableCell>
      ) : null}
    </TableRow>
  );
}
