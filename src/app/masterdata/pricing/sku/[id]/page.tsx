import Link from "next/link";
import { notFound } from "next/navigation";
import { skuService, pricingService, unitService, partyService } from "@/apps/masterdata/infrastructure/runtime";
import { requireMasterDataRequestContext } from "@/apps/masterdata/infrastructure/request-context";
import { setSkuPriceAction } from "../../actions";


export default async function SetSkuPricePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ supplier?: string }>;
}) {
  const { id } = await params;
  const { supplier: supplierParam } = await searchParams;
  const selectedSupplierId = supplierParam ? supplierParam : null;

  const [allSkus, units, parties] = await Promise.all([
    skuService.list((await requireMasterDataRequestContext()), { includeDeleted: false }),
    unitService.list((await requireMasterDataRequestContext())),
    partyService.list((await requireMasterDataRequestContext())),
  ]);

  const sku = allSkus.find((s) => s.id === id);
  if (!sku) notFound();

  const [currentPrices, allParties] = await Promise.all([
    pricingService.getSkuPrices((await requireMasterDataRequestContext()), id),
    partyService.list((await requireMasterDataRequestContext())),
  ]);
  const supplierNamesById = new Map(allParties.map((p) => [p.id, p.name]));
  const existingPrice = currentPrices.find((p) => p.supplierPartyId === selectedSupplierId) ?? null;

  // Price unit must match sku's purchaseUnitId or baseUnitId
  const priceUnitId = sku.purchaseUnitId ?? sku.baseUnitId;
  const priceUnit = units.find((u) => u.id === priceUnitId);

  const suppliers = parties.filter(
    (p) => !p.deletedAt && p.roles.includes("MATERIAL_SUPPLIER")
  );

  return (
    <div className="ui-layout-page">
      <div className="ui-layout-page-header">
        <div>
          <h1 className="ui-heading" data-size="xl">{existingPrice ? "Update" : "Set"} SKU Price</h1>
          <p className="ui-text" data-tone="secondary">{sku.name}</p>
        </div>
      </div>

      {currentPrices.length > 0 && (
        <div className="ui-notice" data-tone="info" style={{ marginBottom: "var(--space-4)" }}>
          <p className="ui-text" data-weight="medium">Current prices for this SKU</p>
          {currentPrices.map((price) => (
            <p key={price.id} className="ui-text" data-tone="secondary">
              {price.supplierPartyId
                ? supplierNamesById.get(price.supplierPartyId) ?? price.supplierPartyId
                : "No supplier"}
              : <strong>{price.currency} {price.amount}</strong> per {priceUnit?.label ?? priceUnitId}
              {!(price.supplierPartyId === selectedSupplierId) && (
                <>
                  {" · "}
                  <Link href={`/masterdata/pricing/sku/${sku.id}?supplier=${price.supplierPartyId ?? ""}`}>Update</Link>
                </>
              )}
            </p>
          ))}
          <p className="ui-text" data-tone="secondary" data-size="sm">
            Each supplier holds its own current price. Saving with the same supplier updates that pair in place.
          </p>
        </div>
      )}

      <form action={setSkuPriceAction} className="ui-form">
        <input type="hidden" name="skuId" value={sku.id} />
        <input type="hidden" name="unitId" value={priceUnitId} />

        <div className="ui-form-field">
          <label className="ui-label">Unit</label>
          <p className="ui-text" data-tone="secondary">
            {priceUnit ? `${priceUnit.label} (${priceUnit.code})` : priceUnitId}
          </p>
          <span className="ui-text" data-size="sm" data-tone="secondary">
            Price unit is derived from the SKU&apos;s purchase or base unit. Change SKU units to change this.
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
          <select id="supplierPartyId" name="supplierPartyId" className="ui-select" defaultValue={selectedSupplierId ?? ""}>
            <option value="">— none —</option>
            {suppliers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <span className="ui-text" data-size="sm" data-tone="secondary">
            One current price is kept per supplier. Choosing a different supplier adds a separate price.
          </span>
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
