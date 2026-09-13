/**
 * BQ client-safe route and navigation constants.
 *
 * This module has NO server-side imports (no Prisma, no Node built-ins) so it
 * can be safely imported by "use client" components without pulling
 * server-only service code into the browser bundle.
 */

export const BQ_ROUTES = {
  root: "/bq",
  new: "/bq/new",
  library: "/bq/library",
  project: (id: string) => `/bq/${id}`,
  projectEdit: (id: string) => `/bq/${id}/edit`,
} as const;

export type BqNavLink = { href: string; label: string; exact?: boolean };

export const BQ_NAV_LINKS: readonly BqNavLink[] = [
  { href: "/bq", label: "Projects", exact: true },
  { href: "/bq/library", label: "BQ Library" },
];
