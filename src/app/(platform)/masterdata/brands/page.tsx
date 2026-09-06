import { redirect } from "next/navigation";


import { requirePrincipalGrants } from "@platform/core/auth";

import { hasPermission } from "@platform/core/rbac";

import { ErrorState,PageHeader,SectionCard } from "@/platform/ui_engine";

import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/service";

import { masterDataService } from "@/apps/masterdata/runtime";


import { BrandDirectory } from "./brand-directory";


export const dynamic = "force-dynamic";

export default async function BrandsPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;
  const canRead = hasPermission(grants, MASTERDATA_PERMISSIONS.brandRead);
  const canManage = hasPermission(grants, MASTERDATA_PERMISSIONS.brandManage);

  if (!canRead && !canManage) {
    return (
      <div className="grid gap-4">
        <PageHeader title="Brands" />
        <SectionCard>
          <ErrorState title="Access denied" description="You do not have permission to view brands." />
        </SectionCard>
      </div>
    );
  }

  const [brands, refs] = await Promise.all([
    masterDataService.listBrands({ grants, includeArchived: true }),
    masterDataService.listBrandDirectoryRefs({ grants }),
  ]);

  const canManageVendors = hasPermission(grants, MASTERDATA_PERMISSIONS.vendorManage);
  const canManageCategories = hasPermission(grants, MASTERDATA_PERMISSIONS.dictionaryManage);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-(--ui-page-padding)">
      <PageHeader
        title="Brands Catalog"
      />
      <BrandDirectory
        brands={brands}
        productCategories={refs.productCategories}
        materialVendors={refs.materialVendors}
        canManage={canManage}
        canManageVendors={canManageVendors}
        canManageCategories={canManageCategories}
      />
    </div>
  );
}
