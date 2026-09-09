import { redirect } from "next/navigation";


import { requirePrincipalGrants } from "@platform/core/auth";

import { hasPermission } from "@platform/core/rbac";

import {
  ErrorState,
  PageHeader,
  SectionCard,
} from "@/platform/ui_engine";

import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/service";

import { masterDataService } from "@/apps/masterdata/runtime";


import { VendorDirectory } from "./vendor-directory";


export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;
  const canRead = hasPermission(grants, MASTERDATA_PERMISSIONS.vendorRead);
  const canManage = hasPermission(grants, MASTERDATA_PERMISSIONS.vendorManage);

  if (!canRead && !canManage) {
    return (
      <>
        <PageHeader title="Suppliers" divider />
        <SectionCard>
          <ErrorState title="Access denied" description="You do not have permission to view suppliers." />
        </SectionCard>
      </>
    );
  }

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
    <>
      <PageHeader
        title="Suppliers"
        divider
      />
      <VendorDirectory
        vendors={vendors}
        vendorTypes={vendorTypes}
        brands={brands.map((b) => ({ id: b.id, name: b.name }))}
        canManage={canManage}
      />
    </>
  );
}
