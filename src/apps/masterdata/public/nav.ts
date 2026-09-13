/**
 * Master Data client-safe route and navigation constants.
 *
 * This module has NO server-side imports (no Prisma, no Node built-ins) so it
 * can be safely imported by "use client" components without pulling
 * server-only service code into the browser bundle.
 */

export const MASTERDATA_ROUTES = {
  root: "/masterdata",
  brands: "/masterdata/brands",
  vendors: "/masterdata/vendors",
  pricing: "/masterdata/pricing",
  skus: "/masterdata/skus",
  units: "/masterdata/units",
  categories: "/masterdata/categories",
  deletions: "/masterdata/deletions",
} as const;

export type MasterDataNavLink = { href: string; label: string; exact?: boolean };

export const MASTERDATA_NAV_LINKS: readonly MasterDataNavLink[] = [
  { href: "/masterdata", label: "Overview", exact: true },
  { href: "/masterdata/brands", label: "Brands" },
  { href: "/masterdata/vendors", label: "Suppliers" },
  { href: "/masterdata/pricing", label: "Pricing" },
];
