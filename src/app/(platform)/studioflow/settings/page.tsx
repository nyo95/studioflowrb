import { redirect } from "next/navigation";
import { Settings } from "lucide-react";

import { requirePrincipalGrants } from "@platform/core/auth";
import { hasPermission } from "@platform/core/rbac";
import {
  Badge,
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
  { href: "#fase", label: "Phase template" },
  { href: "#penamaan", label: "File naming template" },
] as const;

export default async function StudioFlowSettingsPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const { grants } = principalGrants;

  const canRead = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectRead);
  const canManage = hasPermission(grants, STUDIOFLOW_PERMISSIONS.projectManage);

  if (!canRead) {
    return (
      <>
        <PageHeader eyebrow="StudioFlow" title="Settings" divider />
        <SectionCard>
          <EmptyState
            icon={Settings}
            title="Access denied"
            description="You do not have permission to view StudioFlow settings."
          />
        </SectionCard>
      </>
    );
  }

  const [settings, templates] = await Promise.all([
    studioFlowService.getStudioSettings(),
    studioFlowService.listPhaseTemplates(grants),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="StudioFlow"
        title="Studio settings"
        description="Workspace-level configuration. Role permissions come from the platform."
        divider
      />

      <SettingsShell
        navigationLabel="Navigasi pengaturan"
        navigation={SETTINGS_NAV.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="rounded-control px-2.5 py-1.5 text-[0.8125rem] font-medium text-ink-secondary no-underline hover:bg-surface-muted hover:text-ink"
          >
            {item.label}
          </a>
        ))}
      >
        {/* Read-only here on purpose: the template is seeded and versioned by the
            platform, and editing it mid-flight would re-shape live projects. */}
        <SectionCard
          id="fase"
          title="Phase template"
          count={templates.length}
          padded={false}
          className="scroll-mt-6"
        >
          <p className="border-b border-line-subtle px-3.5 py-2.5 text-sm text-ink-secondary">
            Default pipeline applied to every new project.
          </p>
          {templates.length === 0 ? (
            <EmptyState
              icon={Settings}
              title="No phase template"
              description="No phases have been seeded for this studio."
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
                    <span className="truncate text-sm font-semibold">{template.name}</span>
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
        </SectionCard>

        <SectionCard id="penamaan" title="File naming template" className="scroll-mt-6">
          <p className="mb-4 text-sm text-ink-secondary">
            Standard name used whenever a file is recorded. Unknown tokens are rejected on save.
          </p>
          <NamingTemplateForm template={settings.naming_template} canManage={canManage} />
        </SectionCard>
      </SettingsShell>
    </>
  );
}
