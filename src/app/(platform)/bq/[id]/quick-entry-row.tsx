"use client";

import { CornerDownLeft } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import { Button, Input, Text } from "@/platform/ui_engine";
import { resolveUnit } from "@/apps/bq/lib/paste-rows";

export type QuickEntryFields = { name: string; specification: string; qty: string; unit: string; hargaSnapshot: string };

/**
 * The always-ready row under a table (owner 2026-10-14, "isi cepat seperti Excel"): type a Work Item's name,
 * specification, quantity, unit and price, Tab between them, Enter saves and the row is ready for the next one, keeping
 * the unit. An empty price makes the row TBC. Office units such as "titik" are read as the studio's code.
 */
export function QuickEntryRow({ where, units, disabled, onAdd }: {
  where: string;
  units: readonly string[];
  disabled: boolean;
  onAdd: (fields: QuickEntryFields) => Promise<void>;
}) {
  const listId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [specification, setSpecification] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  const save = async () => {
    if (saving || disabled || !name.trim()) return;
    setSaving(true);
    try {
      await onAdd({ name: name.trim(), specification: specification.trim(), qty: qty.trim() || "1", unit: resolveUnit(unit, units).unit, hargaSnapshot: price.trim() });
      setAdded(name.trim());
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
  };
  const field = "h-9 rounded-control border border-line bg-surface px-2 text-sm";

  return (
    <div className="grid gap-1.5 rounded-control border border-dashed border-line-strong bg-surface-muted/60 p-2" aria-label={`Isi cepat di ${where}`} role="group">
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_88px_96px_150px_auto] md:items-start">
        <div className="grid gap-1.5">
          <Input ref={nameRef} aria-label="Nama pekerjaan baru" placeholder="Ketik nama pekerjaan…" value={name} disabled={disabled} maxLength={160} onChange={(event) => setName(event.target.value)} onKeyDown={onKeyDown} className={field} />
          <Input aria-label="Spesifikasi pekerjaan baru" placeholder="Spesifikasi (boleh kosong), mis. Gypsum 9mm rangka hollow" value={specification} disabled={disabled} maxLength={1000} onChange={(event) => setSpecification(event.target.value)} onKeyDown={onKeyDown} className={`${field} h-8 text-xs`} />
        </div>
        <Input aria-label="Jumlah pekerjaan baru" placeholder="1" inputMode="decimal" value={qty} disabled={disabled} onChange={(event) => setQty(event.target.value)} onKeyDown={onKeyDown} className={`${field} text-right`} />
        <Input aria-label="Satuan pekerjaan baru" placeholder="ls" list={listId} value={unit} disabled={disabled} maxLength={40} onChange={(event) => setUnit(event.target.value)} onKeyDown={onKeyDown} className={field} />
        <Input aria-label="Harga satuan pekerjaan baru" placeholder="Harga (kosong = TBC)" inputMode="decimal" value={price} disabled={disabled} onChange={(event) => setPrice(event.target.value)} onKeyDown={onKeyDown} className={`${field} text-right`} />
        <Button type="button" size="sm" variant="primary" pending={saving} disabled={disabled || !name.trim()} trailingIcon={<CornerDownLeft aria-hidden="true" className="size-3.5" />} onClick={() => void save()}>Tambah</Button>
        <datalist id={listId}>{units.map((code) => <option key={code} value={code} />)}<option value="titik" /></datalist>
      </div>
      <Text size="sm" tone="tertiary" className="flex flex-wrap gap-x-4 gap-y-0.5">
        <span><b className="text-ink-secondary">Tab</b> pindah kolom · <b className="text-ink-secondary">Enter</b> simpan, baris baru siap</span>
        <span>Harga kosong = TBC</span>
        {added ? <span className="text-success">✓ {added} ditambahkan</span> : null}
      </Text>
    </div>
  );
}
