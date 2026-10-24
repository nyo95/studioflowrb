import type { getPermissionRegistry } from "@platform/core/rbac/registry";

type Registry = ReturnType<typeof getPermissionRegistry>;

type PermissionPresentation = {
  resourceLabel: string;
  actionLabel: string;
  description?: string;
  caution?: boolean;
};

const PRESENTATION: Readonly<Record<string, PermissionPresentation>> = {
  "studioflow.project.read": { resourceLabel: "Projects", actionLabel: "View projects", description: "Can open projects and their documents." },
  "studioflow.project.manage": { resourceLabel: "Studio operations", actionLabel: "Run StudioFlow operations", description: "Manager access to Clients, all Projects, PIC assignment, and the read-only portfolio Timeline." },
  "studioflow.project.override": { resourceLabel: "Studio operations", actionLabel: "Act for an absent PIC", description: "Can send, answer, finish and complete phases and edit documents on any project, and set Timeline dates. For a Manager or the Platform Owner.", caution: true },
  "studioflow.phase.work": { resourceLabel: "Project workflow", actionLabel: "Work on assigned phases", description: "Can edit phase work and send iterations when the project seat permits it." },
  "studioflow.phase.review": { resourceLabel: "Project workflow", actionLabel: "Review and skip phases", description: "Can perform review actions on phases the user may work on." },
  "studioflow.phase.override": { resourceLabel: "Project workflow", actionLabel: "Reset phase history", description: "Destructive recovery: wipes a phase's iteration history. For a Manager or the Platform Owner; needs an audited reason.", caution: true },
  "studioflow.task.manage": { resourceLabel: "Project workflow", actionLabel: "Manage requirements", description: "Can rename requirements and manage their subtasks." },
  "studioflow.mom.manage": { resourceLabel: "Core documents", actionLabel: "Edit MOM", description: "Can create and edit MOM on projects where the user is a PIC." },
  "studioflow.schedule.manage": { resourceLabel: "Core documents", actionLabel: "Edit Product Schedule", description: "Can create and edit Product Schedule content on assigned projects." },
  "studioflow.settings.manage": { resourceLabel: "StudioFlow setup", actionLabel: "Manage StudioFlow settings", description: "Can change templates, planning rules and archive settings." },
  "studioflow.ideas.manage": { resourceLabel: "Optional features", actionLabel: "Use Ideas Board", description: "Shown only while the Developer has Ideas enabled." },
  "studioflow.presentation.manage": { resourceLabel: "Optional features", actionLabel: "Edit Presentation", description: "Can edit project presentations where the user is a PIC." },

  "bq.project.read": { resourceLabel: "Projects", actionLabel: "View BQ projects" },
  "bq.project.manage": { resourceLabel: "Projects", actionLabel: "Create and edit BQ projects" },
  "bq.project-deletion.approve": { resourceLabel: "Projects", actionLabel: "Delete permanently", description: "Can permanently delete archived BQ projects.", caution: true },
  "bq.library.read": { resourceLabel: "Library", actionLabel: "View BQ Library" },
  "bq.library.manage": { resourceLabel: "Library", actionLabel: "Manage BQ Library and templates" },
  "bq.library.promote": { resourceLabel: "Library", actionLabel: "Submit items to Master Data" },

  "masterdata.brand.read": { resourceLabel: "Brands", actionLabel: "View brands" },
  "masterdata.brand.manage": { resourceLabel: "Brands", actionLabel: "Manage brands" },
  "masterdata.vendor.read": { resourceLabel: "Suppliers", actionLabel: "View suppliers" },
  "masterdata.vendor.manage": { resourceLabel: "Suppliers", actionLabel: "Manage suppliers" },
  "masterdata.dictionary.read": { resourceLabel: "Categories and units", actionLabel: "View categories and units" },
  "masterdata.dictionary.manage": { resourceLabel: "Categories and units", actionLabel: "Manage categories and units" },
  "masterdata.sku.read": { resourceLabel: "SKU catalogue", actionLabel: "View SKUs" },
  "masterdata.sku.manage": { resourceLabel: "SKU catalogue", actionLabel: "Manage SKUs" },
  "masterdata.price-material.read": { resourceLabel: "Pricing", actionLabel: "View material prices" },
  "masterdata.price-material.manage": { resourceLabel: "Pricing", actionLabel: "Manage material prices" },
  "masterdata.price-work.read": { resourceLabel: "Pricing", actionLabel: "View work prices" },
  "masterdata.price-work.manage": { resourceLabel: "Pricing", actionLabel: "Manage work prices" },
  "masterdata.promotion.approve": { resourceLabel: "Approvals", actionLabel: "Review BQ submissions" },
  "masterdata.deletion.approve": { resourceLabel: "Approvals", actionLabel: "Approve permanent deletion", caution: true },
  "masterdata.sample-request.manage": { resourceLabel: "Samples", actionLabel: "Manage sample requests" },
  "masterdata.sample.read": { resourceLabel: "Samples", actionLabel: "View Sample Shelf" },
  "masterdata.sample.manage": { resourceLabel: "Samples", actionLabel: "Manage Sample Shelf" },
};

