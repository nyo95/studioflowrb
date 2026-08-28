import Link from "next/link";
import { skuService, pricingService, unitService, partyService } from "@/apps/masterdata/infrastructure/runtime";
import { MASTER_DATA_REQUEST_CONTEXT } from "@/apps/masterdata/infrastructure/request-context";
import { clearSkuPriceAction, deleteWorkPriceAction, restoreWorkPriceAction } from "./actions";
import { SortableTableHead } from "../sortable-table-head";

const CTX = MASTER_DATA_REQUEST_CONTEXT;

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; archived?: string; sort?: string; dir?: string }>;
}) {
  const { tab = "sku", archived, sort = "name", dir } = await searchParams;
  const showArchived = archived === "1";

  const [skus, workPrices, units, parties] = await Promise.all([
    skuService.list(CTX, { includeDeleted: false }),
    pricingService.listWorkPrices(CTX, showArchived),
    unitService.list(CTX),
    partyService.list(CTX),
  ]);

  // Fetch all current supplier prices per SKU concurrently.
  const skuPrices = await Promise.all(
    skus.map((sku) => pricingService.getSkuPrices(CTX, sku.id).then((prices) => ({ skuId: sku.id, prices })))
  );
  const pricesBySkuId = new Map(skuPrices.map((sp) => [sp.skuId, sp.prices]));

  const unitsById = new Map(units.map((u) => [u.id, u]));
  const supplierNamesById = new Map(parties.map((p) => [p.id, p.name]));
  const direction = dir === "desc" ? -1 : 1;
  const sortedSkus = skus.toSorted((a, b) => direction * String(sort === "status" ? a.status : a.name).localeCompare(String(sort === "status" ? b.status : b.name), "id-ID", { numeric: true }));
  const sortedWorkPrices = workPrices.toSorted((a, b) => direction * String(sort === "kind" ? a.kind : sort === "price" ? a.amount : sort === "unit" ? unitsById.get(a.unitId)?.label ?? "" : a.code).localeCompare(String(sort === "kind" ? b.kind : sort === "price" ? b.amount : sort === "unit" ? unitsById.get(b.unitId)?.label ?? "" : b.code), "id-ID", { numeric: true }));

  return (
    <div className="ui-layout-page">
      <div className="ui-layout-page-header">
        <div>
          <h1 className="ui-heading" data-size="xl">Pricing</h1>
          <p className="ui-text" data-tone="secondary">Current supplier prices per SKU and Work prices.</p>
        </div>
        {tab === "work" && (
          <div className="ui-toolbar">
            <Link href="/masterdata/pricing/work/new" className="ui-button" data-variant="primary" data-size="md">
              <span>New Work Price</span>
            </Link>
          </div>
        )}
      </div>

      <div className="ui-toolbar" style={{ marginBottom: "var(--space-3)" }}>
        <Link
          href="/masterdata/pricing?tab=sku"
          className="ui-button"
          data-variant={tab === "sku" ? "primary" : "secondary"}
          data-size="sm"
        >
          <span>SKU Prices</span>
        </Link>
        <Link
          href="/masterdata/pricing?tab=work"
          className="ui-button"
          data-variant={tab === "work" ? "primary" : "secondary"}
          data-size="sm"
        >
          <span>Work Prices</span>
        </Link>
      </div>

      {tab === "sku" && (
        <div className="ui-table-container">
          <table className="ui-table">
            <thead>
              <tr>
                <SortableTableHead column="name">SKU</SortableTableHead>
                <SortableTableHead column="status">Status</SortableTableHead>
                <th>Supplier</th>
                <th>Price</th>
                <th>Unit</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedSkus.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <span className="ui-text" data-tone="secondary">No SKUs found.</span>
                  </td>
                </tr>
              )}
              {sortedSkus.map((sku) => {
                const prices = pricesBySkuId.get(sku.id) ?? [];
                if (prices.length === 0) {
                  return (
                    <tr key={sku.id}>
                      <td>
                        <div className="ui-table-cell-content">
                          <span className="ui-text" data-weight="medium">{sku.name}</span>
                          <span className="ui-text" data-tone="secondary" data-size="sm">{sku.code ?? sku.slug}</span>
                        </div>
                      </td>
                      <td>
                        <span
                          className="ui-badge"
                          data-tone={sku.status === "ACTIVE" ? "positive" : sku.status === "DISCONTINUED" ? "warning" : "neutral"}
                        >
                          {sku.status}
                        </span>
                      </td>
                      <td><span className="ui-text" data-tone="secondary">—</span></td>
                      <td><span className="ui-text" data-tone="secondary">—</span></td>
                      <td><span className="ui-text" data-tone="secondary">—</span></td>
                      <td>
                        <div className="ui-toolbar" data-size="sm">
                          <Link
                            href={`/masterdata/pricing/sku/${sku.id}`}
                            className="ui-button"
                            data-variant="secondary"
                            data-size="sm"
                          >
                            <span>Set Price</span>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                }
                return prices.map((price) => {
                  const unit = unitsById.get(price.unitId);
                  return (
                    <tr key={price.id}>
                      <td>
                        <div className="ui-table-cell-content">
                          <span className="ui-text" data-weight="medium">{sku.name}</span>
                          <span className="ui-text" data-tone="secondary" data-size="sm">{sku.code ?? sku.slug}</span>
                        </div>
                      </td>
                      <td>
                        <span
                          className="ui-badge"
                          data-tone={sku.status === "ACTIVE" ? "positive" : sku.status === "DISCONTINUED" ? "warning" : "neutral"}
                        >
                          {sku.status}
                        </span>
                      </td>
                      <td>
                        {price.supplierPartyId ? (
                          <span className="ui-text">{supplierNamesById.get(price.supplierPartyId) ?? price.supplierPartyId}</span>
                        ) : (
                          <span className="ui-text" data-tone="secondary">No supplier</span>
                        )}
                      </td>
                      <td>
                        <span className="ui-text">
                          {price.currency} {price.amount}
                        </span>
                      </td>
                      <td>
                        <span className="ui-text" data-tone="secondary">
                          {unit ? `${unit.label} (${unit.code})` : price.unitId}
                        </span>
                      </td>
                      <td>
                        <div className="ui-toolbar" data-size="sm">
                          <Link
                            href={`/masterdata/pricing/sku/${sku.id}?supplier=${price.supplierPartyId ?? ""}`}
                            className="ui-button"
                            data-variant="secondary"
                            data-size="sm"
                          >
                            <span>Update</span>
                          </Link>
                          <form action={clearSkuPriceAction.bind(null, sku.id, price.supplierPartyId)}>
                            <button type="submit" className="ui-button" data-variant="danger" data-size="sm">
                              <span>Clear</span>
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "work" && (
        <>
          <div className="ui-toolbar" style={{ marginBottom: "var(--space-3)" }}>
            <Link
              href="/masterdata/pricing?tab=work"
              className="ui-button"
              data-variant={showArchived ? "secondary" : "primary"}
              data-size="sm"
            >
              <span>Active</span>
            </Link>
            <Link
              href="/masterdata/pricing?tab=work&archived=1"
              className="ui-button"
              data-variant={showArchived ? "primary" : "secondary"}
              data-size="sm"
            >
              <span>Archived</span>
            </Link>
          </div>

          <div className="ui-table-container">
            <table className="ui-table">
              <thead>
                <tr>
                  <SortableTableHead column="name">Code / Name</SortableTableHead>
                  <SortableTableHead column="kind">Kind</SortableTableHead>
                  <SortableTableHead column="price">Price</SortableTableHead>
                  <SortableTableHead column="unit">Unit</SortableTableHead>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {workPrices.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <span className="ui-text" data-tone="secondary">No work prices found.</span>
                    </td>
                  </tr>
                )}
                {sortedWorkPrices.map((wp) => {
                  const unit = unitsById.get(wp.unitId);
                  return (
                    <tr key={wp.id}>
                      <td>
                        <div className="ui-table-cell-content">
                          <span className="ui-text" data-weight="medium">{wp.name}</span>
                          <span className="ui-text" data-tone="secondary" data-size="sm">{wp.code}</span>
                        </div>
                      </td>
                      <td>
                        <span className="ui-badge">{wp.kind}</span>
                      </td>
                      <td>
                        <span className="ui-text">{wp.currency} {wp.amount}</span>
                      </td>
                      <td>
                        <span className="ui-text" data-tone="secondary">
                          {unit ? `${unit.label} (${unit.code})` : wp.unitId}
                        </span>
                      </td>
                      <td>
                        <div className="ui-toolbar" data-size="sm">
                          {!wp.deletedAt && (
                            <Link
                              href={`/masterdata/pricing/work/${wp.id}/edit`}
                              className="ui-button"
                              data-variant="secondary"
                              data-size="sm"
                            >
                              <span>Edit</span>
                            </Link>
                          )}
                          {!wp.deletedAt && (
                            <form action={deleteWorkPriceAction.bind(null, wp.id)}>
                              <button type="submit" className="ui-button" data-variant="danger" data-size="sm">
                                <span>Archive</span>
                              </button>
                            </form>
                          )}
                          {wp.deletedAt && (
                            <form action={restoreWorkPriceAction.bind(null, wp.id)}>
                              <button type="submit" className="ui-button" data-variant="secondary" data-size="sm">
                                <span>Restore</span>
                              </button>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
