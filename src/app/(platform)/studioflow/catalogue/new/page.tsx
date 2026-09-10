import { redirect } from "next/navigation";
import { Layers } from "lucide-react";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import { prisma } from "@/platform/core/db";
import { createMasterDataPublicRead } from "@/apps/masterdata/public";
import { Breadcrumb, EmptyState, PageHeader, SectionCard } from "@/platform/ui_engine";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";
import { CatalogueForm } from "../catalogue-form";

export const dynamic = "force-dynamic";

export default async function NewCatalogueProductPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  if (!hasPermission(grants, STUDIOFLOW_PERMISSIONS.scheduleManage)) {
    return (
      <>
        <Breadcrumb entries={[{ label: "Product Catalogue", href: "/studioflow/catalogue" }, { label: "New product" }]} />
        <PageHeader title="New product" description="Create a reusable StudioFlow specification." divider />
        <SectionCard>
          <EmptyState icon={Layers} title="Access denied" description="You do not have permission to add catalogue products." />
        </SectionCard>
      </>
    );
  }

  const brands = await createMasterDataPublicRead(prisma).listBrandLibraryReads();

  return (
    <>
      <Breadcrumb entries={[{ label: "Product Catalogue", href: "/studioflow/catalogue" }, { label: "New product" }]} />
      <PageHeader eyebrow="StudioFlow · Catalogue" title="New product" divider />
      <SectionCard>
        <CatalogueForm brands={brands.map((brand) => ({ id: brand.id, name: brand.name }))} />
      </SectionCard>
    </>
  );
}
