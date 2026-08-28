"use client";

import { useMemo, useState } from "react";

import { Field, Select, Text } from "@/platform/ui_engine";

type BrandOption = { id: string; name: string; categoryIds: readonly string[] };
type CategoryOption = { id: string; name: string };

export function SkuClassificationFields({
  brands, categories, defaultBrandId = "", defaultCategoryId = "",
}: {
  brands: readonly BrandOption[];
  categories: readonly CategoryOption[];
  defaultBrandId?: string;
  defaultCategoryId?: string;
}) {
  const [brandId, setBrandId] = useState(defaultBrandId);
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const brand = brands.find((candidate) => candidate.id === brandId);
  const preferredIds = useMemo(() => new Set(brand?.categoryIds ?? []), [brand]);
  const preferred = categories.filter(({ id }) => preferredIds.has(id));
  const other = categories.filter(({ id }) => !preferredIds.has(id));
  const outsideBrandCatalog = Boolean(brand && categoryId && !preferredIds.has(categoryId));

  return (
    <>
      <Field label="Brand (optional)">
        <Select name="brandId" value={brandId} onChange={(event) => setBrandId(event.target.value)}>
          <option value="">— none —</option>
          {brands.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </Select>
      </Field>
      <Field
        label="SKU Category (optional while Draft)"
        description="Classifies this exact product for BQ and becomes mandatory before activation. It never changes the Brand's catalog categories."
      >
        <Select name="categoryId" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          <option value="">— none —</option>
          {brand && preferred.length ? <optgroup label={`${brand.name} catalog categories`}>{preferred.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</optgroup> : null}
          <optgroup label={brand ? "Other product categories" : "Product categories"}>{other.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</optgroup>
        </Select>
      </Field>
      {outsideBrandCatalog ? <Text as="span" size="sm" className="text-warning">This SKU category is outside the Brand catalog. Saving is allowed and explicit; review the Brand separately if its discovery classification is incomplete.</Text> : null}
    </>
  );
}
