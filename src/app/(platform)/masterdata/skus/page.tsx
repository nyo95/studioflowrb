import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { ErrorState, PageHeader, SectionCard } from "@/platform/ui_engine";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/service";
import { masterDataService } from "@/apps/masterdata/runtime";

import { SkuDirectory } from "./sku-directory";

export const dynamic = "force-dynamic";

export default async function SkusPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;
  const canRead = hasPermission(grants, MASTERDATA_PERMISSIONS.skuRead);
  const canManage = hasPermission(grants, MASTERDATA_PERMISSIONS.skuManage);

  if (!canRead && !canManage) {
    return (
      <div className="grid gap-4">
        <PageHeader eyebrow="Master Data" title="SKUs" />
        <SectionCard>
          <ErrorState title="Access denied" description="You do not have permission to view SKUs." />
        </SectionCard>
      </div>
    );
  }

  const [skus, refs] = await Promise.all([
    masterDataService.listSkus({ grants, includeArchived: true }),
    masterDataService.listSkuDirectoryRefs({ grants }),
  ]);

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Master Data"
        title="Material SKUs Catalog"
        description="Catalog items, article codes, brand classifications, base/purchase units, and supplier pricing."
      />
      <SkuDirectory
        skus={skus}
        brands={refs.brands}
        units={refs.units}
        productCategories={refs.productCategories}
        materialVendors={refs.materialVendors}
        canManage={canManage}
      />
    </div>
  );
}
