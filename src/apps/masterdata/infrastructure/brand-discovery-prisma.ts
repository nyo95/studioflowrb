import type { TransactionClient } from "@platform/core/db";
import type { BrandDiscoveryRepository } from "../application/brand-discovery";

export const prismaBrandDiscoveryRepository: BrandDiscoveryRepository = {
  async loadLiveBrands(tx: TransactionClient) {
    const brands = await tx.brand.findMany({
      where: { deleted_at: null },
      include: {
        categories: { where: { category: { deleted_at: null, kind: "PRODUCT" } }, include: { category: true } },
        links: true,
        skus: { where: { deleted_at: null, status: "ACTIVE" }, include: { media: true } },
      },
    });
    return brands.filter((brand) => brand.categories.length > 0).map((brand) => ({
      id: brand.id, name: brand.name,
      categories: brand.categories.map(({ category }) => ({ id: category.id, name: category.name, slug: category.slug, synonyms: category.search_synonyms, sortOrder: category.sort_order })),
      links: brand.links.map((link) => ({ kind: link.kind, url: link.url, label: link.label })),
      activeSkus: brand.skus.map((sku) => ({ id: sku.id, code: sku.code, name: sku.name, media: sku.media.map((item) => ({ kind: item.kind, url: item.url, label: item.label })) })),
    }));
  },
};
