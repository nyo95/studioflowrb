import Link from "next/link";
import { skuService, pricingService, unitService, partyService } from "@/apps/masterdata/infrastructure/runtime";
import { requireMasterDataRequestContext } from "@/apps/masterdata/infrastructure/request-context";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  PageHeader,
  PageShell,
  TableBody,
  TableCell,
  TableCellContent,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  buttonClasses,
} from "@/platform/ui_engine";
import { clearSkuPriceAction, deleteWorkPriceAction, restoreWorkPriceAction } from "./actions";
import { SortableTableHead } from "../sortable-table-head";


export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; archived?: string; sort?: string; dir?: string }>;
}) {
  const { tab = "sku", archived, sort = "name", dir } = await searchParams;
  const showArchived = archived === "1";

  const [skus, workPrices, units, parties] = await Promise.all([
    skuService.list((await requireMasterDataRequestContext()), { includeDeleted: false }),
    pricingService.listWorkPrices((await requireMasterDataRequestContext()), showArchived),
    unitService.list((await requireMasterDataRequestContext())),
    partyService.list((await requireMasterDataRequestContext())),
  ]);

  // Fetch all current supplier prices per SKU concurrently.
  const skuPrices = await Promise.all(
    skus.map((sku) => pricingService.getSkuPrices((await requireMasterDataRequestContext()), sku.id).then((prices) => ({ skuId: sku.id, prices })))
  );
  const pricesBySkuId = new Map(skuPrices.map((sp) => [sp.skuId, sp.prices]));

  const unitsById = new Map(units.map((u) => [u.id, u]));
  const supplierNamesById = new Map(parties.map((p) => [p.id, p.name]));
  const direction = dir === "desc" ? -1 : 1;
  const sortedSkus = skus.toSorted((a, b) => direction * String(sort === "status" ? a.status : a.name).localeCompare(String(sort === "status" ? b.status : b.name), "id-ID", { numeric: true }));
  const sortedWorkPrices = workPrices.toSorted((a, b) => direction * String(sort === "kind" ? a.kind : sort === "price" ? a.amount : sort === "unit" ? unitsById.get(a.unitId)?.label ?? "" : a.code).localeCompare(String(sort === "kind" ? b.kind : sort === "price" ? b.amount : sort === "unit" ? unitsById.get(b.unitId)?.label ?? "" : b.code), "id-ID", { numeric: true }));

  return (
    <PageShell>
      <PageHeader
        title="Pricing"
        description="Current supplier prices per SKU and Work prices."
        actions={
          tab === "work" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/masterdata/pricing/work/new" className={buttonClasses("primary", "md")}>
                <span>New Work Price</span>
              </Link>
            </div>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Link
          href="/masterdata/pricing?tab=sku"
          className={buttonClasses(tab === "sku" ? "primary" : "secondary", "sm")}
        >
          <span>SKU Prices</span>
        </Link>
        <Link
          href="/masterdata/pricing?tab=work"
          className={buttonClasses(tab === "work" ? "primary" : "secondary", "sm")}
        >
          <span>Work Prices</span>
        </Link>
      </div>

      {tab === "sku" && (
        <DataTable state={sortedSkus.length === 0 ? <EmptyState title="No SKUs found." /> : null}>
          <TableHeader>
            <TableRow>
              <SortableTableHead column="name">SKU</SortableTableHead>
              <SortableTableHead column="status">Status</SortableTableHead>
              <TableHead>Supplier</TableHead>
              <TableHead align="end">Price</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedSkus.map((sku) => {
              const prices = pricesBySkuId.get(sku.id) ?? [];
              if (prices.length === 0) {
                return (
                  <TableRow key={sku.id}>
                    <TableCell>
                      <TableCellContent primary={sku.name} secondary={sku.code ?? sku.slug} />
                    </TableCell>
                    <TableCell>
                      <Badge tone={sku.status === "ACTIVE" ? "success" : sku.status === "DISCONTINUED" ? "warning" : "neutral"}>
                        {sku.status}
                      </Badge>
                    </TableCell>
                    <TableCell><Text tone="secondary">—</Text></TableCell>
                    <TableCell align="end"><Text tone="secondary">—</Text></TableCell>
                    <TableCell><Text tone="secondary">—</Text></TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/masterdata/pricing/sku/${sku.id}`}
                          className={buttonClasses("secondary", "sm")}
                        >
                          <span>Set Price</span>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }
              return prices.map((price) => {
                const unit = unitsById.get(price.unitId);
                return (
                  <TableRow key={price.id}>
                    <TableCell>
                      <TableCellContent primary={sku.name} secondary={sku.code ?? sku.slug} />
                    </TableCell>
                    <TableCell>
                      <Badge tone={sku.status === "ACTIVE" ? "success" : sku.status === "DISCONTINUED" ? "warning" : "neutral"}>
                        {sku.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {price.supplierPartyId ? (
                        <Text>{supplierNamesById.get(price.supplierPartyId) ?? price.supplierPartyId}</Text>
                      ) : (
                        <Text tone="secondary">No supplier</Text>
                      )}
                    </TableCell>
                    <TableCell align="end">
                      {price.currency} {price.amount}
                    </TableCell>
                    <TableCell>
                      <Text tone="secondary">
                        {unit ? `${unit.label} (${unit.code})` : price.unitId}
                      </Text>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/masterdata/pricing/sku/${sku.id}?supplier=${price.supplierPartyId ?? ""}`}
                          className={buttonClasses("secondary", "sm")}
                        >
                          <span>Update</span>
                        </Link>
                        <form action={clearSkuPriceAction.bind(null, sku.id, price.supplierPartyId)}>
                          <Button type="submit" variant="danger" size="sm">Clear</Button>
                        </form>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              });
            })}
          </TableBody>
        </DataTable>
      )}

      {tab === "work" && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Link
              href="/masterdata/pricing?tab=work"
              className={buttonClasses(showArchived ? "secondary" : "primary", "sm")}
            >
              <span>Active</span>
            </Link>
            <Link
              href="/masterdata/pricing?tab=work&archived=1"
              className={buttonClasses(showArchived ? "primary" : "secondary", "sm")}
            >
              <span>Archived</span>
            </Link>
          </div>

          <DataTable state={workPrices.length === 0 ? <EmptyState title="No work prices found." /> : null}>
            <TableHeader>
              <TableRow>
                <SortableTableHead column="name">Code / Name</SortableTableHead>
                <SortableTableHead column="kind">Kind</SortableTableHead>
                <SortableTableHead column="price" align="end">Price</SortableTableHead>
                <SortableTableHead column="unit">Unit</SortableTableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedWorkPrices.map((wp) => {
                const unit = unitsById.get(wp.unitId);
                return (
                  <TableRow key={wp.id}>
                    <TableCell>
                      <TableCellContent primary={wp.name} secondary={wp.code} />
                    </TableCell>
                    <TableCell>
                      <Badge>{wp.kind}</Badge>
                    </TableCell>
                    <TableCell align="end">
                      {wp.currency} {wp.amount}
                    </TableCell>
                    <TableCell>
                      <Text tone="secondary">
                        {unit ? `${unit.label} (${unit.code})` : wp.unitId}
                      </Text>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        {!wp.deletedAt && (
                          <Link
                            href={`/masterdata/pricing/work/${wp.id}/edit`}
                            className={buttonClasses("secondary", "sm")}
                          >
                            <span>Edit</span>
                          </Link>
                        )}
                        {!wp.deletedAt && (
                          <form action={deleteWorkPriceAction.bind(null, wp.id)}>
                            <Button type="submit" variant="danger" size="sm">Archive</Button>
                          </form>
                        )}
                        {wp.deletedAt && (
                          <form action={restoreWorkPriceAction.bind(null, wp.id)}>
                            <Button type="submit" variant="secondary" size="sm">Restore</Button>
                          </form>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </DataTable>
        </>
      )}
    </PageShell>
  );
}
