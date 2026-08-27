import type { TransactionClient } from "@platform/core/db";

import type { PartyDeleteReferences, PartyRole, PartyRoleReferences, PartyType } from "../domain/party-rules";

export const PARTY_LINK_KINDS = [
  "WEBSITE", "INSTAGRAM", "FACEBOOK", "TIKTOK", "YOUTUBE", "LINKEDIN",
  "WHATSAPP", "MARKETPLACE", "DRIVE", "CATALOG", "PRICE_LIST", "OTHER",
] as const;
export type PartyLinkKind = (typeof PARTY_LINK_KINDS)[number];

export type PartyContactRecord = {
  id: string;
  personName: string;
  jobTitle: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
  notes: string | null;
  brandId: string | null;
};

export type PartyLinkRecord = {
  id: string;
  kind: PartyLinkKind;
  url: string;
  archiveUrl: string | null;
  label: string | null;
  sortOrder: number;
};

export type PartyRecord = {
  id: string;
  name: string;
  slug: string;
  type: PartyType;
  legalName: string | null;
  address: string | null;
  notes: string | null;
  roles: PartyRole[];
  businessTypeIds: string[];
  contacts: PartyContactRecord[];
  links: PartyLinkRecord[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type PartyListFilter = {
  query?: string;
  type?: PartyType;
  role?: PartyRole;
  includeDeleted?: boolean;
  sortDirection?: "asc" | "desc";
};

export type PartyGraphInput = Omit<PartyRecord, "createdAt" | "updatedAt" | "deletedAt"> & {
  roleAssignments?: readonly { id: string; role: PartyRole }[];
  businessTypeAssignments?: readonly { id: string; businessTypeId: string }[];
};

export type BrandContactScopeRecord = {
  brandId: string;
  brandDeletedAt: Date | null;
  partyOwnsBrand: boolean;
  hasLiveBrandSupplier: boolean;
};

export interface PartyRepository {
  list(tx: TransactionClient, filter: PartyListFilter): Promise<PartyRecord[]>;
  listEligible(tx: TransactionClient, role: PartyRole): Promise<PartyRecord[]>;
  findById(tx: TransactionClient, id: string): Promise<PartyRecord | null>;
  findLiveIdentityConflict(tx: TransactionClient, name: string, slug: string): Promise<PartyRecord | null>;
  findMissingLiveBusinessTypeIds(tx: TransactionClient, ids: readonly string[]): Promise<string[]>;
  loadBrandContactScope(tx: TransactionClient, partyId: string, brandId: string): Promise<BrandContactScopeRecord | null>;
  countRoleReferences(tx: TransactionClient, partyId: string): Promise<PartyRoleReferences>;
  countDeleteReferences(tx: TransactionClient, partyId: string): Promise<PartyDeleteReferences>;
  create(tx: TransactionClient, input: PartyGraphInput): Promise<PartyRecord>;
  update(tx: TransactionClient, id: string, input: PartyGraphInput): Promise<PartyRecord>;
  setDeletedAt(tx: TransactionClient, id: string, deletedAt: Date | null): Promise<PartyRecord>;
}

export type BusinessTypeRecord = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type BusinessTypeWriteInput = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  sortOrder: number;
};

export interface BusinessTypeRepository {
  list(tx: TransactionClient, includeDeleted: boolean): Promise<BusinessTypeRecord[]>;
  findById(tx: TransactionClient, id: string): Promise<BusinessTypeRecord | null>;
  findByCode(tx: TransactionClient, code: string): Promise<BusinessTypeRecord | null>;
  countLivePartyAssignments(tx: TransactionClient, id: string): Promise<number>;
  create(tx: TransactionClient, input: BusinessTypeWriteInput): Promise<BusinessTypeRecord>;
  update(tx: TransactionClient, id: string, input: Omit<BusinessTypeWriteInput, "id" | "code">): Promise<BusinessTypeRecord>;
  setDeletedAt(tx: TransactionClient, id: string, deletedAt: Date | null): Promise<BusinessTypeRecord>;
}
