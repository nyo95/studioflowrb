import { randomUUID } from "node:crypto";

import { createAuditEventWriter } from "@platform/core/audit/persistence";
import { prisma } from "@platform/core/db";

import { CategoryService } from "../application/category-service";
import { BusinessTypeService } from "../application/business-type-service";
import { BrandService } from "../application/brand-service";
import { AuditQueryService } from "../application/audit-query";
import type { MasterDataUseCasePorts } from "../application/execution-context";
import { PartyService } from "../application/party-service";
import { SkuService } from "../application/sku-service";
import { PricingService } from "../application/pricing-service";
import { UnitService } from "../application/unit-service";
import { ImportExportService } from "../application/import-export";
import { prismaCategoryRepository } from "./category-repository-prisma";
import { createTransactionRunner } from "./transaction";
import { prismaBusinessTypeRepository, prismaPartyRepository } from "./party-repository-prisma";
import { prismaBrandRepository } from "./brand-repository-prisma";
import { prismaSkuRepository } from "./sku-repository-prisma";
import { prismaPricingRepository } from "./pricing-repository-prisma";
import { prismaAuditQueryRepository } from "./audit-query-prisma";
import { prismaUnitRepository } from "./unit-repository-prisma";
import { createWorkbookApplier } from "./workbook-applier";
import { prismaWorkbookStore } from "./workbook-store-prisma";
import { xlsxWorkbookCodec } from "./xlsx-workbook";

const commonPorts: MasterDataUseCasePorts = {
  runTransaction: createTransactionRunner(prisma),
  auditWriter: createAuditEventWriter(),
  generateId: randomUUID,
  now: () => new Date(),
};

export const categoryService = new CategoryService({
  ...commonPorts,
  categories: prismaCategoryRepository,
});

export const unitService = new UnitService({
  ...commonPorts,
  units: prismaUnitRepository,
});

export const partyService = new PartyService({
  ...commonPorts,
  parties: prismaPartyRepository,
});

export const businessTypeService = new BusinessTypeService({
  ...commonPorts,
  businessTypes: prismaBusinessTypeRepository,
});

export const brandService = new BrandService({
  ...commonPorts,
  brands: prismaBrandRepository,
});

export const skuService = new SkuService({
  ...commonPorts,
  skus: prismaSkuRepository,
});

export const pricingService = new PricingService({
  ...commonPorts,
  pricing: prismaPricingRepository,
});

export const auditQueryService = new AuditQueryService({
  runTransaction: commonPorts.runTransaction,
  auditEvents: prismaAuditQueryRepository,
});

export const importExportService = new ImportExportService({
  runTransaction: commonPorts.runTransaction,
  codec: xlsxWorkbookCodec,
  store: prismaWorkbookStore,
  applier: createWorkbookApplier({
    units: unitService,
    businessTypes: businessTypeService,
    categories: categoryService,
    parties: partyService,
    brands: brandService,
    skus: skuService,
    pricing: pricingService,
  }),
  auditWriter: commonPorts.auditWriter,
  now: commonPorts.now,
  generateId: commonPorts.generateId,
});
