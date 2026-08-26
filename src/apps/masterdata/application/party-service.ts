import { diffAuditChanges, prepareAuditEvent } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { requirePermission } from "@platform/core/rbac";
import { normalizeText } from "@platform/utilities/normalization";
import { toSlug } from "@platform/utilities/slug";

import {
  assertBrandScopedContactAllowed,
  assertPartyCanBeDeleted,
  assertPartyRoleCanBeRemoved,
  normalizePartyRoles,
  normalizePartyType,
  type PartyRole,
  type PartyType,
} from "../domain/party-rules";
import type { MasterDataExecutionContext, MasterDataUseCasePorts } from "./execution-context";
import { MASTERDATA_PARTY_MANAGE, MASTERDATA_PARTY_READ } from "./masterdata-permissions";
import { PARTY_LINK_KINDS, type PartyContactRecord, type PartyLinkKind, type PartyLinkRecord, type PartyRecord, type PartyRepository } from "./party-repository";

export type PartyContactInput = Omit<PartyContactRecord, "id"> & { id?: string };
export type PartyLinkInput = Omit<PartyLinkRecord, "id"> & { id?: string };
export type PartyWriteInput = {
  name: string;
  type: PartyType | "COMPANY";
  legalName?: string | null;
  address?: string | null;
  notes?: string | null;
  roles: readonly PartyRole[];
  businessTypeIds?: readonly string[];
  contacts?: readonly PartyContactInput[];
  links?: readonly PartyLinkInput[];
};
export type PartyUpdateInput = Partial<PartyWriteInput> & { id: string };

function optionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return normalizeText(value) || null;
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map(normalizeText).filter(Boolean))];
}

function normalizeUrl(value: string, field: string): string {
  const normalized = normalizeText(value);
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("protocol");
    return parsed.toString();
  } catch {
    throw new AppError("VALIDATION", "PARTY_LINK_URL_INVALID", `${field} must be a valid HTTP or HTTPS URL.`);
  }
}

function partyAuditShape(record: PartyRecord): Record<string, unknown> {
  return {
    name: record.name,
    slug: record.slug,
    type: record.type,
    legalName: record.legalName,
    address: record.address,
    notes: record.notes,
    roles: record.roles,
    businessTypeIds: record.businessTypeIds,
    contactIds: record.contacts.map(({ id }) => id),
    linkIds: record.links.map(({ id }) => id),
  };
}

export class PartyService {
  constructor(private readonly ports: MasterDataUseCasePorts & { parties: PartyRepository }) {}

  list(context: MasterDataExecutionContext, filter: Parameters<PartyRepository["list"]>[1] = {}) {
    requirePermission(context.grants, MASTERDATA_PARTY_READ);
    return this.ports.runTransaction((tx) => this.ports.parties.list(tx, filter));
  }

  listEligible(context: MasterDataExecutionContext, role: PartyRole) {
    requirePermission(context.grants, MASTERDATA_PARTY_READ);
    return this.ports.runTransaction((tx) => this.ports.parties.listEligible(tx, role));
  }

  create(context: MasterDataExecutionContext, input: PartyWriteInput): Promise<PartyRecord> {
    requirePermission(context.grants, MASTERDATA_PARTY_MANAGE);
    return this.write(context, null, input);
  }

  update(context: MasterDataExecutionContext, input: PartyUpdateInput): Promise<PartyRecord> {
    requirePermission(context.grants, MASTERDATA_PARTY_MANAGE);
    return this.ports.runTransaction(async (tx) => {
      const current = await this.ports.parties.findById(tx, input.id);
      if (!current || current.deletedAt !== null) throw new AppError("NOT_FOUND", "PARTY_NOT_FOUND", "This Party no longer exists.");
      return this.writeInTransaction(context, tx, current, {
        name: input.name ?? current.name,
        type: input.type ?? current.type,
        legalName: input.legalName === undefined ? current.legalName : input.legalName,
        address: input.address === undefined ? current.address : input.address,
        notes: input.notes === undefined ? current.notes : input.notes,
        roles: input.roles ?? current.roles,
        businessTypeIds: input.businessTypeIds ?? current.businessTypeIds,
        contacts: input.contacts ?? current.contacts,
        links: input.links ?? current.links,
      });
    });
  }

