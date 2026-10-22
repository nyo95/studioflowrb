"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { Button, Dialog, EmptyState, InlineError, SearchField, Select } from "@/platform/ui_engine";
import { createMoney, formatMoney } from "@platform/utilities/money";
import { listLineItemSourcesAction, type LineItemSourceOption } from "./source-actions";

function sourceDescription(option: LineItemSourceOption) {
  return [option.specification, option.notes].filter((value): value is string => Boolean(value?.trim())).join(" · ");
}

export type SourcePickOption =
  | LineItemSourceOption
  | { sourceType: "CUSTOM"; kategori: string };

const CUSTOM_TYPE_OPTIONS: { value: string; label: string; description: string }[] = [
  { value: "MATERIAL", label: "Material", description: "Bahan & material fisik" },
  { value: "UPAH", label: "Labor", description: "Labor cost" },
  { value: "MATERIAL_UPAH", label: "Material + Labor", description: "Combined material and labor cost" },
];

const OTHER_COST_KATEGORI_OPTIONS: { value: string; label: string; description: string }[] = [
  { value: "ALAT", label: "Alat", description: "Sewa atau penggunaan alat" },
  { value: "BIAYA_UMUM", label: "Biaya Umum", description: "Overhead, izin, asuransi" },
  { value: "TRANSPORTASI_AKOMODASI", label: "Transportasi & Akomodasi", description: "Ongkir dan akomodasi" },
];

type PickerTab = "all" | "material" | "labor" | "material_labor" | "bq_library";

