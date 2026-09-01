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

  const canManage = hasPermission(grants, MASTERDATA_PERMISSIONS.vendorManage);
  const [vendors, assignmentVendorTypes, brands] = await Promise.all([
    masterDataService.listVendors({ grants, includeArchived: true }),
    canManage ? masterDataService.listVendorTypesForAssignment({ grants }) : [],
    canManage ? masterDataService.listBrandsForVendorAssignment({ grants }) : [],
  ]);
  const vendorTypes = assignmentVendorTypes.length > 0
    ? assignmentVendorTypes
    : [...new Map(vendors.flatMap((vendor) => vendor.types.map((assignment) => [assignment.vendor_type.id, assignment.vendor_type] as const))).values()]
      .sort((left, right) => left.name.localeCompare(right.name, "id"));

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
