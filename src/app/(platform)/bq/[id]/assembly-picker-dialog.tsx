"use client";

import { useState } from "react";

import { Button, Dialog, Field, FormActions, Input, Select } from "@/platform/ui_engine";
import type { BqAssemblyTemplateRead } from "@/apps/bq/public";
export function AssemblyPickerDialog({
  assemblies,
  pending,
  onClose,
  onApply,
}: {
  assemblies: BqAssemblyTemplateRead[];
  pending: boolean;
  onClose: () => void;
  onApply: (assemblyId: string, qtyPerL1: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(assemblies[0]?.id ?? "");
  const [qtyPerL1, setQtyPerL1] = useState("1");
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} title="Terapkan Assembly" description="Pilih assembly untuk disalin sebagai Component Group beserta Cost Components-nya.">
      <div className="grid gap-4">
        <Field label="Assembly">
          <Select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {assemblies.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.lineCount} baris)</option>
            ))}
          </Select>
        </Field>
        <Field label="Quantity per Work Item">
          <Input inputMode="decimal" value={qtyPerL1} onChange={(e) => setQtyPerL1(e.target.value)} />
        </Field>
        <FormActions>
          <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Batal</Button>
          <Button type="button" variant="primary" disabled={!selectedId || pending} pending={pending} onClick={() => onApply(selectedId, qtyPerL1)}>
            Terapkan
          </Button>
        </FormActions>
      </div>
    </Dialog>
  );
}
