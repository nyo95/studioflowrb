/**
 * StudioFlow client-safe route and navigation constants.
 *
 * This module has NO server-side imports (no Prisma, no Node built-ins) so it
 * can be safely imported by "use client" components without pulling
 * server-only service code into the browser bundle.
 */

export const STUDIOFLOW_ROUTES = {
  root: "/studioflow",
  projects: "/studioflow/projects",
  newProject: "/studioflow/new",
  clients: "/studioflow/clients",
  newClient: "/studioflow/clients/new",
  client: (id: string) => `/studioflow/clients/${id}`,
  library: "/studioflow/library",
  catalogue: "/studioflow/catalogue",
  newCatalogueItem: "/studioflow/catalogue/new",
  catalogueItem: (id: string) => `/studioflow/catalogue/${id}`,
  projectDetail: (id: string) => `/studioflow/${id}`,
  projectFiles: (id: string) => `/studioflow/${id}/files`,
  projectPhase: (projectId: string, phaseId: string) => `/studioflow/${projectId}/phases/${phaseId}`,
  projectIteration: (projectId: string, phaseId: string, iterationId: string) => `/studioflow/${projectId}/phases/${phaseId}/iterations/${iterationId}`,
  projectMom: (projectId: string, momId: string) => `/studioflow/${projectId}/mom/${momId}`,
  settings: "/studioflow/settings",
} as const;

export type StudioFlowNavLink = { href: string; label: string; exact?: boolean; disabled?: boolean };

export const STUDIOFLOW_NAV_LINKS: {
  workspace: readonly StudioFlowNavLink[];
  extensions: readonly StudioFlowNavLink[];
  utility: readonly StudioFlowNavLink[];
} = {
  workspace: [
    { href: "/studioflow/projects", label: "Projects" },
    { href: "/studioflow", label: "My Activity", exact: true },
    { href: "/studioflow/upcoming", label: "Upcoming", disabled: true },
  ],
  extensions: [
    { href: "/studioflow/library", label: "Library" },
    { href: "/studioflow/catalogue", label: "Product Catalogue" },
    { href: "/studioflow/activity", label: "Activity", disabled: true },
    { href: "/studioflow/schedule", label: "Product Schedule", disabled: true },
  ],
  utility: [
    { href: "/studioflow/settings", label: "General Settings" },
  ],
};
