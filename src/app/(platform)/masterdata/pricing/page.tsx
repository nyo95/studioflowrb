import { sizeText } from "../directory-findability";
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


import { PricingDirectory } from "./pricing-directory";


export const dynamic = "force-dynamic";

function mapMaterialPrice(p: {
  id: string;
  amount: { toString(): string };
  currency: string;
  notes: string | null;
  updated_at: Date;
  updated_by_label: string;
  deleted_at: Date | null;
  sku: {
    name: string | null; id: string; code: string | null; slug: string; brand: { name: string; id: string; slug: string } | null;
    categories: Array<{ category: { id: string; name: string } }>;
    dimension_length: { toString(): string } | null; dimension_width: { toString(): string } | null; dimension_thickness: { toString(): string } | null; dimension_unit: { code: string } | null;
  };
  supplier_vendor: { id: string; name: string; slug: string };
  unit: { id: string; code: string; name: string };
  source_link: { id: string; kind: string; url: string; label: string | null } | null;
}) {
  return {
    id: p.id,
    sku: {
      id: p.sku.id, name: p.sku.name, code: p.sku.code, brand: p.sku.brand,
      categories: p.sku.categories.map((item) => item.category),
      size: sizeText({ length: p.sku.dimension_length?.toString() ?? null, width: p.sku.dimension_width?.toString() ?? null, thickness: p.sku.dimension_thickness?.toString() ?? null, unitCode: p.sku.dimension_unit?.code ?? null }),
    },
    supplier_vendor: p.supplier_vendor,
    amount: p.amount.toString(),
    currency: p.currency,
    unit: p.unit,
    deleted_at: p.deleted_at,
    notes: p.notes,
    updated_at: p.updated_at,
    updated_by_label: p.updated_by_label,
  };
}

function mapWorkPrice(p: {
  id: string;
  name: string;
  slug: string;
  amount: { toString(): string };
  currency: string;
  notes: string | null;
  updated_at: Date;
  updated_by_label: string;
  deleted_at: Date | null;
  unit: { id: string; code: string; name: string };
  vendor: { id: string; name: string; slug: string };
  category: { id: string; name: string; slug: string };
  scope_note?: string | null;
  spec?: unknown;
  dim_display?: string | null;
}) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    category: p.category,
    vendor: p.vendor,
    unit: p.unit,
    amount: p.amount.toString(),
    currency: p.currency,
    scope_note: p.scope_note ?? null,
    deleted_at: p.deleted_at,
    notes: p.notes,
    updated_at: p.updated_at,
    updated_by_label: p.updated_by_label,
  };
}

export default async function PricingPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  const canReadMaterial = hasPermission(grants, MASTERDATA_PERMISSIONS.priceMaterialRead);
  const canReadWork = hasPermission(grants, MASTERDATA_PERMISSIONS.priceWorkRead);
  const canManageMaterial = hasPermission(grants, MASTERDATA_PERMISSIONS.priceMaterialManage);
  const canManageWork = hasPermission(grants, MASTERDATA_PERMISSIONS.priceWorkManage);
  const canManageBrands = hasPermission(grants, MASTERDATA_PERMISSIONS.brandManage);
  const canManageVendors = hasPermission(grants, MASTERDATA_PERMISSIONS.vendorManage);
  const canManageCategories = hasPermission(grants, MASTERDATA_PERMISSIONS.dictionaryManage);
  const canManageSkus = hasPermission(grants, MASTERDATA_PERMISSIONS.skuManage);

  if (!canReadMaterial && !canReadWork && !canManageMaterial && !canManageWork) {
    return (
      <>
        <PageHeader title="Pricing" divider />
        <SectionCard>
          <ErrorState title="Access denied" description="You do not have permission to view pricing data." />
        </SectionCard>
      </>
    );
  }

  const [rawMaterial, rawML, rawLabor, materialRefs, workRefs, vendorTypes] = await Promise.all([
    canReadMaterial || canManageMaterial ? masterDataService.listPriceMaterials({ grants, includeArchived: true }) : [],
    canReadWork || canManageWork ? masterDataService.listPriceMaterialLabors({ grants, includeArchived: true }) : [],
    canReadWork || canManageWork ? masterDataService.listPriceLabors({ grants, includeArchived: true }) : [],
    canReadMaterial || canManageMaterial ? masterDataService.listPricingMaterialRefs({ grants }) : null,
    canReadWork || canManageWork ? masterDataService.listPricingWorkRefs({ grants }) : null,
    canManageVendors ? masterDataService.listVendorTypesForAssignment({ grants }) : [],
  ]);

  // Supplier contacts are shown next to prices only to people who may already read suppliers.
  const canReadVendors = hasPermission(grants, MASTERDATA_PERMISSIONS.vendorRead) || hasPermission(grants, MASTERDATA_PERMISSIONS.vendorManage);
  const contacts: Record<string, { name: string; phones: string[] }> = {};
  if (canReadVendors) {
    for (const vendor of await masterDataService.listVendors({ grants, includeArchived: true })) {
      const contact = [...vendor.contacts].sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0];
      if (contact) contacts[vendor.id] = { name: contact.person_name, phones: [contact.phone, ...(contact.extra_phones ?? [])].filter((phone): phone is string => Boolean(phone && phone.trim())) };
    }
  }

  const materialPrices = rawMaterial.map(mapMaterialPrice);
  const materialLaborPrices = rawML.map(mapWorkPrice);
  const laborPrices = rawLabor.map(mapWorkPrice);

  return (
    <>
      <PageHeader
        title="Pricing"
        divider
      />
      <PricingDirectory
        materialPrices={materialPrices}
        materialLaborPrices={materialLaborPrices}
        laborPrices={laborPrices}
        contacts={contacts}
        canManageMaterial={canManageMaterial}
        canManageWork={canManageWork}
        canReadMaterial={canReadMaterial}
        canReadWork={canReadWork}
        canManageVendors={canManageVendors}
        canManageCategories={canManageCategories}
        canManageSkus={canManageSkus}
        canManageBrands={canManageBrands}
        brands={materialRefs?.brands ?? []}
        productCategories={materialRefs?.productCategories ?? []}
        skus={(materialRefs?.skus ?? []).map((sku) => ({
          ...sku,
          brand: sku.brand ?? null,
          dimension_length: sku.dimension_length?.toString() ?? null,
          dimension_width: sku.dimension_width?.toString() ?? null,
          dimension_thickness: sku.dimension_thickness?.toString() ?? null,
          purchase_to_base_factor: sku.purchase_to_base_factor?.toString() ?? null,
        }))}
        vendors={[...new Map([...(materialRefs?.vendors ?? []), ...(workRefs?.vendors ?? [])].map((vendor) => [vendor.id, { id: vendor.id, name: vendor.name }] as const)).values()].sort((left, right) => left.name.localeCompare(right.name, "id"))}
        materialVendors={materialRefs?.vendors ?? []}
        workVendors={workRefs?.vendors ?? []}
        units={materialRefs?.units ?? workRefs?.units ?? []}
        workCategories={workRefs?.workCategories ?? []}
        vendorTypes={vendorTypes.map((vendorType) => ({ id: vendorType.id, name: vendorType.name, canSupplyMaterial: vendorType.can_supply_material, canSupplyLabor: vendorType.can_supply_labor }))}
      />
    </>
  );
}
