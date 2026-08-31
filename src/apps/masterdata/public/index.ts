import type { PrismaClient } from "@/generated/prisma/client";
import { MASTERDATA_PERMISSIONS } from "../service";

export { MASTERDATA_PERMISSIONS };

export type BrandLibraryRead = {
  id: string;
  name: string;
  slug: string;
  notes: string | null;
  ownerVendor: { id: string; name: string } | null;
  categories: Array<{ id: string; name: string; slug: string }>;
  hashtags: Array<{ id: string; label: string; normalized: string }>;
  links: Array<{ id: string; kind: string; url: string; label: string | null }>;
};

export type MaterialPriceOption = {
  id: string;
  skuId: string;
  supplierVendor: { id: string; name: string; slug: string };
  amount: string;
  currency: string;
  unit: { id: string; code: string; name: string };
  sourceLink: { id: string; kind: string; url: string; label: string | null } | null;
};

export type PriceWorkRead = {
  id: string;
  name: string;
  slug: string;
  kind: "material-labor" | "labor";
  category: { id: string; name: string; slug: string };
  vendor: { id: string; name: string; slug: string };
  unit: { id: string; code: string; name: string };
  amount: string;
  currency: string;
  scopeNote: string | null;
  spec: unknown;
  dimDisplay: string | null;
  notes: string | null;
};

export function createMasterDataPublicRead(db: PrismaClient) {
  return {
    async getBrandLibraryRead(brandIdOrSlug: string): Promise<BrandLibraryRead | null> {
      const brand = await db.brand.findFirst({
        where: {
          deleted_at: null,
          OR: [{ id: brandIdOrSlug }, { slug: brandIdOrSlug }],
        },
        select: {
          id: true,
          name: true,
          slug: true,
          notes: true,
          owner_vendor: { select: { id: true, name: true } },
          categories: {
            where: { category: { status: "ACTIVE" } },
            select: { category: { select: { id: true, name: true, slug: true } } },
          },
          hashtags: { select: { id: true, label: true, normalized: true } },
          links: { select: { id: true, kind: true, url: true, label: true } },
        },
      });
      if (!brand) return null;
      return {
        id: brand.id,
        name: brand.name,
        slug: brand.slug,
        notes: brand.notes,
        ownerVendor: brand.owner_vendor,
        categories: brand.categories.map((c) => c.category),
        hashtags: brand.hashtags,
        links: brand.links,
      };
    },

    async listBrandLibraryReads(filter?: { search?: string; categoryId?: string; hashtag?: string }): Promise<BrandLibraryRead[]> {
      const search = filter?.search?.trim();
      const hashtag = filter?.hashtag?.trim().toLowerCase().replace(/^#+/, "");

      const brands = await db.brand.findMany({
        where: {
          deleted_at: null,
          ...(filter?.categoryId ? { categories: { some: { category_id: filter.categoryId, category: { status: "ACTIVE" } } } } : {}),
          ...(hashtag ? { hashtags: { some: { normalized: hashtag } } } : {}),
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { slug: { contains: search, mode: "insensitive" } },
                  { hashtags: { some: { label: { contains: search, mode: "insensitive" } } } },
                ],
              }
            : {}),
        },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          slug: true,
          notes: true,
          owner_vendor: { select: { id: true, name: true } },
          categories: {
            where: { category: { status: "ACTIVE" } },
            select: { category: { select: { id: true, name: true, slug: true } } },
          },
          hashtags: { select: { id: true, label: true, normalized: true } },
          links: { select: { id: true, kind: true, url: true, label: true } },
        },
      });

      return brands.map((brand) => ({
        id: brand.id,
        name: brand.name,
        slug: brand.slug,
        notes: brand.notes,
        ownerVendor: brand.owner_vendor,
        categories: brand.categories.map((c) => c.category),
        hashtags: brand.hashtags,
        links: brand.links,
      }));
    },

    async getSkuPricingOptions(skuId: string): Promise<MaterialPriceOption[]> {
      const prices = await db.priceMaterial.findMany({
        where: {
          sku_id: skuId,
          deleted_at: null,
          sku: { deleted_at: null },
          supplier_vendor: { deleted_at: null },
          unit: { status: "ACTIVE" },
        },
        orderBy: { amount: "asc" },
        select: {
          id: true,
          sku_id: true,
          amount: true,
          currency: true,
          supplier_vendor: { select: { id: true, name: true, slug: true } },
          unit: { select: { id: true, code: true, name: true } },
          source_link: { select: { id: true, kind: true, url: true, label: true } },
        },
      });

      return prices.map((p) => ({
        id: p.id,
        skuId: p.sku_id,
        supplierVendor: p.supplier_vendor,
        amount: p.amount.toString(),
        currency: p.currency,
        unit: p.unit,
        sourceLink: p.source_link,
      }));
    },

    async listWorkPricesRead(filter?: {
      kind?: "material-labor" | "labor";
      categoryId?: string;
      vendorId?: string;
    }): Promise<PriceWorkRead[]> {
      const results: PriceWorkRead[] = [];

      if (!filter?.kind || filter.kind === "material-labor") {
        const ml = await db.priceMaterialLabor.findMany({
          where: {
            deleted_at: null,
            ...(filter?.categoryId ? { category_id: filter.categoryId } : {}),
            ...(filter?.vendorId ? { vendor_id: filter.vendorId } : {}),
            category: { status: "ACTIVE", kind: "WORK" },
            vendor: { deleted_at: null },
            unit: { status: "ACTIVE" },
          },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            slug: true,
            amount: true,
            currency: true,
            scope_note: true,
            spec: true,
            dim_display: true,
            notes: true,
            category: { select: { id: true, name: true, slug: true } },
            vendor: { select: { id: true, name: true, slug: true } },
            unit: { select: { id: true, code: true, name: true } },
          },
        });
        results.push(
          ...ml.map((row) => ({
            id: row.id,
            name: row.name,
            slug: row.slug,
            kind: "material-labor" as const,
            category: row.category,
            vendor: row.vendor,
            unit: row.unit,
            amount: row.amount.toString(),
            currency: row.currency,
            scopeNote: row.scope_note,
            spec: row.spec,
            dimDisplay: row.dim_display,
            notes: row.notes,
          })),
        );
      }

      if (!filter?.kind || filter.kind === "labor") {
        const labor = await db.priceLabor.findMany({
          where: {
            deleted_at: null,
            ...(filter?.categoryId ? { category_id: filter.categoryId } : {}),
            ...(filter?.vendorId ? { vendor_id: filter.vendorId } : {}),
            category: { status: "ACTIVE", kind: "WORK" },
            vendor: { deleted_at: null },
            unit: { status: "ACTIVE" },
          },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            slug: true,
            amount: true,
            currency: true,
            spec: true,
            dim_display: true,
            notes: true,
            category: { select: { id: true, name: true, slug: true } },
            vendor: { select: { id: true, name: true, slug: true } },
            unit: { select: { id: true, code: true, name: true } },
          },
        });
        results.push(
          ...labor.map((row) => ({
            id: row.id,
            name: row.name,
            slug: row.slug,
            kind: "labor" as const,
            category: row.category,
            vendor: row.vendor,
            unit: row.unit,
            amount: row.amount.toString(),
            currency: row.currency,
            scopeNote: null,
            spec: row.spec,
            dimDisplay: row.dim_display,
            notes: row.notes,
          })),
        );
      }

      return results.sort((a, b) => a.name.localeCompare(b.name));
    },
  };
}
