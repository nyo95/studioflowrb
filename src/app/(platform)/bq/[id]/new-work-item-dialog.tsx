"use client";

import { useState } from "react";

import { Button, Combobox, Dialog, Field, FormActions, InlineError, Input, Select, Text } from "@/platform/ui_engine";
import type { BqAssemblyTemplateRead } from "@/apps/bq/public";
import type { UnitRead } from "@/apps/masterdata/public";

export type NewWorkItemFields = { name: string; qty: string; unit: string; assemblyId: string | null };

/**
 * One door for a new Work Item: start empty, or start from an Assembly. An Assembly only adds its Cost Components
 * under the new Work Item; the name, quantity and unit are chosen here and stay editable on the row afterwards.
 */
export function NewWorkItemDialog({
  assemblies,
  units,
  where,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  assemblies: readonly BqAssemblyTemplateRead[];
  units: readonly UnitRead[];
  /** Where it will land, shown so the estimator sees the Section or Subsection before saving. */
  where: string;
  pending: boolean;
  /** The last error from the server, shown here because the page behind the dialog is covered. */
  error?: string | null;
  onClose: () => void;
  onSubmit: (fields: NewWorkItemFields) => void;
}) {
  const defaultUnit = units.find((unit) => unit.code === "ls")?.code ?? units[0]?.code ?? "ls";
  const [mode, setMode] = useState<"empty" | "assembly">("empty");
  const [assemblyId, setAssemblyId] = useState("");
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState(defaultUnit);
  const assembly = assemblies.find((candidate) => candidate.id === assemblyId);
  const effectiveName = name.trim() || (mode === "assembly" ? assembly?.name ?? "" : "");
  const ready = effectiveName.length > 0 && qty.trim().length > 0 && (mode === "empty" || assemblyId !== "");

  return (
    <Dialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title="Tambah Work Item"
      description={`Ditambahkan ke ${where}.`}
      size="md"
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready || pending) return;
          onSubmit({ name: effectiveName, qty: qty.trim(), unit, assemblyId: mode === "assembly" ? assemblyId : null });
        }}
      >
        <div className="flex gap-1.5" role="group" aria-label="Cara memulai">
          <Button type="button" size="sm" variant={mode === "empty" ? "primary" : "secondary"} onClick={() => setMode("empty")}>Mulai kosong</Button>
          <Button type="button" size="sm" variant={mode === "assembly" ? "primary" : "secondary"} onClick={() => setMode("assembly")} disabled={assemblies.length === 0}>Pakai Assembly</Button>
        </div>

        {mode === "assembly" ? (
          <Field label="Assembly" description="Cost Component Assembly disalin ke Work Item ini; harga mengikuti Assembly saat ini.">
            <Combobox
              label="Assembly"
              options={assemblies.map((candidate) => ({ id: candidate.id, label: candidate.name, description: `${candidate.lineCount} rincian` }))}
              value={assemblyId}
              onValueChange={setAssemblyId}
              placeholder="Cari Assembly…"
              searchPlaceholder="Cari Assembly…"
              emptyLabel="Belum ada Assembly — simpan dari Work Item yang sudah berisi Cost Component"
            />
          </Field>
        ) : null}

        <Field label="Nama Work Item" required={mode === "empty"}>
          <Input autoFocus value={name} placeholder={mode === "assembly" ? assembly?.name ?? "Nama dari Assembly" : "Mis. Kitchen cabinet"} onChange={(event) => setName(event.target.value)} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Jumlah">
            <Input inputMode="decimal" value={qty} onChange={(event) => setQty(event.target.value)} />
          </Field>
          <Field label="Satuan">
            <Select aria-label="Satuan Work Item" value={unit} onChange={(event) => setUnit(event.target.value)}>
              {units.map((candidate) => <option key={candidate.id} value={candidate.code}>{candidate.code}</option>)}
            </Select>
          </Field>
        </div>

        {mode === "empty" ? (
          <Text tone="tertiary" size="sm">Work Item kosong bisa diberi harga langsung, atau diisi Cost Component setelahnya.</Text>
        ) : null}

        {error ? <InlineError>{error}</InlineError> : null}

        <FormActions>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Batal</Button>
          <Button type="submit" variant="primary" disabled={!ready || pending} pending={pending}>Tambah Work Item</Button>
        </FormActions>
      </form>
    </Dialog>
  );
}
