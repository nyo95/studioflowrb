/**
 * StudioFlow client-safe routes and navigation (no server imports).
 */
export const STUDIOFLOW_ROUTES = {
  root: "/studioflow",
  projects: "/studioflow/projects",
  timeline: "/studioflow/timeline",
  project: (projectId: string) => `/studioflow/projects/${projectId}`,
  projectPhase: (projectId: string, phaseId: string) => `/studioflow/projects/${projectId}?phase=${phaseId}`,
  projectDeliverables: (projectId: string) => `/studioflow/projects/${projectId}/deliverables`,
  projectTimeline: (projectId: string) => `/studioflow/projects/${projectId}/timeline`,
  projectHistory: (projectId: string) => `/studioflow/projects/${projectId}/history`,
  projectSchedule: (projectId: string, entryId?: string) => `/studioflow/projects/${projectId}/schedule${entryId ? `?entry=${encodeURIComponent(entryId)}` : ""}`,
  projectSchedulePrint: (projectId: string) => `/studioflow/print/projects/${projectId}/schedule`,
  projectMom: (projectId: string) => `/studioflow/projects/${projectId}/mom`,
  projectMomDocument: (projectId: string, documentId: string) => `/studioflow/projects/${projectId}/mom/${documentId}`,
  projectMomPrint: (projectId: string, documentId: string) => `/studioflow/print/projects/${projectId}/mom/${documentId}`,
  clients: "/studioflow/clients",
  client: (clientId: string) => `/studioflow/clients/${clientId}`,
  library: "/studioflow/library",
  ideas: "/studioflow/ideas",
  settings: "/studioflow/settings",
  scheduleTemplates: "/studioflow/settings/schedule",
} as const;

export type StudioFlowNavLink = { href: string; label: string; exact?: boolean };

export const STUDIOFLOW_NAV_LINKS: {
  workspace: readonly StudioFlowNavLink[];
  utility: readonly StudioFlowNavLink[];
} = {
  workspace: [
    { href: "/studioflow", label: "Home", exact: true },
    { href: "/studioflow/projects", label: "Projects" },
    { href: "/studioflow/timeline", label: "Timeline" },
    { href: "/studioflow/clients", label: "Clients" },
    { href: "/studioflow/library", label: "Library" },
    { href: "/studioflow/ideas", label: "Ideas" },
  ],
  utility: [{ href: "/studioflow/settings", label: "Settings" }],
};

export function studioFlowWorkspaceLinks(input: { canManageProjects: boolean; ideasEnabled: boolean; canUseIdeas: boolean }): readonly StudioFlowNavLink[] {
  return STUDIOFLOW_NAV_LINKS.workspace.filter((link) => {
    if (link.href === STUDIOFLOW_ROUTES.ideas) return input.ideasEnabled && input.canUseIdeas;
    if (link.href === STUDIOFLOW_ROUTES.timeline || link.href === STUDIOFLOW_ROUTES.clients) return input.canManageProjects;
    return true;
  });
}
