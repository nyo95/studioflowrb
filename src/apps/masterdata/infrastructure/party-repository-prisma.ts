import type { TransactionClient } from "@platform/core/db";
import type { Prisma } from "@/generated/prisma/client";

import type { PartyDeleteReferences, PartyRoleReferences } from "../domain/party-rules";
import type {
  BrandContactScopeRecord,
  BusinessTypeRecord,
  BusinessTypeRepository,
  BusinessTypeWriteInput,
  PartyGraphInput,
  PartyListFilter,
  PartyRecord,
  PartyRepository,
} from "../application/party-repository";

const PARTY_INCLUDE = {
  roles: { select: { role: true }, orderBy: { role: "asc" as const } },
  business_types: { select: { business_type_id: true }, orderBy: { business_type_id: "asc" as const } },
  contacts: { select: { id: true, person_name: true, job_title: true, phone: true, email: true, is_primary: true, notes: true, brand_id: true }, orderBy: { id: "asc" as const } },
  links: { select: { id: true, kind: true, url: true, archive_url: true, label: true, sort_order: true }, orderBy: [{ sort_order: "asc" as const }, { id: "asc" as const }] },
} satisfies Prisma.PartyInclude;

type PartyRow = Prisma.PartyGetPayload<{ include: typeof PARTY_INCLUDE }>;

function toPartyRecord(row: PartyRow): PartyRecord {
  return {
    id: row.id, name: row.name, slug: row.slug, type: row.type,
    legalName: row.legal_name, address: row.address, notes: row.notes,
    roles: row.roles.map((entry) => entry.role),
    businessTypeIds: row.business_types.map((entry) => entry.business_type_id),
    contacts: row.contacts.map((entry) => ({ id: entry.id, personName: entry.person_name, jobTitle: entry.job_title, phone: entry.phone, email: entry.email, isPrimary: entry.is_primary, notes: entry.notes, brandId: entry.brand_id })),
    links: row.links.map((entry) => ({ id: entry.id, kind: entry.kind, url: entry.url, archiveUrl: entry.archive_url, label: entry.label, sortOrder: entry.sort_order })),
    createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at,
  };
}

async function readParty(tx: TransactionClient, id: string): Promise<PartyRecord> {
  const row = await tx.party.findUniqueOrThrow({ where: { id }, include: PARTY_INCLUDE });
  return toPartyRecord(row);
}

function childWrites(input: PartyGraphInput) {
  return {
    roles: input.roles.map((role) => ({ role })),
    businessTypes: input.businessTypeIds.map((businessTypeId) => ({ business_type_id: businessTypeId })),
    contacts: input.contacts.map((contact) => ({ id: contact.id, person_name: contact.personName, job_title: contact.jobTitle, phone: contact.phone, email: contact.email, is_primary: contact.isPrimary, notes: contact.notes, brand_id: contact.brandId })),
    links: input.links.map((link) => ({ id: link.id, kind: link.kind, url: link.url, archive_url: link.archiveUrl, label: link.label, sort_order: link.sortOrder })),
  };
}

