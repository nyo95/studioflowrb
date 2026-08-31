import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { ErrorState, PageHeader, SectionCard } from "@/platform/ui_engine";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/service";
import { masterDataService } from "@/apps/masterdata/runtime";

import { VendorDirectory } from "./vendor-directory";

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  if (!hasPermission(grants, MASTERDATA_PERMISSIONS.vendorRead)) {
    return (
      <div className="grid gap-4">
        <PageHeader eyebrow="Master Data" title="Vendors" />
        <SectionCard>
          <ErrorState title="Access denied" description="You do not have permission to view vendors." />
        </SectionCard>
      </div>
    );
  }

  const [vendors, vendorTypes, brands] = await Promise.all([
    masterDataService.listVendors({ grants, includeArchived: true }),
    masterDataService.listVendorTypes({ grants }),
    masterDataService.listBrands({ grants }),
  ]);

  const canManage = hasPermission(grants, MASTERDATA_PERMISSIONS.vendorManage);

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Master Data"
        title="Vendors &amp; Suppliers"
        description="Partner profiles, role dimensions, material supply permissions, and contacts directory."
      />
      <VendorDirectory
        vendors={vendors}
        vendorTypes={vendorTypes}
        brands={brands.map((b) => ({ id: b.id, name: b.name }))}
        canManage={canManage}
      />
    </div>
  );
}
