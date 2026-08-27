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

  const [skus, workPrices, units] = await Promise.all([
    skuService.list(CTX, { includeDeleted: false }),
    pricingService.listWorkPrices(CTX, showArchived),
    unitService.list(CTX),
  ]);

  // Fetch SKU prices concurrently
  const skuPrices = await Promise.all(
    skus.map((sku) => pricingService.getSkuPrice(CTX, sku.id).then((p) => ({ skuId: sku.id, price: p })))
  );
  const priceBySkuId = new Map(skuPrices.map((sp) => [sp.skuId, sp.price]));

  const unitsById = new Map(units.map((u) => [u.id, u]));
  const direction = dir === "desc" ? -1 : 1;
  const sortedSkus = skus.toSorted((a, b) => { const ap = priceBySkuId.get(a.id); const bp = priceBySkuId.get(b.id); return direction * String(sort === "status" ? a.status : sort === "price" ? ap?.amount ?? "" : sort === "unit" ? unitsById.get(ap?.unitId ?? "")?.label ?? "" : a.name).localeCompare(String(sort === "status" ? b.status : sort === "price" ? bp?.amount ?? "" : sort === "unit" ? unitsById.get(bp?.unitId ?? "")?.label ?? "" : b.name), "id-ID", { numeric: true }); });
  const sortedWorkPrices = workPrices.toSorted((a, b) => direction * String(sort === "kind" ? a.kind : sort === "price" ? a.amount : sort === "unit" ? unitsById.get(a.unitId)?.label ?? "" : a.code).localeCompare(String(sort === "kind" ? b.kind : sort === "price" ? b.amount : sort === "unit" ? unitsById.get(b.unitId)?.label ?? "" : b.code), "id-ID", { numeric: true }));

  return (
    <div className="ui-layout-page">
      <div className="ui-layout-page-header">
        <div>
          <h1 className="ui-heading" data-size="xl">Pricing</h1>
          <p className="ui-text" data-tone="secondary">Canonical SKU prices and Work prices.</p>
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
                <SortableTableHead column="price">Price</SortableTableHead>
                <SortableTableHead column="unit">Unit</SortableTableHead>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {skus.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <span className="ui-text" data-tone="secondary">No SKUs found.</span>
                  </td>
                </tr>
              )}
              {sortedSkus.map((sku) => {
                const price = priceBySkuId.get(sku.id);
                const unit = price ? unitsById.get(price.unitId) : null;
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
                    <td>
                      {price ? (
                        <span className="ui-text">
                          {price.currency} {price.amount}
                        </span>
                      ) : (
                        <span className="ui-text" data-tone="secondary">—</span>
                      )}
                    </td>
                    <td>
                      <span className="ui-text" data-tone="secondary">
                        {unit ? `${unit.label} (${unit.code})` : price ? price.unitId : "—"}
                      </span>
                    </td>
                    <td>
                      <div className="ui-toolbar" data-size="sm">
                        <Link
                          href={`/masterdata/pricing/sku/${sku.id}`}
                          className="ui-button"
                          data-variant="secondary"
                          data-size="sm"
                        >
                          <span>{price ? "Update" : "Set Price"}</span>
                        </Link>
                        {price && (
                          <form action={clearSkuPriceAction.bind(null, sku.id)}>
                            <button type="submit" className="ui-button" data-variant="danger" data-size="sm">
                              <span>Clear</span>
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
