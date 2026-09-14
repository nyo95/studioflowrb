import { prisma } from "@/platform/core/db";
import { readPlatformGeneralSettings } from "@platform/core/settings";
import { formatInstant } from "@platform/utilities/date";

import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission, hasAnyPermission } from "@platform/core/rbac";
import {
  Badge,
  DataTable,
  DirectoryShell,
  EmptyState,
  ErrorState,
  Heading,
  PageHeader,
  SectionCard,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  Text,
} from "@/platform/ui_engine";
import { BQ_PERMISSIONS } from "@/apps/bq/service";
import { bqPublicRead, masterDataRead } from "@/apps/bq/runtime";
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
      <>
        <PageHeader eyebrow="Bill of Quantity" title="BQ Library" divider />
        <SectionCard>
          <ErrorState title="Access denied" description="You do not have permission to view the BQ Library." />
        </SectionCard>
      </>
    );
  }

  const [items, templates, assemblies, units] = await Promise.all([
    bqPublicRead.listLibraryItems(),
    bqPublicRead.listTemplates(),
    bqPublicRead.listAssemblyTemplates(),
    masterDataRead.listUnits(),
  ]);

  const kategoriLabel: Record<string, string> = {
    MATERIAL: "Material",
    UPAH: "Labor",
    MATERIAL_UPAH: "Material + Labor",
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

  return (
    <>
      <PageHeader
        eyebrow="Bill of Quantity"
        title="BQ Library"
        description="Manage library items and templates"
        actions={canManage ? <div className="flex flex-wrap gap-2"><LibraryItemCreateButton units={units} /><AssemblyCreateButton /><TemplateCreateButton /></div> : null}
        divider
      />

      <Tabs
        fill
        defaultValue="items"
        label="BQ Library views"
        items={[
          {
            value: "items",
            label: "Items",
            content: (
              <DirectoryShell surface fill>
                {items.length === 0 ? (
                  <EmptyState
                    icon={Library}
                    title="Belum ada library items"
                    description="Mulai dengan menambahkan item baru."
                  />
                ) : (
                  <DataTable framed={false} density="compact" stickyHeader fill minWidth={760}>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead align="end">Harga</TableHead>
                        <TableHead>KATEGORI</TableHead>
                        {canManage || canPromote ? <TableHead align="end">Actions</TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell><div className="grid gap-0.5"><span className="font-medium">{item.name}</span><span className="text-xs text-ink-tertiary">Updated {formatInstant(item.updatedAt, { locale: settings.locale, timeZone: settings.timezone, style: "date" })}</span></div></TableCell>
                          <TableCell>{item.purchaseUnit}</TableCell>
                          <TableCell align="end">
                            {formatMoney(createMoney(item.harga, item.currency), { locale: settings.locale })}
                          </TableCell>
                          <TableCell>
                            <Badge tone={kategoriTone[item.kategori] ?? "neutral"}>
                              {kategoriLabel[item.kategori] ?? item.kategori}
                            </Badge>
                          </TableCell>
                          {canManage || canPromote ? (
                            <TableCell align="end">
                              <div className="flex flex-wrap items-center justify-end gap-1">
                                {canPromote ? <PromotionRequestButton item={item} /> : null}
                                {canManage ? <LibraryItemActions item={item} units={units} /> : null}
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
            content: <SectionCard>{assemblies.length === 0 ? <EmptyState title="No assemblies" description="An assembly is a Component Group template whose Cost Components are copied into a project." /> : <div className="grid gap-4">{assemblies.map((assembly) => <div key={assembly.id} className="rounded-control border border-line p-4"><div className="flex items-start justify-between gap-2"><div><div className="font-medium">{assembly.name}</div><Text tone="tertiary" size="sm">{assembly.lineCount} Cost Components · {assembly.description ?? "No description"}</Text></div></div>{canManage ? <AssemblyActions assembly={assembly} /> : null}</div>)}</div>}</SectionCard>,
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
                          <Heading level={5} className="mb-1">{t.name}</Heading>
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
    </>
  );
}
