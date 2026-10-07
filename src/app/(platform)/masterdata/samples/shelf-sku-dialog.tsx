"use client";

import { useState } from "react";

import { Button, CreatableSearch, DraftDialog, Field, FormActions, InlineError, Input, Select, Text } from "@/platform/ui_engine";

import { createShelfSkuAction } from "./actions";

export type ShelfSkuRefs = {
  categories: ReadonlyArray<{ id: string; name: string }>;
  units: ReadonlyArray<{ id: string; code: string; name: string }>;
  brands: ReadonlyArray<{ id: string; name: string }>;
};

export type CreatedShelfSku = { id: string; name: string | null; code: string | null; brandName: string | null };

function skuLabel(sku: CreatedShelfSku): string {
  return [sku.code, sku.name, sku.brandName ? `(${sku.brandName})` : null].filter(Boolean).join(" ") || "Unnamed SKU";
}

/**
 * The SKU picker of both shelf forms (Add sample, Put on shelf). With `refs`, typing a name nobody has offers
 * "New SKU", which opens `ShelfSkuDialog` and selects the SKU it creates; without them, it points to Pricing.
 */
export function ShelfSkuPicker({ skus, value, onChange, refs }: { skus: readonly CreatedShelfSku[]; value: string; onChange: (skuId: string) => void; refs: ShelfSkuRefs | null }) {
  const [created, setCreated] = useState<CreatedShelfSku[]>([]);
  const [draftName, setDraftName] = useState<string | null>(null);
  // Remounts the search after the dialog closes, so a typed-but-not-created name never sits in the trigger.
  const [round, setRound] = useState(0);
  const all = [...skus, ...created.filter((sku) => !skus.some((known) => known.id === sku.id))];
  return (
    <div className="grid gap-1">
      <CreatableSearch
        key={round}
        label="SKU"
        options={all.map((sku) => ({ id: sku.id, label: skuLabel(sku) }))}
        value={value}
        onValueChange={onChange}
        onCreate={refs ? (name) => { setDraftName(name); return value; } : undefined}
        createLabel={(name) => `New SKU “${name}” (no price yet)`}
        placeholder="Pick a SKU"
        searchPlaceholder="Search SKUs…"
        emptyLabel="No SKU matches this search."
        className="w-full"
      />
      <Text size="sm" tone="tertiary">{refs ? "Not in the list? Type its name to create it without a price." : "Not in the list? A SKU is created with its price on Pricing."}</Text>
      {refs && draftName !== null ? (
        <ShelfSkuDialog
          refs={refs}
          initialName={draftName}
          onCancel={() => { setDraftName(null); setRound((current) => current + 1); }}
          onCreated={(sku) => { setCreated((current) => [...current, sku]); setDraftName(null); setRound((current) => current + 1); onChange(sku.id); }}
        />
      ) : null}
    </div>
  );
}

/**
 * Quick "New SKU" for a sample that arrived before any price (owner, 2026-10-07: price-less SKUs only from
 * the sample shelf). Only what the catalogue needs to hold the SKU; dimensions and prices are added later on
 * the SKU and Pricing pages.
 */
export function ShelfSkuDialog({ refs, initialName, onCreated, onCancel }: { refs: ShelfSkuRefs; initialName: string; onCreated: (sku: CreatedShelfSku) => void; onCancel: () => void }) {
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState("");
  const [brandId, setBrandId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  // Most samples are counted in pieces; preselect it when the studio has that unit.
  const [baseUnitId, setBaseUnitId] = useState(() => refs.units.find((unit) => unit.code.toLowerCase() === "pcs")?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = Boolean((name.trim() || code.trim()) && categoryId && baseUnitId);

  const submit = async () => {
    setPending(true);
    setError(null);
    const result = await createShelfSkuAction({ name: name.trim() || undefined, code: code.trim() || undefined, brandId: brandId || undefined, categoryId, baseUnitId });
    setPending(false);
    if (!result.ok) { setError(result.error.safeMessage); return; }
    onCreated({ id: result.data.skuId, name: name.trim() || null, code: code.trim() || null, brandName: refs.brands.find((brand) => brand.id === brandId)?.name ?? null });
  };

  return (
    <DraftDialog open onOpenChange={(open) => { if (!open) onCancel(); }} title="New SKU for this sample" description="Created without a price. Add the price on Pricing once a supplier quotes it." pending={pending} watchedValue={JSON.stringify({ name, code, brandId, categoryId, baseUnitId })}>
      <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); if (valid) void submit(); }}>
        {error ? <InlineError>{error}</InlineError> : null}
        <div className="grid grid-cols-[1fr_9rem] gap-3">
          <Field label="Name"><Input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={128} placeholder="e.g. Granitio Ivory" /></Field>
          <Field label="Code"><Input value={code} onChange={(event) => setCode(event.target.value)} maxLength={32} placeholder="e.g. GR-1" /></Field>
        </div>
        <Text size="sm" tone="tertiary">A name or a code is enough.</Text>
        <Field label="Brand" description="Optional.">
          <CreatableSearch label="Brand" options={refs.brands.map((brand) => ({ id: brand.id, label: brand.name }))} value={brandId} onValueChange={setBrandId} placeholder="No brand" searchPlaceholder="Search brands…" emptyLabel="No brand matches." allowClear clearLabel="No brand" className="w-full" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Product category" required>
            <CreatableSearch label="Product category" options={refs.categories.map((category) => ({ id: category.id, label: category.name }))} value={categoryId} onValueChange={setCategoryId} placeholder="Pick a category" searchPlaceholder="Search categories…" emptyLabel="No category matches." className="w-full" />
          </Field>
          <Field label="Unit" required>
            <Select value={baseUnitId} onChange={(event) => setBaseUnitId(event.target.value)}>
              <option value="">Pick a unit</option>
              {refs.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>)}
            </Select>
          </Field>
        </div>
        <FormActions>
          <Button type="button" variant="ghost" data-dialog-cancel disabled={pending}>Cancel</Button>
          <Button type="submit" variant="primary" pending={pending} disabled={!valid}>Create SKU</Button>
        </FormActions>
      </form>
    </DraftDialog>
  );
}
