import type { TransactionClient } from "@platform/core/db";
import type { BrandCategoryCandidate, BrandDeleteReferences, BrandSupplierCandidate } from "../domain/brand-rules";
import type { PartyLinkKind } from "./party-repository";

export type BrandCategoryRecord = { id: string; categoryId: string; sortOrder: number };
export type BrandSupplierRecord = { id: string; partyId: string; isAuthorized: boolean; notes: string | null };
export type BrandLinkRecord = { id: string; kind: PartyLinkKind; url: string; archiveUrl: string | null; label: string | null; sortOrder: number };
export type BrandRecord = {
  id: string; name: string; slug: string; ownerPartyId: string | null; notes: string | null;
  categories: BrandCategoryRecord[]; suppliers: BrandSupplierRecord[]; links: BrandLinkRecord[];
  createdAt: Date; updatedAt: Date; deletedAt: Date | null;
};
export type BrandGraphInput = Omit<BrandRecord, "createdAt" | "updatedAt" | "deletedAt">;
export type BrandListFilter = { query?: string; categoryId?: string; includeDeleted?: boolean };

export interface BrandRepository {
  list(tx: TransactionClient, filter: BrandListFilter): Promise<BrandRecord[]>;
  findById(tx: TransactionClient, id: string): Promise<BrandRecord | null>;
  findLiveIdentityConflict(tx: TransactionClient, name: string, slug: string): Promise<BrandRecord | null>;
  loadCategoryCandidates(tx: TransactionClient, ids: readonly string[]): Promise<BrandCategoryCandidate[]>;
  loadSupplierCandidates(tx: TransactionClient, ids: readonly string[]): Promise<BrandSupplierCandidate[]>;
  isLiveOwnerCandidate(tx: TransactionClient, id: string): Promise<boolean>;
  countDeleteReferences(tx: TransactionClient, id: string): Promise<BrandDeleteReferences>;
  create(tx: TransactionClient, input: BrandGraphInput): Promise<BrandRecord>;
  update(tx: TransactionClient, id: string, input: BrandGraphInput): Promise<BrandRecord>;
  setDeletedAt(tx: TransactionClient, id: string, deletedAt: Date | null): Promise<BrandRecord>;
}