export const prismaPartyRepository: PartyRepository = {
  async list(tx, filter: PartyListFilter) {
    const rows = await tx.party.findMany({
      where: {
        deleted_at: filter.includeDeleted ? undefined : null,
        type: filter.type,
        roles: filter.role ? { some: { role: filter.role } } : undefined,
        OR: filter.query ? [{ name: { contains: filter.query, mode: "insensitive" } }, { legal_name: { contains: filter.query, mode: "insensitive" } }, { slug: { contains: filter.query, mode: "insensitive" } }] : undefined,
      },
      include: PARTY_INCLUDE,
      orderBy: [{ name: filter.sortDirection ?? "asc" }, { id: "asc" }],
    });
    return rows.map(toPartyRecord);
  },
  async listEligible(tx, role) {
    const rows = await tx.party.findMany({ where: { deleted_at: null, roles: { some: { role } } }, include: PARTY_INCLUDE, orderBy: [{ name: "asc" }, { id: "asc" }] });
    return rows.map(toPartyRecord);
  },
  async findById(tx, id) {
    const row = await tx.party.findFirst({ where: { id }, include: PARTY_INCLUDE });
    return row ? toPartyRecord(row) : null;
  },
  async findLiveIdentityConflict(tx, name, slug) {
    const row = await tx.party.findFirst({ where: { deleted_at: null, OR: [{ name: { equals: name, mode: "insensitive" } }, { slug }] }, include: PARTY_INCLUDE });
    return row ? toPartyRecord(row) : null;
  },
  async findMissingLiveBusinessTypeIds(tx, ids) {
    if (!ids.length) return [];
    const rows = await tx.businessType.findMany({ where: { id: { in: [...ids] }, deleted_at: null }, select: { id: true } });
    const found = new Set(rows.map(({ id }) => id));
    return ids.filter((id) => !found.has(id));
  },
  async loadBrandContactScope(tx, partyId, brandId): Promise<BrandContactScopeRecord | null> {
    const brand = await tx.brand.findFirst({
      where: { id: brandId },
      select: { id: true, deleted_at: true, owner_party_id: true, suppliers: { where: { party_id: partyId }, select: { id: true }, take: 1 } },
    });
    return brand ? { brandId: brand.id, brandDeletedAt: brand.deleted_at, partyOwnsBrand: brand.owner_party_id === partyId, hasLiveBrandSupplier: brand.deleted_at === null && brand.suppliers.length > 0 } : null;
  },
  async countRoleReferences(tx, partyId): Promise<PartyRoleReferences> {
    const liveBrandSuppliers = await tx.brandSupplier.count({ where: { party_id: partyId, brand: { deleted_at: null } } });
    const canonicalSkuPrices = await tx.skuPrice.count({ where: { supplier_party_id: partyId } });
    const liveWorkPrices = await tx.workPrice.count({ where: { vendor_party_id: partyId, deleted_at: null } });
    return { liveBrandSuppliers, canonicalSkuPrices, liveWorkPrices };
  },
  async countDeleteReferences(tx, partyId): Promise<PartyDeleteReferences> {
    const roleReferences = await this.countRoleReferences(tx, partyId);
    const liveOwnedBrands = await tx.brand.count({ where: { owner_party_id: partyId, deleted_at: null } });
    return { ...roleReferences, liveOwnedBrands };
  },
  async create(tx, input) {
    const children = childWrites(input);
    await tx.party.create({ data: {
      id: input.id, name: input.name, slug: input.slug, type: input.type, legal_name: input.legalName, address: input.address, notes: input.notes,
    }, select: { id: true } });
    if (children.roles.length) await tx.partyRole.createMany({ data: children.roles.map((row) => ({ ...row, party_id: input.id })) });
    if (children.businessTypes.length) await tx.partyBusinessType.createMany({ data: children.businessTypes.map((row) => ({ ...row, party_id: input.id })) });
    if (children.contacts.length) await tx.partyContact.createMany({ data: children.contacts.map((row) => ({ ...row, party_id: input.id })) });
    if (children.links.length) await tx.partyLink.createMany({ data: children.links.map((row) => ({ ...row, party_id: input.id })) });
    return readParty(tx, input.id);
  },
  async update(tx, id, input) {
    await tx.party.update({ where: { id }, data: { name: input.name, slug: input.slug, type: input.type, legal_name: input.legalName, address: input.address, notes: input.notes }, select: { id: true } });
    await tx.partyRole.deleteMany({ where: { party_id: id, role: { notIn: input.roles } } });
    await tx.partyBusinessType.deleteMany({ where: { party_id: id, business_type_id: { notIn: input.businessTypeIds } } });
    await tx.partyContact.deleteMany({ where: { party_id: id } });
    await tx.partyLink.deleteMany({ where: { party_id: id } });
    const children = childWrites(input);
    if (children.roles.length) await tx.partyRole.createMany({ data: children.roles.map((row) => ({ ...row, party_id: id })), skipDuplicates: true });
    if (children.businessTypes.length) await tx.partyBusinessType.createMany({ data: children.businessTypes.map((row) => ({ ...row, party_id: id })), skipDuplicates: true });
    if (children.contacts.length) await tx.partyContact.createMany({ data: children.contacts.map((row) => ({ ...row, party_id: id })) });
    if (children.links.length) await tx.partyLink.createMany({ data: children.links.map((row) => ({ ...row, party_id: id })) });
    return readParty(tx, id);
  },
  async setDeletedAt(tx, id, deletedAt) {
    await tx.party.update({ where: { id }, data: { deleted_at: deletedAt }, select: { id: true } });
    return readParty(tx, id);
  },
};

const BUSINESS_TYPE_SELECT = { id: true, code: true, label: true, description: true, sort_order: true, created_at: true, updated_at: true, deleted_at: true } as const;
function toBusinessType(row: any): BusinessTypeRecord { return { id: row.id, code: row.code, label: row.label, description: row.description, sortOrder: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at }; }

export const prismaBusinessTypeRepository: BusinessTypeRepository = {
  async list(tx, includeDeleted) { return (await tx.businessType.findMany({ where: { deleted_at: includeDeleted ? undefined : null }, select: BUSINESS_TYPE_SELECT, orderBy: [{ sort_order: "asc" }, { code: "asc" }] })).map(toBusinessType); },
  async findById(tx, id) { const row = await tx.businessType.findFirst({ where: { id }, select: BUSINESS_TYPE_SELECT }); return row ? toBusinessType(row) : null; },
  async findByCode(tx, code) { const row = await tx.businessType.findFirst({ where: { code }, select: BUSINESS_TYPE_SELECT }); return row ? toBusinessType(row) : null; },
  async countLivePartyAssignments(tx, id) { return tx.partyBusinessType.count({ where: { business_type_id: id, party: { deleted_at: null } } }); },
  async create(tx, input: BusinessTypeWriteInput) { return toBusinessType(await tx.businessType.create({ data: { id: input.id, code: input.code, label: input.label, description: input.description, sort_order: input.sortOrder }, select: BUSINESS_TYPE_SELECT })); },
  async update(tx, id, input) { return toBusinessType(await tx.businessType.update({ where: { id }, data: { label: input.label, description: input.description, sort_order: input.sortOrder }, select: BUSINESS_TYPE_SELECT })); },
  async setDeletedAt(tx, id, deletedAt) { return toBusinessType(await tx.businessType.update({ where: { id }, data: { deleted_at: deletedAt }, select: BUSINESS_TYPE_SELECT })); },
};
