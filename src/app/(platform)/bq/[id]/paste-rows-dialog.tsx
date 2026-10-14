"use client";

import { useMemo, useState } from "react";

import { Badge, Button, Dialog, FormActions, InlineError, Select, Text } from "@/platform/ui_engine";
import { createMoney, formatMoney } from "@platform/utilities/money";
import {
  PASTE_COLUMN_ROLES,
  PASTE_ROLE_LABEL,
  buildPastePreview,
  guessColumns,
  hasHeaderRow,
  splitClipboard,
  type PasteColumnRole,
  type PastedItem,
} from "@/apps/bq/lib/paste-rows";

/**
 * "Tempel dari Excel" (owner 2026-10-14): copy rows in the spreadsheet, paste them here, check the preview, add them
 * all at once. Columns are guessed (from the header when there is one) and can be changed; group headings and total
 * rows are skipped; prices come along or are left for later (TBC).
 */
export function PasteRowsDialog({ where, units, pending, error, onClose, onSubmit }: {
  where: string;
  units: readonly string[];
  pending: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (items: PastedItem[]) => void;
}) {
  const [text, setText] = useState("");
  const [override, setOverride] = useState<{ text: string; roles: PasteColumnRole[] } | null>(null);
  const [withPrices, setWithPrices] = useState(true);

  const rows = useMemo(() => splitClipboard(text), [text]);
  const guessed = useMemo(() => guessColumns(rows, units), [rows, units]);
  // A column choice holds only for the text it was made on; a new paste is guessed again.
  const roles = override && override.text === text ? override.roles : guessed;
  const preview = useMemo(() => buildPastePreview(rows, roles, { withPrices, knownUnits: units }), [rows, roles, withPrices, units]);
  const sample = hasHeaderRow(rows) ? rows[0] ?? [] : rows[0] ?? [];
  const counts = preview.rows.reduce((sum, row) => ({ ...sum, [row.item.priceMode]: (sum[row.item.priceMode] ?? 0) + 1 }), {} as Record<string, number>);
  const setRole = (index: number, role: PasteColumnRole) => {
    const next = [...roles];
    // A role sits in one column: choosing it here frees the column that had it.
    if (role !== "ignore") next.forEach((current, at) => { if (current === role) next[at] = "ignore"; });
    next[index] = role;
    setOverride({ text, roles: next });
  };
  const toggle = (on: boolean) => `h-8 flex-1 rounded-action px-3 text-sm ${on ? "bg-surface font-semibold text-ink shadow-raise" : "text-ink-secondary hover:text-ink"}`;

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }} title="Tempel dari Excel" description={`Masuk ke ${where}. Di Excel, blok baris pekerjaannya (judul kolom boleh ikut), Ctrl+C, lalu tempel di kotak ini.`} size="lg">
      <div className="grid gap-4">
        <div className="grid gap-1">
          <Text size="sm" tone="secondary">Harga dari Excel</Text>
          <div role="group" aria-label="Harga dari Excel" className="flex max-w-md gap-1 rounded-control bg-surface-muted p-1">
            <button type="button" aria-pressed={withPrices} className={toggle(withPrices)} onClick={() => setWithPrices(true)}>Ikut dibawa</button>
            <button type="button" aria-pressed={!withPrices} className={toggle(!withPrices)} onClick={() => setWithPrices(false)}>Isi nanti (TBC)</button>
          </div>
        </div>

        <label className="grid gap-1">
          <Text size="sm" tone="secondary">Kotak tempel</Text>
          <textarea
            aria-label="Kotak tempel"
            rows={5}
            value={text}
            autoFocus
            placeholder="Tempel di sini (Ctrl+V)…"
            onChange={(event) => setText(event.target.value)}
            className="resize-y rounded-control border border-dashed border-line-strong bg-surface-muted/50 px-3 py-2 font-ui-mono text-xs"
          />
        </label>

        {rows.length > 0 ? (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Text weight="semibold">{preview.rows.length} pekerjaan terbaca</Text>
              <Text size="sm" tone="tertiary">{counts.PRICED ?? 0} berharga · {counts.TBC ?? 0} TBC · {counts.BY_OWNER ?? 0} By Owner{preview.skipped ? ` · ${preview.skipped} baris judul/total dilewati` : ""}</Text>
              <Text size="sm" tone="tertiary">Kolom ditebak otomatis — ubah di judul kolom bila salah.</Text>
            </div>
            <div className="max-h-[340px] overflow-auto rounded-control border border-line">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead className="sticky top-0 bg-surface-muted">
                  <tr>
                    {roles.map((role, index) => (
                      <th key={index} className="px-2 py-1.5 text-left font-normal">
                        <Select aria-label={`Isi kolom ${index + 1}`} value={role} onChange={(event) => setRole(index, event.target.value as PasteColumnRole)} className="!h-8 !w-auto min-w-[120px] font-semibold">
                          {PASTE_COLUMN_ROLES.map((option) => <option key={option} value={option}>{PASTE_ROLE_LABEL[option]}</option>)}
                        </Select>
                        <span className="mt-0.5 block max-w-[180px] truncate text-xs text-ink-tertiary" title={sample[index] ?? ""}>{sample[index] || "—"}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
              </table>
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.06em] text-ink-tertiary">
                    <th className="px-2 py-1.5 font-semibold">Uraian &amp; spesifikasi</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Jumlah</th>
                    <th className="px-2 py-1.5 font-semibold">Satuan</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Harga satuan</th>
                    <th className="px-2 py-1.5 font-semibold">Catatan</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.line} className="border-t border-line-subtle align-top">
                      <td className="px-2 py-1.5"><span className="font-medium">{row.item.name}</span>{row.item.specification ? <span className="block text-xs text-ink-tertiary">{row.item.specification}</span> : null}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{row.item.qty}</td>
                      <td className="px-2 py-1.5">{row.item.unit}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {row.item.priceMode === "PRICED" && row.item.hargaSnapshot !== null ? formatMoney(createMoney(row.item.hargaSnapshot, "IDR")) : <Badge tone={row.item.priceMode === "BY_OWNER" ? "neutral" : "warning"}>{row.item.priceMode === "BY_OWNER" ? "By Owner" : "TBC"}</Badge>}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-ink-secondary">{row.notes.join(" · ") || "OK"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {preview.problems.length > 0 && rows.length > 0 ? <InlineError>{preview.problems.join(" ")}</InlineError> : null}
        {error ? <InlineError>{error}</InlineError> : null}
        <FormActions>
          <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>Batal</Button>
          <Button type="button" variant="primary" pending={pending} disabled={pending || preview.rows.length === 0 || preview.problems.length > 0} onClick={() => onSubmit(preview.rows.map((row) => row.item))}>
            {preview.rows.length > 0 ? `Masukkan ${preview.rows.length} pekerjaan` : "Masukkan"}
          </Button>
        </FormActions>
      </div>
    </Dialog>
  );
}
