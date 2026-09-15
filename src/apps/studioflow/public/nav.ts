/**
 * StudioFlow client-safe routes and navigation (no server imports).
 */
export const STUDIOFLOW_ROUTES = {
  root: "/studioflow",
  projects: "/studioflow/projects",
  project: (projectId: string) => `/studioflow/projects/${projectId}`,
  projectPhase: (projectId: string, phaseId: string) => `/studioflow/projects/${projectId}/phases/${phaseId}`,
  projectHistory: (projectId: string) => `/studioflow/projects/${projectId}/history`,
  projectSchedule: (projectId: string) => `/studioflow/projects/${projectId}/schedule`,
  projectMom: (projectId: string) => `/studioflow/projects/${projectId}/mom`,
  projectMomDocument: (projectId: string, documentId: string) => `/studioflow/projects/${projectId}/mom/${documentId}`,
  projectMomPrint: (projectId: string, documentId: string) => `/studioflow/print/projects/${projectId}/mom/${documentId}`,
  clients: "/studioflow/clients",
  client: (clientId: string) => `/studioflow/clients/${clientId}`,
  settings: "/studioflow/settings",
} as const;

export type StudioFlowNavLink = { href: string; label: string; exact?: boolean };

export const STUDIOFLOW_NAV_LINKS: {
  workspace: readonly StudioFlowNavLink[];
  utility: readonly StudioFlowNavLink[];
} = {
  workspace: [
    { href: "/studioflow", label: "Today", exact: true },
    { href: "/studioflow/projects", label: "Projects" },
    { href: "/studioflow/clients", label: "Clients" },
  ],
  utility: [{ href: "/studioflow/settings", label: "Studio Settings" }],
};
