import { requireRead, type ReadContext, type StudioFlowPorts } from "../shared";

/**
 * StudioFlow Library (owner, 2026-09-23; "wave 2+" per STUDIOFLOW-REWORK-CONTRACT.md §0/§14):
 * a read-only discovery surface over Master Data's Brand catalog. Never writes to Master Data —
 * this is a pure passthrough onto the public `listBrandLibraryReads` read port, the same one
 * Schedule's brand picker already uses (schedule/service.ts `listBrandChoices`).
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
  };
}

export type LibraryService = ReturnType<typeof createLibraryService>;
