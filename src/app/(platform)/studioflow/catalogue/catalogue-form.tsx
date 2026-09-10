"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { Button, Combobox, Field, FormActions, InlineError, Input, Textarea, useFormDraftGuard } from "@/platform/ui_engine";
import type { ActionResult } from "@platform/core/actions";
import { createCatalogueAction, editCatalogueAction } from "./actions";

export type CatalogueBrandOption = { id: string; name: string };

export type CatalogueFormValues = {
  id?: string;
  brand_md_id: string | null;
  brand_name: string | null;
  product_name: string;
  colour: string | null;
  finishing: string | null;
  dimension_text: string | null;
  unit: string | null;
  notes: string | null;
};

export function CatalogueForm({
  brands,
  values,
  disabled = false,
}: {
  brands: CatalogueBrandOption[];
  values?: CatalogueFormValues;
  disabled?: boolean;
}) {
  const isEdit = Boolean(values?.id);
  const [state, formAction, pending] = useActionState(
    isEdit ? editCatalogueAction : createCatalogueAction,
    null as ActionResult<void> | null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [brandId, setBrandId] = useState(values?.brand_md_id ?? "");
  const selected = brands.find((brand) => brand.id === brandId);
  const failure = state && !state.ok ? state.error.safeMessage : null;
  const guard = useFormDraftGuard({ formRef, resetKey: values?.id ?? "new", watchedValue: brandId, active: !disabled, guardNavigation: true });
  const { markSaved } = guard;
  useEffect(() => { if (state?.ok) markSaved(); }, [state, markSaved]);

  return (
    <form ref={formRef} action={formAction} onChange={guard.onFormChange} className="grid gap-4 max-w-lg">
      {failure ? <InlineError>{failure}</InlineError> : null}
      {values?.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <input type="hidden" name="brand_md_id" value={brandId} />
      {selected ? <input type="hidden" name="brand_name" value={selected.name} /> : null}
      <Field label="Brand">
        <Combobox
          label="Brand"
          options={[{ id: "", label: "No catalogued brand" }, ...brands.map((brand) => ({ id: brand.id, label: brand.name }))]}
          value={brandId}
          onValueChange={setBrandId}
          placeholder="No catalogued brand"
          searchPlaceholder="Search brands…"
          emptyLabel="No matching brand"
          disabled={disabled || pending}
        />
      </Field>
      {brandId ? null : (
        <Field label="Brand name">
          <Input
            name="brand_name"
            maxLength={200}
            defaultValue={values?.brand_name ?? ""}
            disabled={disabled || pending}
            placeholder="Type a brand name when it is not in Master Data"
          />
        </Field>
      )}
      <Field label="Product name" required>
        <Input name="product_name" required maxLength={200} defaultValue={values?.product_name ?? ""} disabled={disabled || pending} autoFocus />
      </Field>
      <Field label="Colour">
        <Input name="colour" maxLength={100} defaultValue={values?.colour ?? ""} disabled={disabled || pending} />
      </Field>
      <Field label="Finishing">
        <Input name="finishing" maxLength={100} defaultValue={values?.finishing ?? ""} disabled={disabled || pending} />
      </Field>
      <Field label="Dimension">
        <Input name="dimension_text" maxLength={200} defaultValue={values?.dimension_text ?? ""} disabled={disabled || pending} />
      </Field>
      <Field label="Unit">
        <Input name="unit" maxLength={50} defaultValue={values?.unit ?? ""} disabled={disabled || pending} />
      </Field>
      <Field label="Notes">
        <Textarea name="notes" maxLength={2000} rows={3} defaultValue={values?.notes ?? ""} disabled={disabled || pending} />
      </Field>
      <FormActions>
        <Link href="/studioflow/catalogue" className="text-sm text-action hover:underline">Cancel</Link>
        {disabled ? null : (
          <Button type="submit" variant="primary" pending={pending}>
            {isEdit ? "Save changes" : "Save product"}
          </Button>
        )}
      </FormActions>
      {guard.confirmDialog}
    </form>
  );
}
