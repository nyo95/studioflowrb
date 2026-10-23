import type { PrismaClient } from "@/generated/prisma/client";
import type { ObjectStorage } from "@platform/core/storage";

import { scheduleCode } from "../domain/schedule";

/**
 * What other apps may know about a physical-sample request. Facts only: no storage keys and no schedule
 * internals. The one image form allowed is a short-lived signed read URL of the option's photo (WO-SF-SAMPLE-PHOTO-01). Master Data reads this to build its own working queue;
 * refusal is relayed separately through StudioFlow's narrow command.
 */
export type SampleRequestRead = {
  id: string;
  status: "REQUESTED" | "RECEIVED" | "DECLINED";
  requestedAt: Date;
  requestedBy: { id: string; name: string };
  requestedFrom: string;
  note: string | null;
  receivedAt: Date | null;
  declinedAt: Date | null;
  declineReason: string | null;
  project: { id: string; name: string; archived: boolean };
  option: {
    id: string;
    productName: string;
    brandName: string | null;
    color: string | null;
    pattern: string | null;
    finishing: string | null;
    dimension: string | null;
    /** The schedule item's code, e.g. "CT-02". */
    entryCode: string;
    /** Signed read URL of the option's photo, valid for 15 minutes; null without a photo or when it cannot be signed. */
    imageUrl: string | null;
  };
};

const SIGNED_URL_SECONDS = 15 * 60;
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
  declined_at: true,
  decline_reason: true,
  option: {
    select: {
      id: true,
      product_name: true,
      brand_name: true,
      color: true,
      pattern: true,
      finishing: true,
      dimension: true,
      image_key: true,
      entry: { select: { prefix: true, increment: true, project: { select: { id: true, name: true, archived_at: true } } } },
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
    image_key: string | null;
    entry: { prefix: string; increment: number; project: { id: string; name: string; archived_at: Date | null } };
  };
};

function toRead(row: Row, imageUrl: string | null): SampleRequestRead {
  const { option } = row;
  return {
    id: row.id,
    status: row.status,
    requestedAt: row.requested_at,
    requestedBy: { id: row.requested_by_id, name: row.requested_by_name },
    requestedFrom: row.requested_from,
    note: row.note,
    receivedAt: row.received_at,
    declinedAt: row.declined_at,
    declineReason: row.decline_reason,
    project: { id: option.entry.project.id, name: option.entry.project.name, archived: option.entry.project.archived_at !== null },
    option: {
      id: option.id,
      productName: option.product_name,
      brandName: option.brand_name,
      color: option.color,
      pattern: option.pattern,
      finishing: option.finishing,
      dimension: option.dimension,
      entryCode: scheduleCode(option.entry.prefix, option.entry.increment),
      imageUrl,
    },
  };
}

/** Read-only StudioFlow contract for sample requests. Callers authorize; this port carries no user context. */
export function createStudioFlowSampleRequestRead(db: PrismaClient, ports: { storage?: Pick<ObjectStorage, "createSignedReadUrl"> } = {}) {
  /** A photo that cannot be signed (missing file, storage down) is left out rather than failing the queue. */
  const sign = async (key: string | null): Promise<string | null> => {
    if (!key || !ports.storage) return null;
    try {
      return await ports.storage.createSignedReadUrl(key, SIGNED_URL_SECONDS);
    } catch {
      return null;
    }
  };
  const toReads = (rows: Row[]) => Promise.all(rows.map(async (row) => toRead(row, await sign(row.option.image_key))));
  return {
    /** Number of requests still waiting for their physical sample. */
    async countPendingSampleRequests(): Promise<number> {
      return db.sfScheduleSampleRequest.count({ where: { status: "REQUESTED", option: { entry: { project: { archived_at: null } } } } });
    },
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
      return toReads(rows as Row[]);
    },

    /** Specific requests in any state, so a consumer can validate the ones it was asked to act on. */
    async getSampleRequests(ids: readonly string[]): Promise<SampleRequestRead[]> {
      const unique = [...new Set(ids)].slice(0, MAX_IDS);
      if (unique.length === 0) return [];
      const rows = await db.sfScheduleSampleRequest.findMany({ where: { id: { in: unique } }, select: SELECT });
      return toReads(rows as Row[]);
    },
  };
}

export type StudioFlowSampleRequestRead = ReturnType<typeof createStudioFlowSampleRequestRead>;
