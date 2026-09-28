import type { PrismaClient } from "@/generated/prisma/client";

/**
 * What other apps may know about a physical-sample request. Facts only: no storage keys, no images,
 * no schedule internals. Master Data reads this to build its own working queue; it never writes back.
 */
export type SampleRequestRead = {
  id: string;
  status: "REQUESTED" | "RECEIVED";
  requestedAt: Date;
  requestedBy: { id: string; name: string };
  requestedFrom: string;
  note: string | null;
  receivedAt: Date | null;
  project: { id: string; name: string; archived: boolean };
  option: {
    id: string;
    productName: string;
    brandName: string | null;
    color: string | null;
    pattern: string | null;
    finishing: string | null;
    dimension: string | null;
  };
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_IDS = 100;

const SELECT = {
  id: true,
  status: true,
  requested_at: true,
  requested_by_id: true,
  requested_by_name: true,
  requested_from: true,
  note: true,
  received_at: true,
  option: {
    select: {
      id: true,
      product_name: true,
      brand_name: true,
      color: true,
      pattern: true,
      finishing: true,
      dimension: true,
      entry: { select: { project: { select: { id: true, name: true, archived_at: true } } } },
    },
  },
} as const;

type Row = Awaited<ReturnType<PrismaClient["sfScheduleSampleRequest"]["findMany"]>>[number] & {
  option: {
    id: string;
    product_name: string;
    brand_name: string | null;
    color: string | null;
    pattern: string | null;
    finishing: string | null;
    dimension: string | null;
    entry: { project: { id: string; name: string; archived_at: Date | null } };
  };
};

function toRead(row: Row): SampleRequestRead {
  const { option } = row;
  return {
    id: row.id,
    status: row.status,
    requestedAt: row.requested_at,
    requestedBy: { id: row.requested_by_id, name: row.requested_by_name },
    requestedFrom: row.requested_from,
    note: row.note,
    receivedAt: row.received_at,
    project: { id: option.entry.project.id, name: option.entry.project.name, archived: option.entry.project.archived_at !== null },
    option: {
      id: option.id,
      productName: option.product_name,
      brandName: option.brand_name,
      color: option.color,
      pattern: option.pattern,
      finishing: option.finishing,
      dimension: option.dimension,
    },
  };
}

/** Read-only StudioFlow contract for sample requests. Callers authorize; this port carries no user context. */
export function createStudioFlowSampleRequestRead(db: PrismaClient) {
  return {
    /** Requests still waiting for the physical sample, oldest first, excluding archived projects. */
    async listPendingSampleRequests(input: { limit?: number } = {}): Promise<SampleRequestRead[]> {
      // A missing or unusable limit falls back to the default; a usable one is capped.
      const requested = Math.trunc(input.limit ?? Number.NaN);
      const limit = Number.isFinite(requested) && requested >= 1 ? Math.min(requested, MAX_LIMIT) : DEFAULT_LIMIT;
      const rows = await db.sfScheduleSampleRequest.findMany({
        where: { status: "REQUESTED", option: { entry: { project: { archived_at: null } } } },
        orderBy: [{ requested_at: "asc" }, { id: "asc" }],
        take: limit,
        select: SELECT,
      });
      return (rows as Row[]).map(toRead);
    },

    /** Specific requests in any state, so a consumer can validate the ones it was asked to act on. */
    async getSampleRequests(ids: readonly string[]): Promise<SampleRequestRead[]> {
      const unique = [...new Set(ids)].slice(0, MAX_IDS);
      if (unique.length === 0) return [];
      const rows = await db.sfScheduleSampleRequest.findMany({ where: { id: { in: unique } }, select: SELECT });
      return (rows as Row[]).map(toRead);
    },
  };
}

export type StudioFlowSampleRequestRead = ReturnType<typeof createStudioFlowSampleRequestRead>;
