"use client";

import { useMemo, useState } from "react";

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
      <div className="ui-form-field">
        <label className="ui-label" htmlFor="brandId">Brand (optional)</label>
        <select id="brandId" name="brandId" className="ui-select" value={brandId} onChange={(event) => setBrandId(event.target.value)}>
          <option value="">— none —</option>
          {brands.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
      </div>
      <div className="ui-form-field">
        <label className="ui-label" htmlFor="categoryId">SKU Category (optional while Draft)</label>
        <select id="categoryId" name="categoryId" className="ui-select" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          <option value="">— none —</option>
          {brand && preferred.length ? <optgroup label={`${brand.name} catalog categories`}>{preferred.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</optgroup> : null}
          <optgroup label={brand ? "Other product categories" : "Product categories"}>{other.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</optgroup>
        </select>
        <span className="ui-text" data-tone="secondary" data-size="sm">
          Classifies this exact product for BQ and becomes mandatory before activation. It never changes the Brand&apos;s catalog categories.
        </span>
        {outsideBrandCatalog ? <span className="ui-text" data-tone="warning" data-size="sm">This SKU category is outside the Brand catalog. Saving is allowed and explicit; review the Brand separately if its discovery classification is incomplete.</span> : null}
      </div>
    </>
  );
}
