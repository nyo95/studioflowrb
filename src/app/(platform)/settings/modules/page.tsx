import { redirect } from "next/navigation";

import { requirePrincipalGrants } from "@platform/core/auth";
import { listModuleOverview } from "@platform/core/modules";
import { DataTable, Notice, SectionCard, StatusBadge, TableBody, TableCell, TableCellContent, TableHead, TableHeader, TableRow } from "@/platform/ui_engine";

import { SettingsFrame } from "../settings-navigation";
import { canOpenSettingsSection, platformSettingsGroups } from "../settings-sections";

export const dynamic = "force-dynamic";

/**
 * Read-only module list (WO-MODULES-M1 UI Contract). Module state is a System Owner operation on the server,
 * never an RBAC permission, so this page has no controls: a Company Administrator can see what is installed
 * and switched on, not change it.
 */
export default async function ModulesSettingsPage() {
  const principalGrants = await requirePrincipalGrants().catch(() => null);
  if (!principalGrants) redirect("/login");
  const groups = platformSettingsGroups(principalGrants.grants);
  const modules = canOpenSettingsSection(groups, "modules") ? await listModuleOverview() : [];
  const nameOf = new Map(modules.map((module) => [module.id, module.name]));
  return (
    <SettingsFrame
      trail={[{ label: "Home", href: "/" }, { label: "Platform settings", href: "/settings" }]}
      title="Modules"
      description="The parts of the system installed here, their version, and whether each is switched on."
      groups={groups}
      active="modules"
    >
      <SectionCard>
        <div className="grid gap-3">
          <Notice title="Changed only by the System Owner.">
            Modules are switched on or off on the server, not from this page. Switching a module off hides it for
            everyone and keeps all its data; switching it on brings everything back.
          </Notice>
          <DataTable framed={false} density="compact">
            <TableHeader>
              <TableRow>
                <TableHead>Module</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {modules.map((module) => (
                <TableRow key={module.id}>
                  <TableCell>
                    <TableCellContent
                      primary={module.name}
                      secondary={module.kind === "core" ? "Core, always on" : `Optional, part of ${nameOf.get(module.parent ?? "") ?? module.parent}`}
                    />
                  </TableCell>
                  <TableCell>{module.version}</TableCell>
                  <TableCell>
                    {module.enabled
                      ? <StatusBadge tone="success">On</StatusBadge>
                      : <StatusBadge tone="neutral">{module.state === "DISABLED" ? "Off" : "Off (needs a module that is off)"}</StatusBadge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </DataTable>
        </div>
      </SectionCard>
    </SettingsFrame>
  );
}
