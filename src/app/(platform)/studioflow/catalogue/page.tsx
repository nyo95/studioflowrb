import Link from "next/link";
import { redirect } from "next/navigation";
import { Layers, Plus } from "lucide-react";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { buttonClasses, Button, Checkbox, DirectoryShell, EmptyState, PageHeader, SearchField, SectionCard } from "@/platform/ui_engine";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";
import { studioFlowService } from "@/apps/studioflow/runtime";
import { CatalogueTable } from "./catalogue-table";

export const dynamic = "force-dynamic";

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value ?? "").trim();
}

export default async function StudioFlowCataloguePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;
  const canRead = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
  const canManage = hasPermission(grants, STUDIOFLOW_PERMISSIONS.scheduleManage);

  if (!canRead) {
    return (
      <>
        <PageHeader eyebrow="StudioFlow" title="Product Catalogue" divider />
        <SectionCard>
          <EmptyState icon={Layers} title="Access denied" description="You do not have permission to view the Product Catalogue." />
        </SectionCard>
      </>
    );
  }

  const params = await searchParams;
  const query = firstParam(params.q);
  const includeArchived = firstParam(params.archived) === "1";
  const products = await studioFlowService.listCatalogueProducts(grants, {
    search: query || undefined,
    includeArchived,
  });
  return (
    <>
      <PageHeader
        eyebrow="StudioFlow · Global"
        title="Product Catalogue"
        description="StudioFlow-owned specifications reused across projects. Brand names are frozen; later Master Data changes do not rewrite these rows."
        divider
        actions={
          canManage ? (
            <Link href="/studioflow/catalogue/new" className={buttonClasses("primary", "md")}>
              <Plus size={16} aria-hidden="true" /> New product
            </Link>
          ) : null
        }
      />
      <DirectoryShell
        surface
        fill
      >
        <form method="get" className="flex flex-wrap items-center gap-2 border-b border-line-subtle p-(--ui-section-px)">
          <SearchField name="q" defaultValue={query} placeholder="Brand, product, colour, or finishing" label="Search catalogue" />
          <Checkbox name="archived" value="1" defaultChecked={includeArchived} label="Include archived" />
          <Button type="submit" variant="secondary">Search</Button>
          {query || includeArchived ? (
            <Link href="/studioflow/catalogue" className={buttonClasses("ghost", "md")}>Reset</Link>
          ) : null}
        </form>
        {products.length === 0 ? (
          <EmptyState
            icon={Layers}
            title={query ? "No results" : "No catalogue products yet"}
            description={
              query
                ? `No specification matches “${query}”.`
                : "Add a reusable specification. Project schedule snapshots come later and will copy these rows."
            }
          />
        ) : (
          <CatalogueTable products={products} />
        )}
      </DirectoryShell>
    </>
  );
}
