/**
 * Master Data MVP seed runner (MD-01).
 *
 * Applies the canonical inventory from prisma/seed-inventory.ts to the database:
 * - Idempotent by immutable canonical code/slug: applying seeds twice produces
 *   no duplicate rows.
 * - Create-if-missing only: existing rows are never updated, so later staff
 *   edits of labels/descriptions are not overwritten by re-seeding.
 * - WORK category paths are produced by the locked Category slug/path rules in
 *   src/apps/masterdata/domain/category-rules.ts, never hardcoded here.
 *
 * Invoked by the Prisma CLI through `migrations.seed` in prisma.config.ts
 * (e.g. after `prisma migrate reset`) or directly via `tsx prisma/seed.ts`.
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import { PrismaClient } from "../src/generated/prisma/client";
import { buildCategoryPath, categorySlug } from "../src/apps/masterdata/domain/category-rules";

import {
  BUSINESS_TYPE_SEEDS,
  PRODUCT_CATEGORY_SEEDS,
  UNIT_SEEDS,
  WORK_CHILD_SEEDS,
  WORK_ROOT_SEEDS,
} from "./seed-inventory";

type SeedClient = Pick<
  PrismaClient,
  "unit" | "businessType" | "category"
>;

/// Applies the locked inventory. Safe to call repeatedly; only missing rows
/// are created.
export async function runSeed(prisma: SeedClient): Promise<void> {
  await seedUnits(prisma);
  await seedBusinessTypes(prisma);
  await seedCategories(prisma);
}

async function seedUnits(prisma: SeedClient): Promise<void> {
  for (const [index, unit] of UNIT_SEEDS.entries()) {
    const existing = await prisma.unit.findFirst({
      where: { code: unit.code },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.unit.create({
      data: {
        code: unit.code,
        label: unit.label,
        aliases: [...unit.aliases],
        usages: [...unit.usages],
        sort_order: index,
      },
    });
  }
}

async function seedBusinessTypes(prisma: SeedClient): Promise<void> {
  for (const [index, businessType] of BUSINESS_TYPE_SEEDS.entries()) {
    const existing = await prisma.businessType.findFirst({
      where: { code: businessType.code },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.businessType.create({
      data: {
        code: businessType.code,
        label: businessType.label,
        sort_order: index,
      },
    });
  }
}

async function seedCategories(prisma: SeedClient): Promise<void> {
  // PRODUCT rows are flat: parent_id and path stay null in the implemented seed shape.
  for (const [index, category] of PRODUCT_CATEGORY_SEEDS.entries()) {
    const slug = categorySlug(category.name);
    const existing = await prisma.category.findFirst({
      where: { kind: "PRODUCT", slug },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.category.create({
      data: {
        kind: "PRODUCT",
        name: category.name,
        slug,
        parent_id: null,
        path: null,
        search_synonyms: [...category.search_synonyms],
        sort_order: index,
      },
    });
  }

  // WORK roots first so children can resolve their parent within this run.
  for (const [index, root] of WORK_ROOT_SEEDS.entries()) {
    const slug = categorySlug(root.name);
    const existing = await prisma.category.findFirst({
      where: { kind: "WORK", slug },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.category.create({
      data: {
        kind: "WORK",
        name: root.name,
        slug,
        parent_id: null,
        path: buildCategoryPath(null, root.name),
        sort_order: index,
      },
    });
  }

  for (const child of WORK_CHILD_SEEDS.entries()) {
    const [, spec] = child;
    const parentSlug = categorySlug(spec.parent);
    const parent = await prisma.category.findFirst({
      where: { kind: "WORK", slug: parentSlug },
      select: { id: true, path: true },
    });
    if (!parent) {
      throw new Error(`WORK seed child "${spec.name}" references missing WORK root "${spec.parent}".`);
    }
    const slug = categorySlug(spec.name);
    const existing = await prisma.category.findFirst({
      where: { kind: "WORK", slug },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.category.create({
      data: {
        kind: "WORK",
        name: spec.name,
        slug,
        parent_id: parent.id,
        path: buildCategoryPath(parent.path, spec.name),
        sort_order: WORK_ROOT_SEEDS.length + child[0],
      },
    });
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run the Master Data seed.");
  }
  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  try {
    await runSeed(prisma);
    console.log("Master Data seed applied (idempotent).");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
