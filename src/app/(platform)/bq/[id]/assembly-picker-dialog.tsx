"use client";

import { useEffect, useState, useTransition } from "react";

import { Button, Dialog, Field, FormActions, Input, InlineError, Select, Spinner, Text } from "@/platform/ui_engine";
import { createMoney, formatMoney } from "@platform/utilities/money";
import type { BqAssemblyLineRead, BqAssemblyTemplateRead } from "@/apps/bq/public";
import { getAssemblyLinesAction } from "./source-actions";

const KATEGORI_LABEL: Record<string, string> = {
  MATERIAL: "Material",
  UPAH: "Labor",
  MATERIAL_UPAH: "Material + Labor",
  BIAYA_UMUM: "Biaya Umum",
  TRANSPORTASI_AKOMODASI: "Transportasi",
  ALAT: "Alat",
};

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
  const [lines, setLines] = useState<BqAssemblyLineRead[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, startPreview] = useTransition();

  // Fetches after render (never during it — R4.57 crashed the same dialog
  // family by calling startTransition from the render path).
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    startPreview(async () => {
      const result = await getAssemblyLinesAction(selectedId);
      if (cancelled) return;
      if (result.ok === false) {
        setPreviewError(result.error.safeMessage);
        setLines([]);
        return;
      }
      setPreviewError(null);
      setLines(result.data);
    });
    return () => { cancelled = true; };
  }, [selectedId, startPreview]);

  const selectedAssembly = assemblies.find((a) => a.id === selectedId);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} title="Terapkan Assembly" description="Pilih assembly untuk disalin sebagai Component Group beserta Cost Components-nya." size="lg">
      <div className="grid gap-4 sm:grid-cols-2">
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
        </div>

        <div className="grid gap-1.5 rounded-control border border-line-subtle bg-surface-muted p-3">
          <Text tone="tertiary" size="sm" meta>Pratinjau isi resep</Text>
          {!selectedId ? (
            <Text tone="tertiary" size="sm">Pilih assembly untuk melihat isinya.</Text>
          ) : loadingPreview || lines === null ? (
            <div className="flex items-center gap-2 py-2"><Spinner decorative /> <Text tone="tertiary" size="sm">Memuat…</Text></div>
          ) : previewError ? (
            <InlineError>{previewError}</InlineError>
          ) : lines.length === 0 ? (
            <Text tone="tertiary" size="sm">{selectedAssembly?.name ?? "Assembly ini"} belum punya baris.</Text>
          ) : (
            <ul className="grid gap-1.5">
              {lines.map((line) => (
                <li key={line.id} className="grid gap-0.5 border-b border-line-subtle pb-1.5 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <Text size="sm" weight="medium" className="truncate">{line.title}</Text>
                    <Text tone="tertiary" size="sm" className="shrink-0">{KATEGORI_LABEL[line.kategori] ?? line.kategori}</Text>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-ink-tertiary">
                    <span>{line.qty} {line.purchaseUnit} · koef {line.koefisien}</span>
                    <span className="tabular-nums">{formatMoney(createMoney(line.harga, line.currency))}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <FormActions>
        <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Batal</Button>
        <Button type="button" variant="primary" disabled={!selectedId || pending} pending={pending} onClick={() => onApply(selectedId, qtyPerL1)}>
          Terapkan
        </Button>
      </FormActions>
    </Dialog>
  );
}
