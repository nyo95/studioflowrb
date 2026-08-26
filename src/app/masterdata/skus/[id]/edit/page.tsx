import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { skuService, unitService, brandService, categoryService } from "@/apps/masterdata/infrastructure/runtime";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/application/masterdata-permissions";
import { SKU_KINDS } from "@/apps/masterdata/domain/sku-rules";
import { updateSkuAction } from "../../actions";

const CTX = {
  grants: [...MASTERDATA_PERMISSIONS] as string[],
  actor: { kind: "SYSTEM" as const, label: "Dev session" },
};

export default async function EditSkuPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [allSkus, units, brands, categories] = await Promise.all([
    skuService.list(CTX, { includeDeleted: true }),
    unitService.list(CTX),
    brandService.list(CTX),
    categoryService.list(CTX, { kind: "PRODUCT" }),
  ]);

  const sku = allSkus.find((s) => s.id === id);
  if (!sku) notFound();

  const liveUnits = units.filter((u) => !u.deletedAt);
  const liveBrands = brands.filter((b) => !b.deletedAt);
  const liveCategories = categories.filter((c) => !c.deletedAt);

  async function handleUpdate(formData: FormData) {
    "use server";
    await updateSkuAction(formData);
    redirect("/masterdata/skus");
  }

  return (
    <div className="ui-layout-page">
      <div className="ui-layout-page-header">
        <div>
          <h1 className="ui-heading" data-size="xl">Edit SKU</h1>
          <p className="ui-text" data-tone="secondary">{sku.name}</p>
        </div>
      </div>

      <form action={handleUpdate} className="ui-form">
        <input type="hidden" name="id" value={sku.id} />
        {/* kind is required for update */}
        <input type="hidden" name="kind" value={sku.kind} />

        <div className="ui-form-field">
          <label className="ui-label">Code</label>
          <p className="ui-text" data-tone="secondary">{sku.code ?? "—"}</p>
          <input type="hidden" name="code" value={sku.code ?? ""} />
          <span className="ui-text" data-tone="secondary" data-size="sm">Code is immutable after creation.</span>
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="name">Name *</label>
          <input id="name" name="name" type="text" className="ui-input" required defaultValue={sku.name} />
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="baseUnitId">Base Unit *</label>
          <select id="baseUnitId" name="baseUnitId" className="ui-select" required defaultValue={sku.baseUnitId}>
            <option value="">— select —</option>
            {liveUnits.map((u) => (
              <option key={u.id} value={u.id}>{u.label} ({u.code})</option>
            ))}
          </select>
          <span className="ui-text" data-tone="warning" data-size="sm">
            Changing the base unit while a canonical price exists may cause a conflict.
          </span>
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="brandId">Brand (optional)</label>
          <select id="brandId" name="brandId" className="ui-select" defaultValue={sku.brandId ?? ""}>
            <option value="">— none —</option>
            {liveBrands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="categoryId">Product Category (optional)</label>
          <select id="categoryId" name="categoryId" className="ui-select" defaultValue={sku.categoryId ?? ""}>
            <option value="">— none —</option>
            {liveCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <span className="ui-text" data-tone="secondary" data-size="sm">Required to activate this SKU.</span>
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="notes">Notes (optional)</label>
          <textarea id="notes" name="notes" className="ui-textarea" rows={3} defaultValue={sku.notes ?? ""} />
        </div>

        <div className="ui-toolbar">
          <button type="submit" className="ui-button" data-variant="primary" data-size="md">
            <span>Save Changes</span>
          </button>
          <Link href="/masterdata/skus" className="ui-button" data-variant="secondary" data-size="md">
            <span>Cancel</span>
          </Link>
        </div>
      </form>
    </div>
  );
}