  private write(context: MasterDataExecutionContext, current: null, input: PartyWriteInput): Promise<PartyRecord> {
    return this.ports.runTransaction((tx) => this.writeInTransaction(context, tx, current, input));
  }

  private async writeInTransaction(
    context: MasterDataExecutionContext,
    tx: Parameters<Parameters<MasterDataUseCasePorts["runTransaction"]>[0]>[0],
    current: PartyRecord | null,
    input: PartyWriteInput,
  ): Promise<PartyRecord> {
    const name = normalizeText(input.name);
    if (!name) throw new AppError("VALIDATION", "PARTY_NAME_REQUIRED", "Party name is required.");
    const slug = toSlug(name);
    if (!slug) throw new AppError("VALIDATION", "PARTY_NAME_NOT_SLUGGABLE", "Party name must contain letters or digits.");
    const type = normalizePartyType(input.type);
    const roles = normalizePartyRoles(input.roles);
    if (roles.length === 0) throw new AppError("INVARIANT", "PARTY_REQUIRES_OPERATIONAL_ROLE", "A live Party must have at least one operational role.");

    const identityConflict = await this.ports.parties.findLiveIdentityConflict(tx, name, slug);
    if (identityConflict && identityConflict.id !== current?.id) {
      throw new AppError("CONFLICT", "PARTY_IDENTITY_TAKEN", "A live Party already uses this name or slug.");
    }

    const businessTypeIds = uniqueIds(input.businessTypeIds ?? []);
    const missingBusinessTypes = await this.ports.parties.findMissingLiveBusinessTypeIds(tx, businessTypeIds);
    if (missingBusinessTypes.length > 0) {
      throw new AppError("VALIDATION", "PARTY_BUSINESS_TYPE_INVALID", "Every Business Type must exist and be live.", { details: { ids: missingBusinessTypes } });
    }

    if (current) {
      const removed = current.roles.filter((role) => !roles.includes(role));
      if (removed.length > 0) {
        const references = await this.ports.parties.countRoleReferences(tx, current.id);
        for (const role of removed) assertPartyRoleCanBeRemoved({ deletedAt: current.deletedAt, currentRoles: current.roles, role, references });
      }
    }

    const partyId = current?.id ?? this.ports.generateId();
    const contacts: PartyContactRecord[] = [];
    for (const contact of input.contacts ?? []) {
      const personName = normalizeText(contact.personName);
      if (!personName) throw new AppError("VALIDATION", "PARTY_CONTACT_NAME_REQUIRED", "Contact person name is required.");
      if (contact.brandId !== null) {
        const scope = await this.ports.parties.loadBrandContactScope(tx, partyId, contact.brandId);
        if (!scope) throw new AppError("VALIDATION", "PARTY_CONTACT_BRAND_SCOPE_INVALID", "The selected Brand does not exist.");
        assertBrandScopedContactAllowed(scope);
      }
      contacts.push({
        id: contact.id ?? this.ports.generateId(), personName,
        jobTitle: optionalText(contact.jobTitle), phone: optionalText(contact.phone), email: optionalText(contact.email),
        isPrimary: contact.isPrimary, notes: optionalText(contact.notes), brandId: contact.brandId,
      });
    }

    const seenUrls = new Set<string>();
    const links = (input.links ?? []).map((link): PartyLinkRecord => {
      if (!PARTY_LINK_KINDS.includes(link.kind)) throw new AppError("VALIDATION", "PARTY_LINK_KIND_INVALID", "Party link kind is invalid.");
      const url = normalizeUrl(link.url, "URL");
      if (seenUrls.has(url)) throw new AppError("CONFLICT", "PARTY_LINK_DUPLICATE", "Party links must use unique URLs.");
      seenUrls.add(url);
      return {
        id: link.id ?? this.ports.generateId(), kind: link.kind as PartyLinkKind, url,
        archiveUrl: link.archiveUrl ? normalizeUrl(link.archiveUrl, "Archive URL") : null,
        label: optionalText(link.label), sortOrder: link.sortOrder,
      };
    });

    const graph = {
      id: partyId, name, slug, type, legalName: optionalText(input.legalName), address: optionalText(input.address), notes: optionalText(input.notes),
      roles, businessTypeIds, contacts, links,
    };
    const nextShape = partyAuditShape({ ...graph, createdAt: current?.createdAt ?? this.ports.now(), updatedAt: this.ports.now(), deletedAt: null });
    const changes = diffAuditChanges(current ? partyAuditShape(current) : {}, nextShape);
    if (current && Object.keys(changes).length === 0) return current;
    const saved = current ? await this.ports.parties.update(tx, current.id, graph) : await this.ports.parties.create(tx, graph);
    await this.ports.auditWriter.write(prepareAuditEvent({
      appId: "masterdata", action: current ? "party.updated" : "party.created", entityType: "party", entityId: saved.id,
      actor: context.actor, changes, occurredAt: this.ports.now(),
    }), tx);
    return saved;
  }

