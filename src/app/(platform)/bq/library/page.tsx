import { prisma } from "@/platform/core/db";
import { readPlatformGeneralSettings } from "@platform/core/settings";

import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission, hasAnyPermission } from "@platform/core/rbac";
import { PageHeader, SectionCard, DirectoryShell, ErrorState, Tabs, DataTable, TableHeader, TableBody, TableRow, TableCell, TableHead, StatusBadge, EmptyState, Badge, Text } from "@/platform/ui_engine";
import { BQ_PERMISSIONS } from "@/apps/bq/service";
import { bqPublicRead } from "@/apps/bq/runtime";
import { Library } from "lucide-react";
import { createMoney, formatMoney } from "@platform/utilities/money";
import { AssemblyActions, AssemblyCreateButton, LibraryItemActions, LibraryItemCreateButton, TemplateActions, TemplateCreateButton } from "./library-controls";
import { TemplateSectionsButton } from "./template-editor";
import { PromotionRequestButton } from "./promotion-controls";

export const dynamic = "force-dynamic";

export default async function BqLibraryPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;
  const settings = await readPlatformGeneralSettings(prisma);

  const canRead = hasAnyPermission(grants, [BQ_PERMISSIONS.libraryRead, BQ_PERMISSIONS.libraryManage]);
  const canManage = hasPermission(grants, BQ_PERMISSIONS.libraryManage);
  const canPromote = hasPermission(grants, BQ_PERMISSIONS.libraryPromote);

  if (!canRead) {
    return (
      <div className="grid gap-4">
        <PageHeader eyebrow="Bill of Quantity" title="BQ Library" />
        <SectionCard>
          <ErrorState title="Access denied" description="You do not have permission to view the BQ Library." />
        </SectionCard>
      </div>
    );
  }

  const items = await bqPublicRead.listLibraryItems();
  const [templates, assemblies] = await Promise.all([bqPublicRead.listTemplates(), bqPublicRead.listAssemblyTemplates()]);

  const kategoriLabel: Record<string, string> = {
    MATERIAL: "Material",
    UPAH: "Upah",
    MATERIAL_UPAH: "Material+Upah",
    BIAYA_UMUM: "Biaya Umum",
    TRANSPORTASI_AKOMODASI: "Transportasi",
    ALAT: "Alat",
  };

  const kategoriTone: Record<string, "neutral" | "success" | "warning" | "danger"> = {
    MATERIAL: "neutral",
    UPAH: "success",
    MATERIAL_UPAH: "warning",
    BIAYA_UMUM: "warning",
    TRANSPORTASI_AKOMODASI: "warning",
    ALAT: "neutral",
  };

  const statusTone: Record<string, "neutral" | "success" | "warning" | "danger"> = {
    DRAFT: "neutral",
    REQUESTED: "warning",
    APPROVED: "success",
    REJECTED: "danger",
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Bill of Quantity"
        title="BQ Library"
        description="Manage library items and templates"
        actions={canManage ? <div className="flex flex-wrap gap-2"><LibraryItemCreateButton /><AssemblyCreateButton /><TemplateCreateButton /></div> : null}
      />

      <Tabs
        defaultValue="items"
        label="BQ Library views"
        items={[
          {
            value: "items",
            label: "Items",
            content: (
              <DirectoryShell surface>
                {items.length === 0 ? (
                  <EmptyState
                    icon={Library}
                    title="Belum ada library items"
                    description="Mulai dengan menambahkan item baru."
                  />
                ) : (
                  <DataTable framed={false} density="compact" stickyHeader maxBodyHeight="60vh" minWidth={900}>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead align="end">Harga</TableHead>
                        <TableHead>KATEGORI</TableHead>
                        <TableHead>Status</TableHead>
                        {canManage || canPromote ? <TableHead align="end">Actions</TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell>{item.purchaseUnit}</TableCell>
                          <TableCell align="end">
                            {formatMoney(createMoney(item.harga, item.currency), { locale: settings.locale })}
                          </TableCell>
                          <TableCell>
                            <Badge tone={kategoriTone[item.kategori] ?? "neutral"}>
                              {kategoriLabel[item.kategori] ?? item.kategori}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <StatusBadge tone={statusTone[item.promotionStatus] ?? "neutral"}>
                              {item.promotionStatus}
                            </StatusBadge>
                          </TableCell>
                          {canManage || canPromote ? (
                            <TableCell align="end">
                              <div className="flex flex-wrap items-center justify-end gap-1">
                                {canPromote ? <PromotionRequestButton item={item} /> : null}
                                {canManage ? <LibraryItemActions item={item} /> : null}
                              </div>
                            </TableCell>
                          ) : null}
                        </TableRow>
                      ))}
                    </TableBody>
                  </DataTable>
                )}
              </DirectoryShell>
            ),
          },
          {
            value: "assemblies",
            label: "Assemblies",
            content: <SectionCard>{assemblies.length === 0 ? <EmptyState title="Belum ada assembly" description="Assembly adalah template L2 dengan daftar L3 yang akan disalin ke proyek." /> : <div className="grid gap-4">{assemblies.map((assembly) => <div key={assembly.id} className="rounded-control border border-line p-4"><div className="flex items-start justify-between gap-2"><div><div className="font-medium">{assembly.name}</div><Text tone="tertiary" size="sm">{assembly.lineCount} baris L3 · {assembly.description ?? "Tanpa deskripsi"}</Text></div></div>{canManage ? <AssemblyActions assembly={assembly} /> : null}</div>)}</div>}</SectionCard>,
          },
          {
            value: "templates",
            label: "Templates",
            content: (
              <SectionCard>
                {templates.length === 0 ? (
                  <EmptyState
                    title="Belum ada template"
                    description="Buat template untuk scaffold project baru."
                  />
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {templates.map((t) => {
                      const sectionCount = t.sections.filter((s) => !s.parentId).length;
                      const subCount = t.sections.filter((s) => s.parentId).length;
                      return (
                        <div
                          key={t.id}
                          className="rounded-lg border border-line p-4 hover:border-line-strong transition-colors"
                        >
                          <h3 className="font-semibold text-sm mb-1">{t.name}</h3>
                          <p className="text-xs text-ink-secondary mb-3">
                            {sectionCount} sections · {subCount} subsections
                          </p>
                          {canManage ? (
                            <div className="flex flex-wrap gap-1">
                              <TemplateActions template={t} />
                              <TemplateSectionsButton template={t} libraryItems={items} />
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>
            ),
          },
        ]}
      />
    </div>
  );
}
