/**
 * The only supported cross-app Master Data surface.
 *
 * It exposes immutable DTO-returning operations, never Prisma models,
 * repositories, mutations, or internal application services.
 */
import { prisma } from "@platform/core/db";
import { BrandDiscoveryService } from "../application/brand-discovery";
import { PublicReadService } from "../application/public-read";
import { prismaBrandDiscoveryRepository } from "../infrastructure/brand-discovery-prisma";
import { prismaPublicReadRepository } from "../infrastructure/public-read-prisma";
import { createTransactionRunner } from "../infrastructure/transaction";

export type { BrandDiscoveryResult } from "../application/brand-discovery";
export type { MasterDataExecutionContext } from "../application/execution-context";

const runTransaction = createTransactionRunner(prisma);
const discovery = new BrandDiscoveryService({ runTransaction, brands: prismaBrandDiscoveryRepository });
const reads = new PublicReadService({ runTransaction, reads: prismaPublicReadRepository });

export const masterDataPublic = Object.freeze({
  searchBrands: discovery.search.bind(discovery),
  suggestProductCategories: discovery.suggestions.bind(discovery),
  getBrandCatalog: discovery.detail.bind(discovery),
  searchMaterialCandidates: reads.searchMaterials.bind(reads),
  getMaterialCandidate: reads.getMaterial.bind(reads),
  searchWorkPriceCandidates: reads.searchWorkPrices.bind(reads),
  getWorkPriceCandidate: reads.getWorkPrice.bind(reads),
});
