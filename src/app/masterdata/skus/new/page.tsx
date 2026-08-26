import Link from "next/link";
import { redirect } from "next/navigation";
import { unitService } from "@/apps/masterdata/infrastructure/runtime";
import { brandService } from "@/apps/masterdata/infrastructure/runtime";
import { categoryService } from "@/apps/masterdata/infrastructure/runtime";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/application/masterdata-permissions";
import { SKU_KINDS } from "@/apps/masterdata/domain/sku-rules";
import { createSkuAction } from "../actions";

const CTX = {
  grants: [...MASTERDATA_PERMISSIONS] as string[],
  actor: { kind: "SYSTEM" as const, label: "Dev session" },
};

export default async function NewSkuPage() {
  const [units, brands, categories] = await Promise.all([
    unitService.list(CTX),
    brandService.list(CTX),
    categoryService.list(CTX, { kind: "PRODUCT" }),
  ]);

  const liveUnits = units.filter((u) => !u.deletedAt);
  const liveBrands = brands.filter((b) => !b.deletedAt);
  const liveCategories = categories.filter((c) => !c.deletedAt);

  async function handleCreate(formData: FormData) {
    "use server";
    await createSkuAction(formData);
    redirect("/masterdata/skus");
  }

  return (
    <div className="ui-layout-page">
      <div className="ui-layout-page-header">
        <div>
          <h1 className="ui-heading" data-size="xl">New SKU</h1>
          <p className="ui-text" data-tone="secondary">Add a new material, furniture, or fixture.</p>
        </div>
      </div>

      <form action={handleCreate} className="ui-form">
        <div className="ui-form-field">
          <label className="ui-label" htmlFor="name">Name *</label>
          <input id="name" name="name" type="text" className="ui-input" required autoFocus />
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="code">Code (optional)</label>
          <input id="code" name="code" type="text" className="ui-input" />
          <span className="ui-text" data-tone="secondary" data-size="sm">Internal reference code. Immutable after creation.</span>
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="kind">Kind *</label>
          <select id="kind" name="kind" className="ui-select" required>
            {SKU_KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="baseUnitId">Base Unit *</label>
          {liveUnits.length === 0 ? (
            <p className="ui-text" data-tone="warning">No units available. Create units first.</p>
          ) : (
            <select id="baseUnitId" name="baseUnitId" className="ui-select" required>
              <option value="">— select —</option>
              {liveUnits.map((u) => (
                <option key={u.id} value={u.id}>{u.label} ({u.code})</option>
              ))}
            </select>
          )}
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="brandId">Brand (optional)</label>
          <select id="brandId" name="brandId" className="ui-select">
            <option value="">— none —</option>
            {liveBrands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="categoryId">Product Category (optional)</label>
          <select id="categoryId" name="categoryId" className="ui-select">
            <option value="">— none —</option>
            {liveCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <span className="ui-text" data-tone="secondary" data-size="sm">Required to activate this SKU.</span>
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="notes">Notes (optional)</label>
          <textarea id="notes" name="notes" className="ui-textarea" rows={3} />
        </div>

        <div className="ui-toolbar">
          <button type="submit" className="ui-button" data-variant="primary" data-size="md">
            <span>Create SKU</span>
          </button>
          <Link href="/masterdata/skus" className="ui-button" data-variant="secondary" data-size="md">
            <span>Cancel</span>
          </Link>
        </div>
      </form>
    </div>
  );
}
