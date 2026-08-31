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

  if (!hasPermission(grants, MASTERDATA_PERMISSIONS.skuRead)) {
    return (
      <div className="grid gap-4">
        <PageHeader eyebrow="Master Data" title="SKUs" />
        <SectionCard>
          <ErrorState title="Access denied" description="You do not have permission to view SKUs." />
        </SectionCard>
      </div>
    );
  }

  const [skus, brands, units, productCategories, materialVendors] = await Promise.all([
    masterDataService.listSkus({ grants, includeArchived: true }),
    masterDataService.listBrands({ grants }),
    masterDataService.listUnits({ grants }),
    masterDataService.listCategories({ grants, kind: "PRODUCT" }),
    masterDataService.listVendors({ grants, canSupplyMaterial: true }),
  ]);

  const canManage = hasPermission(grants, MASTERDATA_PERMISSIONS.skuManage);

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Master Data"
        title="Material SKUs Catalog"
        description="Catalog items, article codes, brand classifications, base/purchase units, and supplier pricing."
      />
      <SkuDirectory
        skus={skus}
        brands={brands.map((b) => ({ id: b.id, name: b.name }))}
        units={units.map((u) => ({ id: u.id, code: u.code, name: u.name }))}
        productCategories={productCategories.map((c) => ({ id: c.id, name: c.name }))}
        materialVendors={materialVendors.map((v) => ({ id: v.id, name: v.name }))}
        canManage={canManage}
      />
    </div>
  );
}
