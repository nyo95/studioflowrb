import type { Prisma } from "@/generated/prisma/client";
import type { BrandGraphInput, BrandRecord, BrandRepository } from "../application/brand-repository";

const INCLUDE = {
  categories: { select: { id: true, category_id: true, sort_order: true }, orderBy: [{ sort_order: "asc" as const }, { id: "asc" as const }] },
  suppliers: { select: { id: true, party_id: true, is_authorized: true, notes: true }, orderBy: { id: "asc" as const } },
  links: { select: { id: true, kind: true, url: true, archive_url: true, label: true, sort_order: true }, orderBy: [{ sort_order: "asc" as const }, { id: "asc" as const }] },
} satisfies Prisma.BrandInclude;
type Row = Prisma.BrandGetPayload<{ include: typeof INCLUDE }>;
function map(row: Row): BrandRecord { return { id: row.id, name: row.name, slug: row.slug, ownerPartyId: row.owner_party_id, notes: row.notes, categories: row.categories.map(x => ({ id: x.id, categoryId: x.category_id, sortOrder: x.sort_order })), suppliers: row.suppliers.map(x => ({ id: x.id, partyId: x.party_id, isAuthorized: x.is_authorized, notes: x.notes })), links: row.links.map(x => ({ id: x.id, kind: x.kind, url: x.url, archiveUrl: x.archive_url, label: x.label, sortOrder: x.sort_order })), createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at }; }
async function read(tx: Parameters<BrandRepository["findById"]>[0], id: string) { return map(await tx.brand.findUniqueOrThrow({ where: { id }, include: INCLUDE })); }

export const prismaBrandRepository: BrandRepository = {
  async list(tx, filter) { return (await tx.brand.findMany({ where: { deleted_at: filter.includeDeleted ? undefined : null, categories: filter.categoryId ? { some: { category_id: filter.categoryId } } : undefined, OR: filter.query ? [{ name: { contains: filter.query, mode: "insensitive" } }, { slug: { contains: filter.query, mode: "insensitive" } }] : undefined }, include: INCLUDE, orderBy: [{ name: "asc" }, { id: "asc" }] })).map(map); },
  async findById(tx, id) { const row = await tx.brand.findFirst({ where: { id }, include: INCLUDE }); return row ? map(row) : null; },
  async findLiveIdentityConflict(tx, name, slug) { const row = await tx.brand.findFirst({ where: { deleted_at: null, OR: [{ name: { equals: name, mode: "insensitive" } }, { slug }] }, include: INCLUDE }); return row ? map(row) : null; },
  async loadCategoryCandidates(tx, ids) { const rows = await tx.category.findMany({ where: { id: { in: [...ids] } }, select: { id: true, kind: true, deleted_at: true } }); return rows.map(x => ({ id: x.id, kind: x.kind, deletedAt: x.deleted_at })); },
  async loadSupplierCandidates(tx, ids) { const rows = await tx.party.findMany({ where: { id: { in: [...ids] } }, select: { id: true, deleted_at: true, roles: { select: { role: true } } } }); return rows.map(x => ({ id: x.id, deletedAt: x.deleted_at, roles: x.roles.map(r => r.role) })); },
  async isLiveOwnerCandidate(tx, id) { return (await tx.party.count({ where: { id, deleted_at: null } })) === 1; },
  async countDeleteReferences(tx, id) { const liveSkus = await tx.sku.count({ where: { brand_id: id, deleted_at: null } }); const scopedContacts = await tx.partyContact.count({ where: { brand_id: id, party: { deleted_at: null } } }); return { liveSkus, scopedContacts }; },
  async create(tx, input) { await tx.brand.create({ data: { id: input.id, name: input.name, slug: input.slug, owner_party_id: input.ownerPartyId, notes: input.notes }, select: { id: true } }); await writeChildren(tx, input); return read(tx, input.id); },
  async update(tx, id, input) { await tx.brand.update({ where: { id }, data: { name: input.name, slug: input.slug, owner_party_id: input.ownerPartyId, notes: input.notes }, select: { id: true } }); await syncChildren(tx, input); return read(tx, id); },
  async setDeletedAt(tx, id, deletedAt) { await tx.brand.update({ where: { id }, data: { deleted_at: deletedAt }, select: { id: true } }); return read(tx, id); },
};

async function writeChildren(tx: Parameters<BrandRepository["create"]>[0], input: BrandGraphInput) {
  if (input.categories.length) await tx.brandCategory.createMany({ data: input.categories.map(x => ({ id: x.id, brand_id: input.id, category_id: x.categoryId, sort_order: x.sortOrder })) });
  if (input.suppliers.length) await tx.brandSupplier.createMany({ data: input.suppliers.map(x => ({ id: x.id, brand_id: input.id, party_id: x.partyId, is_authorized: x.isAuthorized, notes: x.notes })) });
  if (input.links.length) await tx.brandLink.createMany({ data: input.links.map(x => ({ id: x.id, brand_id: input.id, kind: x.kind, url: x.url, archive_url: x.archiveUrl, label: x.label, sort_order: x.sortOrder })) });
}

async function syncChildren(tx: Parameters<BrandRepository["update"]>[0], input: BrandGraphInput) {
  await tx.brandCategory.deleteMany({ where: { brand_id: input.id, id: { notIn: input.categories.map(x => x.id) } } });
  for (const row of input.categories) {
    const result = await tx.brandCategory.updateMany({ where: { id: row.id, brand_id: input.id }, data: { category_id: row.categoryId, sort_order: row.sortOrder } });
    if (!result.count) await tx.brandCategory.create({ data: { id: row.id, brand_id: input.id, category_id: row.categoryId, sort_order: row.sortOrder }, select: { id: true } });
  }
  await tx.brandSupplier.deleteMany({ where: { brand_id: input.id, id: { notIn: input.suppliers.map(x => x.id) } } });
  for (const row of input.suppliers) {
    const result = await tx.brandSupplier.updateMany({ where: { id: row.id, brand_id: input.id }, data: { party_id: row.partyId, is_authorized: row.isAuthorized, notes: row.notes } });
    if (!result.count) await tx.brandSupplier.create({ data: { id: row.id, brand_id: input.id, party_id: row.partyId, is_authorized: row.isAuthorized, notes: row.notes }, select: { id: true } });
  }
  await tx.brandLink.deleteMany({ where: { brand_id: input.id, id: { notIn: input.links.map(x => x.id) } } });
  for (const row of input.links) {
    const result = await tx.brandLink.updateMany({ where: { id: row.id, brand_id: input.id }, data: { kind: row.kind, url: row.url, archive_url: row.archiveUrl, label: row.label, sort_order: row.sortOrder } });
    if (!result.count) await tx.brandLink.create({ data: { id: row.id, brand_id: input.id, kind: row.kind, url: row.url, archive_url: row.archiveUrl, label: row.label, sort_order: row.sortOrder }, select: { id: true } });
  }
}
