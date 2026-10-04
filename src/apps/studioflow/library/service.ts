import { requireRead, type ReadContext, type StudioFlowPorts } from "../shared";
import { discoverBrandWebsite } from "./website-snapshot";

/** How many Brand websites one read may cover: one catalogue page of cards. */
export const LIBRARY_WEBSITE_BATCH = 24;

/**
 * StudioFlow Library (owner, 2026-09-23; "wave 2+" per STUDIOFLOW-REWORK-CONTRACT.md §0/§14):
 * a read-only discovery surface over Master Data's Brand catalog. Never writes to Master Data —
 * this is a pure passthrough onto the public `listBrandLibraryReads` read port, the same one
 * Schedule's brand picker already uses (schedule/service.ts `listBrandChoices`).
 *
 * Brand rows and their website reads are separate (external audit, 2026-10-04): the page renders the
 * catalogue from Master Data at once, and the screen asks for website images and offerings in batches,
 * the visible page first. Before, every Brand website was read before the first card could render.
 */
export function createLibraryService(ports: StudioFlowPorts) {
  return {
    async listBrands(input: ReadContext & { search?: string }) {
      requireRead(input.grants);
      const brands = await ports.masterData.listBrandLibraryReads({ search: input.search });
      return brands.map((brand) => ({
        id: brand.id,
        name: brand.name,
        slug: brand.slug,
        notes: brand.notes,
        ownerVendor: brand.ownerVendor,
        categories: brand.categories,
        hashtags: brand.hashtags,
        links: brand.links,
      }));
    },

    /**
     * Website image and offerings for up to one batch of Brands. Only links stored in Master Data are
     * fetched (never a URL from the caller), through the cached, bounded, SSRF-screened website reader.
     */
    async readBrandWebsites(input: ReadContext & { brandIds: readonly string[] }) {
      requireRead(input.grants);
      const wanted = new Set(input.brandIds.slice(0, LIBRARY_WEBSITE_BATCH));
      if (wanted.size === 0) return [];
      const brands = (await ports.masterData.listBrandLibraryReads()).filter((brand) => wanted.has(brand.id));
      return Promise.all(brands.map(async (brand) => {
        const { imageUrl, catalogue } = await discoverBrandWebsite(brand.links);
        return { id: brand.id, imageUrl, websiteCatalogue: catalogue };
      }));
    },
  };
}

export type LibraryService = ReturnType<typeof createLibraryService>;
