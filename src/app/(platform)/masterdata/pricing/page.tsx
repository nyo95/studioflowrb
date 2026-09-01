import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { ErrorState, PageHeader, SectionCard } from "@/platform/ui_engine";
import { MASTERDATA_PERMISSIONS } from "@/apps/masterdata/service";
import { masterDataService } from "@/apps/masterdata/runtime";

import { PricingDirectory } from "./pricing-directory";

export const dynamic = "force-dynamic";

function mapMaterialPrice(p: {
  id: string;
  amount: { toString(): string };
  currency: string;
  notes: string | null;
  deleted_at: Date | null;
  sku: { name: string; id: string; code: string | null; slug: string; brand: { name: string; id: string; slug: string } | null };
  supplier_vendor: { id: string; name: string; slug: string };
  unit: { id: string; code: string; name: string };
  source_link: { id: string; kind: string; url: string; label: string | null } | null;
}) {
  return {
    id: p.id,
    sku: p.sku,
    supplier_vendor: p.supplier_vendor,
    amount: p.amount.toString(),
    currency: p.currency,
    unit: p.unit,
    deleted_at: p.deleted_at,
    notes: p.notes,
  };
}

function mapWorkPrice(p: {
  id: string;
  name: string;
  slug: string;
  amount: { toString(): string };
  currency: string;
  notes: string | null;
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
  };
}

export default async function PricingPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  const canReadMaterial = hasPermission(grants, MASTERDATA_PERMISSIONS.priceMaterialRead);
  const canReadWork = hasPermission(grants, MASTERDATA_PERMISSIONS.priceWorkRead);

  if (!canReadMaterial && !canReadWork) {
    return (
      <div className="grid gap-4">
        <PageHeader eyebrow="Master Data" title="Pricing" />
        <SectionCard>
          <ErrorState title="Access denied" description="You do not have permission to view pricing data." />
        </SectionCard>
      </div>
    );
  }

  const [rawMaterial, rawML, rawLabor, skus, vendors, units, categories] = await Promise.all([
    canReadMaterial ? masterDataService.listPriceMaterials({ grants, includeArchived: true }) : [],
    canReadWork ? masterDataService.listPriceMaterialLabors({ grants, includeArchived: true }) : [],
    canReadWork ? masterDataService.listPriceLabors({ grants, includeArchived: true }) : [],
    masterDataService.listSkus({ grants }),
    masterDataService.listVendors({ grants }),
    masterDataService.listUnits({ grants }),
    masterDataService.listCategories({ grants }),
  ]);

  const materialPrices = rawMaterial.map(mapMaterialPrice);
  const materialLaborPrices = rawML.map(mapWorkPrice);
  const laborPrices = rawLabor.map(mapWorkPrice);

  const canManageMaterial = hasPermission(grants, MASTERDATA_PERMISSIONS.priceMaterialManage);
  const canManageWork = hasPermission(grants, MASTERDATA_PERMISSIONS.priceWorkManage);

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Master Data"
        title="Pricing"
        description="Material, material+labor, and labor-only pricing tables."
      />
      <PricingDirectory
        materialPrices={materialPrices}
        materialLaborPrices={materialLaborPrices}
        laborPrices={laborPrices}
        canManageMaterial={canManageMaterial}
        canManageWork={canManageWork}
        canReadMaterial={canReadMaterial}
        canReadWork={canReadWork}
        skus={skus.map((sku) => ({ id: sku.id, name: sku.name, code: sku.code }))}
        vendors={vendors.filter((vendor) => !vendor.deleted_at).map((vendor) => ({ id: vendor.id, name: vendor.name }))}
        units={units.filter((unit) => unit.status === "ACTIVE").map((unit) => ({ id: unit.id, code: unit.code, name: unit.name }))}
        workCategories={categories.filter((category) => category.status === "ACTIVE" && category.kind === "WORK").map((category) => ({ id: category.id, name: category.name }))}
      />
    </div>
  );
}
