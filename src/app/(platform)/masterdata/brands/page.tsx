import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { ErrorState, PageHeader, SectionCard } from "@/platform/ui_engine";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/service";
import { masterDataService } from "@/apps/masterdata/runtime";

import { BrandDirectory } from "./brand-directory";

export const dynamic = "force-dynamic";

export default async function BrandsPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  if (!hasPermission(grants, MASTERDATA_PERMISSIONS.brandRead)) {
    return (
      <div className="grid gap-4">
        <PageHeader eyebrow="Master Data" title="Brands" />
        <SectionCard>
          <ErrorState title="Access denied" description="You do not have permission to view brands." />
        </SectionCard>
      </div>
    );
  }

  const [brands, productCategories, materialVendors] = await Promise.all([
    masterDataService.listBrands({ grants, includeArchived: true }),
    masterDataService.listCategories({ grants, kind: "PRODUCT" }),
    masterDataService.listVendors({ grants }),
  ]);

  const canManage = hasPermission(grants, MASTERDATA_PERMISSIONS.brandManage);

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Master Data"
        title="Brands Catalog"
        description="Catalog brands, manufacturer profiles, discovery categories, and hashtags."
      />
      <BrandDirectory
        brands={brands}
        productCategories={productCategories.map((c) => ({ id: c.id, name: c.name }))}
        materialVendors={materialVendors.map((v) => ({ id: v.id, name: v.name }))}
        canManage={canManage}
      />
    </div>
  );
}
