import { requirePermission } from "@platform/core/rbac";
import type { TransactionClient } from "@platform/core/db";

import type { MasterDataExecutionContext, TransactionRunner } from "./execution-context";
import { MASTERDATA_DISCOVERY_READ } from "./masterdata-permissions";

export type DiscoveryLink = { kind: string; url: string; label: string | null };
export type DiscoveryCategory = {
  id: string;
  name: string;
  slug: string;
  synonyms: readonly string[];
  sortOrder: number;
};
export type DiscoverySku = {
  id: string;
  code: string | null;
  name: string;
  media: readonly { kind: string; url: string; label: string | null }[];
};
export type DiscoveryBrandRecord = {
  id: string;
  name: string;
  categories: readonly DiscoveryCategory[];
  links: readonly DiscoveryLink[];
  activeSkus: readonly DiscoverySku[];
};

export interface BrandDiscoveryRepository {
  loadLiveBrands(tx: TransactionClient): Promise<DiscoveryBrandRecord[]>;
}

export type BrandDiscoveryResult = Readonly<{
  id: string;
  name: string;
  categories: readonly Readonly<{ id: string; name: string; slug: string }>[];
  links: readonly Readonly<DiscoveryLink>[];
  reasons: readonly string[];
}>;

const PUBLIC_LINK_KINDS = new Set([
  "WEBSITE", "INSTAGRAM", "FACEBOOK", "TIKTOK", "YOUTUBE", "LINKEDIN", "CATALOG", "DRIVE", "MARKETPLACE",
]);

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

type Match = { tier: number; reasons: string[] };

export function matchDiscoveryBrand(brand: DiscoveryBrandRecord, rawQuery: string): Match | null {
  const query = normalize(rawQuery);
  if (!query) return { tier: 99, reasons: [] };
  const name = normalize(brand.name);
  const reasons: { tier: number; text: string }[] = [];
  if (name === query) reasons.push({ tier: 1, text: `Brand name exactly matches “${rawQuery.trim()}”.` });
  else if (name.startsWith(query)) reasons.push({ tier: 2, text: `Brand name starts with “${rawQuery.trim()}”.` });
  else if (name.includes(query)) reasons.push({ tier: 7, text: `Brand name contains “${rawQuery.trim()}”.` });

  for (const category of brand.categories) {
    const categoryName = normalize(category.name);
    const slug = normalize(category.slug.replace(/-/g, " "));
    const synonyms = category.synonyms.map(normalize);
    if (categoryName === query || slug === query) reasons.push({ tier: 3, text: `Assigned category ${category.name} matches exactly.` });
    else if (synonyms.includes(query)) reasons.push({ tier: 4, text: `Assigned category ${category.name} has an exact synonym match.` });
    else if ([categoryName, slug, ...synonyms].some((value) => value.startsWith(query) || value.includes(query))) {
      reasons.push({ tier: 5, text: `Assigned category ${category.name} contains the query.` });
    }
  }
  for (const sku of brand.activeSkus) {
    const code = normalize(sku.code ?? "");
    const skuName = normalize(sku.name);
    if ((code && (code === query || code.startsWith(query))) || skuName === query || skuName.startsWith(query)) {
      reasons.push({ tier: 6, text: `Active SKU ${sku.code ?? sku.name} matches the query.` });
    } else if (skuName.includes(query)) {
      reasons.push({ tier: 7, text: `Active SKU ${sku.name} contains the query.` });
    }
  }
  if (!reasons.length) return null;
  return { tier: Math.min(...reasons.map((reason) => reason.tier)), reasons: [...new Set(reasons.map((reason) => reason.text))] };
}

export class BrandDiscoveryService {
  constructor(private readonly ports: { runTransaction: TransactionRunner; brands: BrandDiscoveryRepository }) {}

  async search(context: MasterDataExecutionContext, input: { query: string; categoryId?: string; categorySlug?: string; offset?: number; limit?: number }) {
    requirePermission(context.grants, MASTERDATA_DISCOVERY_READ);
    const offset = Math.max(0, input.offset ?? 0);
    const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
    const records = await this.ports.runTransaction((tx) => this.ports.brands.loadLiveBrands(tx));
    const categoryId = input.categoryId;
    const categorySlug = input.categorySlug ? normalize(input.categorySlug) : undefined;
    const matches = records
      .filter((brand) => brand.categories.some((category) => (!categoryId || category.id === categoryId) && (!categorySlug || normalize(category.slug) === categorySlug)))
      .map((brand) => ({ brand, match: matchDiscoveryBrand(brand, input.query) }))
      .filter((entry): entry is { brand: DiscoveryBrandRecord; match: Match } => entry.match !== null)
      .sort((left, right) => left.match.tier - right.match.tier || right.match.reasons.length - left.match.reasons.length || normalize(left.brand.name).localeCompare(normalize(right.brand.name)) || left.brand.id.localeCompare(right.brand.id));
    return {
      total: matches.length,
      items: matches.slice(offset, offset + limit).map(({ brand, match }): BrandDiscoveryResult => ({
        id: brand.id,
        name: brand.name,
        categories: brand.categories.map(({ id, name, slug }) => ({ id, name, slug })),
        links: brand.links.filter((link) => PUBLIC_LINK_KINDS.has(link.kind)).map((link) => ({ ...link })),
        reasons: match.reasons,
      })),
    };
  }

  async suggestions(context: MasterDataExecutionContext, input: { offset?: number; limit?: number } = {}) {
    requirePermission(context.grants, MASTERDATA_DISCOVERY_READ);
    const records = await this.ports.runTransaction((tx) => this.ports.brands.loadLiveBrands(tx));
    const counts = new Map<string, { category: DiscoveryCategory; brandIds: Set<string> }>();
    for (const brand of records) for (const category of brand.categories) {
      const entry = counts.get(category.id) ?? { category, brandIds: new Set<string>() };
      entry.brandIds.add(brand.id); counts.set(category.id, entry);
    }
    const offset = Math.max(0, input.offset ?? 0), limit = Math.max(1, Math.min(input.limit ?? 20, 100));
    const ranked = [...counts.values()].sort((a, b) => b.brandIds.size - a.brandIds.size || a.category.sortOrder - b.category.sortOrder || normalize(a.category.name).localeCompare(normalize(b.category.name)) || a.category.id.localeCompare(b.category.id));
    return { total: ranked.length, items: ranked.slice(offset, offset + limit).map(({ category, brandIds }) => ({ id: category.id, name: category.name, slug: category.slug, brandCount: brandIds.size })) };
  }

  async detail(context: MasterDataExecutionContext, brandId: string) {
    requirePermission(context.grants, MASTERDATA_DISCOVERY_READ);
    const records = await this.ports.runTransaction((tx) => this.ports.brands.loadLiveBrands(tx));
    const brand = records.find((candidate) => candidate.id === brandId);
    if (!brand) return null;
    return Object.freeze({
      id: brand.id, name: brand.name,
      categories: brand.categories.map(({ id, name, slug }) => ({ id, name, slug })),
      links: brand.links.filter((link) => PUBLIC_LINK_KINDS.has(link.kind)).map((link) => ({ ...link })),
      skus: brand.activeSkus.map((sku) => ({ id: sku.id, code: sku.code, name: sku.name, media: sku.media.map((item) => ({ ...item })) })),
    });
  }
}