  softDelete(context: MasterDataExecutionContext, id: string): Promise<PartyRecord> {
    requirePermission(context.grants, MASTERDATA_PARTY_MANAGE);
    return this.ports.runTransaction(async (tx) => {
      const current = await this.ports.parties.findById(tx, id);
      if (!current || current.deletedAt !== null) throw new AppError("NOT_FOUND", "PARTY_NOT_FOUND", "This Party no longer exists.");
      assertPartyCanBeDeleted(await this.ports.parties.countDeleteReferences(tx, id));
      const deletedAt = this.ports.now();
      const saved = await this.ports.parties.setDeletedAt(tx, id, deletedAt);
      await this.ports.auditWriter.write(prepareAuditEvent({ appId: "masterdata", action: "party.deleted", entityType: "party", entityId: id, actor: context.actor, occurredAt: deletedAt, changes: { deletedAt: { from: null, to: deletedAt } } }), tx);
      return saved;
    });
  }

  restore(context: MasterDataExecutionContext, id: string): Promise<PartyRecord> {
    requirePermission(context.grants, MASTERDATA_PARTY_MANAGE);
    return this.ports.runTransaction(async (tx) => {
      const current = await this.ports.parties.findById(tx, id);
      if (!current) throw new AppError("NOT_FOUND", "PARTY_NOT_FOUND", "This Party no longer exists.");
      if (current.deletedAt === null) throw new AppError("CONFLICT", "PARTY_NOT_DELETED", "Only a deleted Party can be restored.");
      if (current.roles.length === 0) throw new AppError("INVARIANT", "PARTY_REQUIRES_OPERATIONAL_ROLE", "A restored Party must have at least one operational role.");
      const conflict = await this.ports.parties.findLiveIdentityConflict(tx, current.name, current.slug);
      if (conflict && conflict.id !== current.id) throw new AppError("CONFLICT", "PARTY_IDENTITY_TAKEN", "The Party identity is already used by a live record.");
      const missing = await this.ports.parties.findMissingLiveBusinessTypeIds(tx, current.businessTypeIds);
      if (missing.length) throw new AppError("CONFLICT", "PARTY_BUSINESS_TYPE_INVALID", "A Business Type assigned to this Party is no longer live.", { details: { ids: missing } });
      for (const contact of current.contacts) {
        if (contact.brandId === null) continue;
        const scope = await this.ports.parties.loadBrandContactScope(tx, current.id, contact.brandId);
        if (!scope) throw new AppError("CONFLICT", "PARTY_CONTACT_BRAND_SCOPE_INVALID", "A Brand-scoped contact is no longer valid.");
        assertBrandScopedContactAllowed(scope);
      }
      const saved = await this.ports.parties.setDeletedAt(tx, id, null);
      await this.ports.auditWriter.write(prepareAuditEvent({ appId: "masterdata", action: "party.restored", entityType: "party", entityId: id, actor: context.actor, occurredAt: this.ports.now(), changes: { deletedAt: { from: current.deletedAt, to: null } } }), tx);
      return saved;
    });
  }
}
