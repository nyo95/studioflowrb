"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { Button, Dialog, EmptyState, InlineError, SearchField } from "@/platform/ui_engine";
import { createMoney, formatMoney } from "@platform/utilities/money";
import { listLineItemSourcesAction, type LineItemSourceOption } from "./source-actions";

const KATEGORI_LABEL: Record<string, string> = {
  MATERIAL: "Material",
  UPAH: "Labor",
  MATERIAL_UPAH: "Material + Labor",
  BIAYA_UMUM: "Biaya Umum",
  TRANSPORTASI_AKOMODASI: "Transportasi",
  ALAT: "Alat",
};

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
}: {
  target: { itemId?: string; subObjectId?: string };
  onClose: () => void;
  onPick: (option: SourcePickOption) => Promise<void>;
}) {
  const [tab, setTab] = useState<PickerTab>("all");
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<LineItemSourceOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [showOtherCosts, setShowOtherCosts] = useState(false);
  const [loading, startTransition] = useTransition();
  const request = useRef(0);

  const search = (nextQuery: string) => {
    setQuery(nextQuery);
    const requestId = ++request.current;
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

  const visibleOptions =
    tab === "material" ? options.filter((o) => o.sourceKind === "material")
    : tab === "labor" ? options.filter((o) => o.sourceKind === "labor")
    : tab === "material_labor" ? options.filter((o) => o.sourceKind === "material-labor")
    : tab === "bq_library" ? options.filter((o) => o.sourceType === "BQ_LIBRARY")
    : options;

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
      description="The selected price is copied as a snapshot. Later source changes do not rewrite this Cost Component."
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
            <SearchField value={query} label="Search sources" onChange={(event) => search(event.target.value)} onClear={() => search("")} />
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
                        <span className="truncate text-xs text-ink-tertiary">
                          {option.detail} · {KATEGORI_LABEL[option.kategori] ?? option.kategori}
                        </span>
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
