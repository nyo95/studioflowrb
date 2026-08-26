import Link from "next/link";
import { skuService } from "@/apps/masterdata/infrastructure/runtime";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/application/masterdata-permissions";
import { activateSkuAction, discontinueSkuAction, deleteSkuAction, restoreSkuAction } from "./actions";

const CTX = {
  grants: [...MASTERDATA_PERMISSIONS] as string[],
  actor: { kind: "SYSTEM" as const, label: "Dev session" },
};

export default async function SkusPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const { archived } = await searchParams;
  const showArchived = archived === "1";

  const skus = await skuService.list(CTX, { includeDeleted: showArchived });

  return (
    <div className="ui-layout-page">
      <div className="ui-layout-page-header">
        <div>
          <h1 className="ui-heading" data-size="xl">SKUs</h1>
          <p className="ui-text" data-tone="secondary">Materials, furniture, and fixtures with pricing.</p>
        </div>
        <div className="ui-toolbar">
          <Link href="/masterdata/skus/new" className="ui-button" data-variant="primary" data-size="md">
            <span>New SKU</span>
          </Link>
        </div>
      </div>

      <div className="ui-toolbar" style={{ marginBottom: "var(--space-3)" }}>
        <Link
          href="/masterdata/skus"
          className="ui-button"
          data-variant={showArchived ? "secondary" : "primary"}
          data-size="sm"
        >
          <span>Active</span>
        </Link>
        <Link
          href="/masterdata/skus?archived=1"
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
              <th>Name</th>
              <th>Code</th>
              <th>Kind</th>
              <th>Status</th>
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
            {skus.map((sku) => (
              <tr key={sku.id}>
                <td>
                  <div className="ui-table-cell-content">
                    <span className="ui-text" data-weight="medium">{sku.name}</span>
                    <span className="ui-text" data-tone="secondary" data-size="sm">{sku.slug}</span>
                  </div>
                </td>
                <td>
                  <span className="ui-text" data-tone="secondary">{sku.code ?? "—"}</span>
                </td>
                <td>
                  <span className="ui-badge">{sku.kind}</span>
                </td>
                <td>
                  <span
                    className="ui-badge"
                    data-tone={
                      sku.deletedAt
                        ? "neutral"
                        : sku.status === "ACTIVE"
                        ? "positive"
                        : sku.status === "DISCONTINUED"
                        ? "warning"
                        : "neutral"
                    }
                  >
                    {sku.deletedAt ? "Archived" : sku.status}
                  </span>
                </td>
                <td>
                  <div className="ui-toolbar" data-size="sm">
                    {!sku.deletedAt && (
                      <Link href={`/masterdata/skus/${sku.id}/edit`} className="ui-button" data-variant="secondary" data-size="sm">
                        <span>Edit</span>
                      </Link>
                    )}
                    {!sku.deletedAt && sku.status === "DRAFT" && (
                      <form action={activateSkuAction.bind(null, sku.id)}>
                        <button type="submit" className="ui-button" data-variant="secondary" data-size="sm">
                          <span>Activate</span>
                        </button>
                      </form>
                    )}
                    {!sku.deletedAt && sku.status === "ACTIVE" && (
                      <form action={discontinueSkuAction.bind(null, sku.id)}>
                        <button type="submit" className="ui-button" data-variant="secondary" data-size="sm">
                          <span>Discontinue</span>
                        </button>
                      </form>
                    )}
                    {!sku.deletedAt && sku.status === "DISCONTINUED" && (
                      <form action={activateSkuAction.bind(null, sku.id)}>
                        <button type="submit" className="ui-button" data-variant="secondary" data-size="sm">
                          <span>Reactivate</span>
                        </button>
                      </form>
                    )}
                    {!sku.deletedAt && (
                      <form action={deleteSkuAction.bind(null, sku.id)}>
                        <button type="submit" className="ui-button" data-variant="danger" data-size="sm">
                          <span>Archive</span>
                        </button>
                      </form>
                    )}
                    {sku.deletedAt && (
                      <form action={restoreSkuAction.bind(null, sku.id)}>
                        <button type="submit" className="ui-button" data-variant="secondary" data-size="sm">
                          <span>Restore</span>
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