const REQUIRED_PERMISSIONS: Readonly<Record<string, readonly string[]>> = {
  "studioflow.project.manage": ["studioflow.project.read"],
  "studioflow.project.override": ["studioflow.project.read", "studioflow.project.manage"],
  "studioflow.phase.work": ["studioflow.project.read"],
  "studioflow.phase.review": ["studioflow.project.read"],
  "studioflow.phase.override": ["studioflow.project.read"],
  "studioflow.task.manage": ["studioflow.project.read"],
  "studioflow.settings.manage": ["studioflow.project.read"],
  "studioflow.mom.manage": ["studioflow.project.read"],
  "studioflow.schedule.manage": ["studioflow.project.read"],
  "studioflow.ideas.manage": ["studioflow.project.read"],
  "studioflow.presentation.manage": ["studioflow.project.read"],
  "bq.project.manage": ["bq.project.read"],
  "bq.project-deletion.approve": ["bq.project.read"],
  "bq.library.manage": ["bq.library.read"],
  "bq.library.promote": ["bq.library.read"],
  "masterdata.brand.manage": ["masterdata.brand.read"],
  "masterdata.vendor.manage": ["masterdata.vendor.read"],
  "masterdata.dictionary.manage": ["masterdata.dictionary.read"],
  "masterdata.sku.manage": ["masterdata.sku.read"],
  "masterdata.price-material.manage": ["masterdata.price-material.read"],
  "masterdata.price-work.manage": ["masterdata.price-work.read"],
  "masterdata.sample.manage": ["masterdata.sample.read"],
};

function parsePermissionId(id: string): { appId: string; resource: string | null; action: string } {
  const parts = id.split(".");
  if (parts.length <= 2) return { appId: parts[0] ?? id, resource: null, action: parts[1] ?? "access" };
  return { appId: parts[0], resource: parts.slice(1, -1).join("."), action: parts[parts.length - 1] };
}

function titleCase(segment: string): string {
  return segment.split("-").filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export function appLabelOf(appId: string, registry: Registry): string {
  if (appId === "platform") return "Platform";
  return registry.findAppById(appId)?.name ?? appId;
}

export type PermissionRow = { id: string; actionLabel: string; description?: string; caution?: boolean };
export type ResourceGroup = { resourceLabel: string; permissions: PermissionRow[] };
export type AppGroup = { appLabel: string; positions: PermissionRow[]; resources: ResourceGroup[] };

function isPosition(id: string, registry: Registry): boolean {
  const appId = id.split(".")[0] ?? "";
  return registry.findAppById(appId)?.positions.some((position) => position.permission === id) ?? false;
}

/** Platform authority and technical app-entry grants are deliberately absent from the custom-role matrix. */
export function groupPermissionsByApp(permissionIds: readonly string[], registry: Registry): AppGroup[] {
  const apps: AppGroup[] = [];
  for (const id of permissionIds) {
    const { appId, resource, action } = parsePermissionId(id);
    if (appId === "platform" || action === "access") continue;
    const appLabel = appLabelOf(appId, registry);
    let app = apps.find((candidate) => candidate.appLabel === appLabel);
    if (!app) { app = { appLabel, positions: [], resources: [] }; apps.push(app); }
    const position = registry.findAppById(appId)?.positions.find((candidate) => candidate.permission === id);
    if (position) {
      app.positions.push({ id, actionLabel: position.label, description: `Can be selected as a project's ${position.label} PIC.` });
      continue;
    }
    const presentation = PRESENTATION[id];
    const resourceLabel = presentation?.resourceLabel ?? (resource ? titleCase(resource) : "General");
    let group = app.resources.find((candidate) => candidate.resourceLabel === resourceLabel);
    if (!group) { group = { resourceLabel, permissions: [] }; app.resources.push(group); }
    group.permissions.push({
      id,
      actionLabel: presentation?.actionLabel ?? titleCase(action),
      ...(presentation?.description ? { description: presentation.description } : {}),
      ...(presentation?.caution ? { caution: true } : {}),
    });
  }
  return apps;
}

/** Expands the friendly selection into the same canonical permission vocabulary used by RBAC. */
export function expandRolePermissionSelection(permissionIds: readonly string[], registry: Registry): string[] {
  const expanded = new Set(permissionIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const permissionId of [...expanded]) {
      for (const required of REQUIRED_PERMISSIONS[permissionId] ?? []) {
        if (!expanded.has(required)) { expanded.add(required); changed = true; }
      }
    }
  }
  for (const permissionId of [...expanded]) {
    if (permissionId.startsWith("platform.") || permissionId.endsWith(".access") || isPosition(permissionId, registry)) continue;
    const appId = permissionId.split(".")[0];
    if (registry.findAppById(appId)) expanded.add(`${appId}.access`);
  }
  return [...expanded].sort();
}

export function friendlyPermissionLabels(permissionIds: readonly string[], registry: Registry): string[] {
  const positionLabels = new Map(registry.apps.flatMap((app) => app.positions.map((position) => [position.permission, position.label] as const)));
  return permissionIds
    .filter((id) => !id.startsWith("platform.") && !id.endsWith(".access"))
    .map((id) => positionLabels.get(id) ?? PRESENTATION[id]?.actionLabel ?? titleCase(parsePermissionId(id).action));
}
