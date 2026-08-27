import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { skuService, pricingService, unitService, partyService } from "@/apps/masterdata/infrastructure/runtime";
import { MASTER_DATA_REQUEST_CONTEXT } from "@/apps/masterdata/infrastructure/request-context";
import { setSkuPriceAction } from "../../actions";

const CTX = MASTER_DATA_REQUEST_CONTEXT;

export default async function SetSkuPricePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [allSkus, units, parties] = await Promise.all([
    skuService.list(CTX, { includeDeleted: false }),
    unitService.list(CTX),
    partyService.list(CTX),
  ]);

  const sku = allSkus.find((s) => s.id === id);
  if (!sku) notFound();

  const existingPrice = await pricingService.getSkuPrice(CTX, id);

  // Price unit must match sku's purchaseUnitId or baseUnitId
  const priceUnitId = sku.purchaseUnitId ?? sku.baseUnitId;
  const priceUnit = units.find((u) => u.id === priceUnitId);

  const suppliers = parties.filter(
    (p) => !p.deletedAt && p.roles.includes("MATERIAL_SUPPLIER")
  );

  async function handleSet(formData: FormData) {
    "use server";
    await setSkuPriceAction(formData);
    redirect("/masterdata/pricing?tab=sku");
  }

  return (
    <div className="ui-layout-page">
      <div className="ui-layout-page-header">
        <div>
          <h1 className="ui-heading" data-size="xl">{existingPrice ? "Update" : "Set"} SKU Price</h1>
          <p className="ui-text" data-tone="secondary">{sku.name}</p>
        </div>
      </div>

      {existingPrice && (
        <div className="ui-notice" data-tone="info" style={{ marginBottom: "var(--space-4)" }}>
          <p className="ui-text">
            Current price: <strong>{existingPrice.currency} {existingPrice.amount}</strong> per {priceUnit?.label ?? priceUnitId}
          </p>
        </div>
      )}

      <form action={handleSet} className="ui-form">
        <input type="hidden" name="skuId" value={sku.id} />
        <input type="hidden" name="unitId" value={priceUnitId} />

        <div className="ui-form-field">
          <label className="ui-label">Unit</label>
          <p className="ui-text" data-tone="secondary">
            {priceUnit ? `${priceUnit.label} (${priceUnit.code})` : priceUnitId}
          </p>
          <span className="ui-text" data-size="sm" data-tone="secondary">
            Price unit is derived from the SKU's purchase or base unit. Change SKU units to change this.
          </span>
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="currency">Currency *</label>
          <input
            id="currency"
            name="currency"
            type="text"
            className="ui-input"
            required
            defaultValue={existingPrice?.currency ?? "IDR"}
            placeholder="IDR"
            style={{ maxWidth: "8rem" }}
          />
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="amount">Amount *</label>
          <input
            id="amount"
            name="amount"
            type="text"
            className="ui-input"
            required
            defaultValue={existingPrice?.amount ?? ""}
            placeholder="0.00"
            style={{ maxWidth: "14rem" }}
          />
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="supplierPartyId">Supplier (optional)</label>
          <select id="supplierPartyId" name="supplierPartyId" className="ui-select" defaultValue={existingPrice?.supplierPartyId ?? ""}>
            <option value="">— none —</option>
            {suppliers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="ui-form-field">
          <label className="ui-label" htmlFor="notes">Notes (optional)</label>
          <textarea id="notes" name="notes" className="ui-textarea" rows={2} defaultValue={existingPrice?.notes ?? ""} />
        </div>

        <div className="ui-toolbar">
          <button type="submit" className="ui-button" data-variant="primary" data-size="md">
            <span>{existingPrice ? "Update Price" : "Set Price"}</span>
          </button>
          <Link href="/masterdata/pricing?tab=sku" className="ui-button" data-variant="secondary" data-size="md">
            <span>Cancel</span>
          </Link>
        </div>
      </form>
    </div>
  );
}
