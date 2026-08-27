import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { skuService, unitService, brandService, categoryService } from "@/apps/masterdata/infrastructure/runtime";
import { MASTER_DATA_REQUEST_CONTEXT } from "@/apps/masterdata/infrastructure/request-context";
import { SKU_KINDS } from "@/apps/masterdata/domain/sku-rules";
import { updateSkuAction } from "../../actions";
import { SkuClassificationFields } from "../../sku-classification-fields";

const CTX = MASTER_DATA_REQUEST_CONTEXT;

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

        <SkuClassificationFields brands={liveBrands.map((brand) => ({ id: brand.id, name: brand.name, categoryIds: brand.categories.map(({ categoryId }) => categoryId) }))} categories={liveCategories.map(({ id, name }) => ({ id, name }))} defaultBrandId={sku.brandId ?? ""} defaultCategoryId={sku.categoryId ?? ""} />

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
