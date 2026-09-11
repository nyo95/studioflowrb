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
  const canManageCategories = hasPermission(grants, MASTERDATA_PERMISSIONS.dictionaryManage);

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

  const [vendors, assignmentVendorTypes, assignmentSupplierCategories, brands] = await Promise.all([
    masterDataService.listVendors({ grants, includeArchived: true }),
    canManage ? masterDataService.listVendorTypesForAssignment({ grants }) : [],
    canManage ? masterDataService.listSupplierCategoriesForAssignment({ grants }) : [],
    canManage ? masterDataService.listBrandsForVendorAssignment({ grants }) : [],
  ]);
  const vendorTypes = assignmentVendorTypes.length > 0
    ? assignmentVendorTypes
    : [...new Map(vendors.flatMap((vendor) => vendor.types.map((assignment) => [assignment.vendor_type.id, assignment.vendor_type] as const))).values()]
      .sort((left, right) => left.name.localeCompare(right.name, "id"));
  const supplierCategories = assignmentSupplierCategories.length > 0
    ? assignmentSupplierCategories
    : [...new Map(vendors.flatMap((vendor) => vendor.supplier_categories.map((assignment) => [assignment.supplier_category.id, assignment.supplier_category] as const))).values()]
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
        supplierCategories={supplierCategories.map((b) => ({ id: b.id, name: b.name, code: b.code }))}
        brands={brands.map((b) => ({ id: b.id, name: b.name }))}
        canManage={canManage}
        canManageCategories={canManageCategories}
      />
    </>
  );
}
