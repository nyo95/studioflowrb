import { notFound, redirect } from "next/navigation";
import { Layers } from "lucide-react";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { prisma } from "@/platform/core/db";
import { createMasterDataPublicRead } from "@/apps/masterdata/public";
import { Breadcrumb, EmptyState, PageHeader, SectionCard } from "@/platform/ui_engine";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";
import { studioFlowService } from "@/apps/studioflow/runtime";
import { CatalogueDetailView } from "./catalogue-detail";

export const dynamic = "force-dynamic";

export default async function CatalogueProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;
  const canRead = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);

  if (!canRead) {
    return (
      <>
        <PageHeader eyebrow="StudioFlow · Catalogue" title="Product detail" divider />
        <SectionCard>
          <EmptyState icon={Layers} title="Access denied" description="You do not have permission to view this catalogue product." />
        </SectionCard>
      </>
    );
  }

  const product = await studioFlowService.getCatalogueProduct(grants, id).catch((error: { kind?: string }) => {
    if (error?.kind === "NOT_FOUND") return null;
    throw error;
  });
  if (!product) notFound();

  const brands = await createMasterDataPublicRead(prisma).listBrandLibraryReads();
  const brandOptions = brands.map((brand) => ({ id: brand.id, name: brand.name }));
  if (product.brand_md_id && product.brand_name && !brandOptions.some((brand) => brand.id === product.brand_md_id)) {
    brandOptions.push({ id: product.brand_md_id, name: `${product.brand_name} (frozen)` });
  }
  const canManage = hasPermission(grants, STUDIOFLOW_PERMISSIONS.scheduleManage);

  return (
    <>
      <Breadcrumb
        entries={[
          { label: "Product Catalogue", href: "/studioflow/catalogue" },
          { label: product.product_name },
        ]}
      />
      <PageHeader
        eyebrow="StudioFlow · Catalogue"
        title={product.product_name}
        description={product.deleted_at ? "Archived specification" : "Reusable StudioFlow specification"}
        divider
      />
      <CatalogueDetailView
        brands={brandOptions}
        canManage={canManage}
        archived={Boolean(product.deleted_at)}
        values={{
          id: product.id,
          brand_md_id: product.brand_md_id,
          brand_name: product.brand_name,
          product_name: product.product_name,
          colour: product.colour,
          finishing: product.finishing,
          dimension_text: product.dimension_text,
          unit: product.unit,
          notes: product.notes,
        }}
      />
    </>
  );
}