export function ImportDialog({
  target,
  onClose,
  onPick,
  description = "The selected price is copied as a snapshot. Later source changes do not rewrite this Cost Component. BQ works in Rupiah only, so Master Data prices in another currency are not listed.",
}: {
  target: { itemId?: string; subObjectId?: string };
  onClose: () => void;
  onPick: (option: SourcePickOption) => Promise<void>;
  /** The Assembly editor explains its own price rule (priced again when applied). */
  description?: string;
}) {
  const [tab, setTab] = useState<PickerTab>("all");
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<LineItemSourceOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [showOtherCosts, setShowOtherCosts] = useState(false);
  /** One SKU can carry a price per supplier; the estimator may narrow the list to one supplier. */
  const [supplier, setSupplier] = useState("");
  const [loading, startTransition] = useTransition();
  const request = useRef(0);
  const typing = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (typing.current) clearTimeout(typing.current); }, []);

  // Asks the server 250 ms after the last keystroke, not on every key; an older answer never replaces a newer one.
  const search = (nextQuery: string) => {
    setQuery(nextQuery);
    const requestId = ++request.current;
    if (typing.current) clearTimeout(typing.current);
    typing.current = setTimeout(() => runSearch(nextQuery, requestId), 250);
  };

  const runSearch = (nextQuery: string, requestId: number) => {
    startTransition(async () => {
      const result = await listLineItemSourcesAction(nextQuery);
      if (requestId !== request.current) return;
      if (result.ok === false) {
        setError(result.error.safeMessage);
        return;
      }
      setError(null);
      setOptions(result.data);
    });
  };

  // A source lookup begins after the dialog has rendered. Starting a transition
  // during render is forbidden by React and crashes when the dialog opens.
  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      const result = await listLineItemSourcesAction("");
      if (cancelled) return;
      if (result.ok === false) {
        setError(result.error.safeMessage);
        return;
      }
      setOptions(result.data);
    });
    return () => { cancelled = true; };
  }, [startTransition]);

  const tabOptions =
    tab === "material" ? options.filter((o) => o.sourceKind === "material")
    : tab === "labor" ? options.filter((o) => o.sourceKind === "labor")
    : tab === "material_labor" ? options.filter((o) => o.sourceKind === "material-labor")
    : tab === "bq_library" ? options.filter((o) => o.sourceType === "BQ_LIBRARY")
    : options;
  const suppliers = [...new Set(tabOptions.map((o) => o.supplier).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b));
  const visibleOptions = supplier ? tabOptions.filter((o) => o.supplier === supplier) : tabOptions;

  const tabItems: { key: PickerTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "material", label: "Material" },
    { key: "labor", label: "Labor" },
    { key: "material_labor", label: "Material + Labor" },
    { key: "bq_library", label: "BQ Library" },
  ];

  return (
    <Dialog
      open
      onOpenChange={(next) => { if (!next) onClose(); }}
      title="Add Cost Component"
      description={description}
      size="lg"
    >
      <div className="grid gap-3">
        {/* Tab bar */}
        <div role="tablist" className="flex gap-1 border-b border-line-subtle pb-0.5">
          {tabItems.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              type="button"
              className={[
                "rounded-t px-3 py-1.5 text-sm font-medium transition-colors",
                tab === t.key
                  ? "border-b-2 border-action text-ink"
                  : "text-ink-secondary hover:text-ink",
              ].join(" ")}
              onClick={() => { setTab(t.key); setShowCustom(false); setShowOtherCosts(false); }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <Button type="button" variant="secondary" onClick={() => { setShowCustom((value) => !value); setShowOtherCosts(false); }}>+ Custom Cost Component</Button>
        {showCustom ? (
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CUSTOM_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className="grid gap-0.5 rounded-action border border-line px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-surface-muted"
                  onClick={() => void onPick({ sourceType: "CUSTOM", kategori: opt.value })}
                >
                  <span className="font-medium text-ink">{opt.label}</span>
                  <span className="text-xs text-ink-tertiary">{opt.description}</span>
                </button>
              ))}
              <button
                type="button"
                className="grid gap-0.5 rounded-action border border-line px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-surface-muted"
                aria-expanded={showOtherCosts}
                onClick={() => setShowOtherCosts((value) => !value)}
              >
                <span className="font-medium text-ink">Other Cost</span>
                <span className="text-xs text-ink-tertiary">General, transport, or equipment</span>
              </button>
            </div>
            {showOtherCosts ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {OTHER_COST_KATEGORI_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className="grid gap-0.5 rounded-action border border-line px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-surface-muted"
                    onClick={() => void onPick({ sourceType: "CUSTOM", kategori: opt.value })}
                  >
                    <span className="font-medium text-ink">{opt.label}</span>
                    <span className="text-xs text-ink-tertiary">{opt.description}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[220px] flex-1"><SearchField value={query} label="Search sources" onChange={(event) => search(event.target.value)} onClear={() => search("")} /></div>
              {suppliers.length > 1 || supplier ? (
                <Select aria-label="Supplier" value={supplier} onChange={(event) => setSupplier(event.target.value)} className="w-auto min-w-[180px]">
                  <option value="">Semua supplier</option>
                  {suppliers.map((name) => <option key={name} value={name}>{name}</option>)}
                  {supplier && !suppliers.includes(supplier) ? <option value={supplier}>{supplier}</option> : null}
                </Select>
              ) : null}
            </div>
            {error ? <InlineError>{error}</InlineError> : null}
            {visibleOptions.length === 0 && !loading ? (
              <EmptyState title="No matching sources" description="No Master Data price or BQ Library item matches this search." />
            ) : (
              <ul className="grid max-h-[340px] gap-1 overflow-auto">
                {visibleOptions.map((option) => (
                  <li key={`${option.sourceType}-${option.id}`}>
                    <button
                      type="button"
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-action border border-transparent px-2.5 py-2 text-left hover:border-line hover:bg-surface-muted"
                      disabled={loading}
                      onClick={() => void onPick(option)}
                    >
                      <span className="grid min-w-0 gap-0.5">
                        <span className="truncate font-medium text-ink">{option.title}</span>
                        {option.supplier ? <span className="truncate text-xs text-ink-secondary">{option.supplier}</span> : null}
                        {sourceDescription(option) ? <span className="truncate text-xs text-ink-tertiary">{sourceDescription(option)}</span> : null}
                      </span>
                      <span className="shrink-0 text-right tabular-nums text-ink">
                        {formatMoney(createMoney(option.amount, option.currency))}
                        <span className="block text-xs text-ink-tertiary">per {option.unit}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
