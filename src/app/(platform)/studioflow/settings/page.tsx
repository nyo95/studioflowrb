import { redirect } from "next/navigation";
import { Settings } from "lucide-react";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import {
  Badge,
  CardSection,
  EmptyState,
  PageHeader,
  SectionCard,
  SettingsShell,
  Text,
} from "@/platform/ui_engine";
import { STUDIOFLOW_PERMISSIONS } from "@/apps/studioflow/service";
import { studioFlowService } from "@/apps/studioflow/runtime";

import { NamingTemplateForm } from "./naming-template-form";

export const dynamic = "force-dynamic";

const SETTINGS_NAV = [
  { href: "#fase", label: "Template fase" },
  { href: "#penamaan", label: "Template nama file" },
] as const;

export default async function StudioFlowSettingsPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  const canRead = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
  const canManage = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);

  if (!canRead) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-6 p-(--ui-page-padding)">
        <PageHeader eyebrow="StudioFlow" title="Pengaturan" divider />
        <SectionCard>
          <EmptyState
            icon={Settings}
            title="Akses ditolak"
            description="Kamu tidak punya permission untuk melihat pengaturan."
          />
        </SectionCard>
      </div>
    );
  }

  const [settings, templates] = await Promise.all([
    studioFlowService.getStudioSettings(),
    studioFlowService.listPhaseTemplates(grants),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 p-(--ui-page-padding)">
      <PageHeader
        eyebrow="StudioFlow"
        title="Pengaturan studio"
        description="Konfigurasi tingkat workspace. Permission role datang dari platform, bukan dari StudioFlow."
        divider
      />

      <SettingsShell
        navigationLabel="Navigasi pengaturan"
        navigation={SETTINGS_NAV.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="rounded-control px-2.5 py-1.5 text-[0.78125rem] font-medium text-ink-secondary no-underline hover:bg-surface-muted hover:text-ink"
          >
            {item.label}
          </a>
        ))}
      >
        {/* Read-only here on purpose: the template is seeded and versioned by the
            platform, and editing it mid-flight would re-shape live projects. */}
        <CardSection
          id="fase"
          title="Template fase"
          count={templates.length}
          padded={false}
          className="scroll-mt-6"
        >
          <p className="border-b border-line-subtle px-3.5 py-2.5 text-[0.78125rem] text-ink-secondary">
            Pipeline default yang dipasang ke setiap project baru.
          </p>
          {templates.length === 0 ? (
            <EmptyState
              icon={Settings}
              title="Template kosong"
              description="Belum ada fase yang di-seed untuk studio ini."
            />
          ) : (
            <ol className="m-0 list-none p-0">
              {templates.map((template, index) => (
                <li
                  key={template.id}
                  className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line-subtle px-3.5 py-2.5 last:border-0"
                >
                  <span className="font-ui-mono text-[0.6875rem] text-ink-tertiary tabular-nums">
                    {index + 1}
                  </span>
                  <div className="grid min-w-0 gap-px">
                    <span className="truncate text-[0.84375rem] font-semibold">{template.name}</span>
                    <span className="font-ui-mono text-[0.6875rem] text-ink-tertiary">{template.key}</span>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    {template.has_rounds ? (
                      <Badge>
                        Ronde{template.round_prefix ? ` · ${template.round_prefix}` : ""}
                      </Badge>
                    ) : (
                      <Text size="sm" tone="tertiary">Tanpa ronde</Text>
                    )}
                    {template.requires_internal_approval ? <Badge tone="warning">Perlu ACC</Badge> : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardSection>

        <CardSection id="penamaan" title="Template nama file" className="scroll-mt-6">
          <p className="mb-4 text-[0.78125rem] text-ink-secondary">
            Nama standar yang dipakai setiap kali file dicatat. Token yang tidak dikenal
            ditolak saat simpan, bukan saat file masuk.
          </p>
          <NamingTemplateForm template={settings.naming_template} canManage={canManage} />
        </CardSection>
      </SettingsShell>
    </div>
  );
}
