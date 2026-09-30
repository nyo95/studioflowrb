import { AppError } from "@platform/core/errors";
import { requirePermission, type PermissionGrants } from "@platform/core/rbac";
import {
  MASTERDATA_PERMISSIONS,
  type SampleQuoteInput,
  type SampleRequestIntakeRead,
  type SampleRequestIntakeStatus,
  type SampleRequestSnapshot,
} from "@/apps/masterdata/public";
import type { SampleRequestRead } from "@/apps/studioflow/public";

type Actor = { kind: "USER"; userId: string; label: string };

type SampleRequestCoordinatorDependencies = {
  /** StudioFlow's read-only sample-request contract. */
  studioFlow: {
    listPendingSampleRequests(input?: { limit?: number }): Promise<SampleRequestRead[]>;
    getSampleRequests(ids: readonly string[]): Promise<SampleRequestRead[]>;
  };
  /** Master Data's own commands for working a request. */
  masterData: {
    startSampleRequestIntake(input: { grants: PermissionGrants; actor: Actor; snapshot: SampleRequestSnapshot }): Promise<SampleRequestIntakeRead>;
    recordSampleQuote(input: { grants: PermissionGrants; actor: Actor; intakeId: string } & SampleQuoteInput): Promise<SampleRequestIntakeRead>;
    markSampleRequestPriced(input: { grants: PermissionGrants; actor: Actor; intakeId: string } & SampleQuoteInput): Promise<SampleRequestIntakeRead>;
    syncSampleQuoteToPrice(input: { grants: PermissionGrants; actor: Actor; intakeId: string }): Promise<SampleRequestIntakeRead>;
    declineSampleRequest(input: { grants: PermissionGrants; actor: Actor; intakeId: string; reason: string }): Promise<SampleRequestIntakeRead>;
    listSampleRequestIntakes(input: { grants: PermissionGrants; status?: SampleRequestIntakeStatus; sourceRequestIds?: readonly string[]; limit?: number }): Promise<SampleRequestIntakeRead[]>;
  };
};

/** One card in the Master Data queue: what was asked, and where Master Data stands with it. */
export type SampleQueueRow = {
  sourceRequestId: string;
  /** "NEW" means StudioFlow asked and nobody in Master Data has taken it yet. */
  state: "NEW" | SampleRequestIntakeStatus;
  /** StudioFlow's own view: the physical sample may already be in the designer's hands. Null if it can no longer be read. */
  sourceStatus: "REQUESTED" | "RECEIVED" | null;
  product: { name: string; brandName: string | null; color: string | null; pattern: string | null; finishing: string | null; dimension: string | null };
  project: { id: string; name: string };
  requestedFrom: string;
  note: string | null;
  requestedBy: { id: string; name: string };
  requestedAt: Date;
  intake: SampleRequestIntakeRead | null;
};

const PENDING_LIMIT = 200;
const OPEN_LIMIT = 500;
const FINISHED_LIMIT = 50;

function fromRequest(request: SampleRequestRead, intake: SampleRequestIntakeRead | null): SampleQueueRow {
  return {
    sourceRequestId: request.id,
    state: intake ? intake.status : "NEW",
    sourceStatus: request.status,
    product: { name: request.option.productName, brandName: request.option.brandName, color: request.option.color, pattern: request.option.pattern, finishing: request.option.finishing, dimension: request.option.dimension },
    project: { id: request.project.id, name: request.project.name },
    requestedFrom: request.requestedFrom,
    note: request.note,
    requestedBy: request.requestedBy,
    requestedAt: request.requestedAt,
    intake,
  };
}

function fromIntake(intake: SampleRequestIntakeRead, source: SampleRequestRead | null): SampleQueueRow {
  return {
    sourceRequestId: intake.sourceRequestId,
    state: intake.status,
    sourceStatus: source?.status ?? null,
    product: { name: intake.productName, brandName: intake.brandName, color: intake.color, pattern: intake.pattern, finishing: intake.finishing, dimension: intake.dimension },
    project: { id: intake.sourceProjectId, name: intake.sourceProjectName },
    requestedFrom: intake.requestedFrom,
    note: intake.requestNote,
    requestedBy: { id: intake.requesterUserId, name: intake.requesterLabel },
    requestedAt: intake.requestedAt,
    intake,
  };
}

const STATE_ORDER: Record<SampleQueueRow["state"], number> = { NEW: 0, IN_PROGRESS: 1, PRICED: 2, DECLINED: 2 };

/**
 * Cross-app use case: StudioFlow asks for a physical sample, Master Data staff work it. Neither app imports
 * the other; the shell hands each one's public contract to this coordinator. Master Data's actions never
 * change StudioFlow's request, so "priced" and "sample received" stay two separate facts.
 */
export function createSampleRequestCoordinator(deps: SampleRequestCoordinatorDependencies) {
  const authorize = (grants: PermissionGrants) => requirePermission(grants, MASTERDATA_PERMISSIONS.sampleRequestManage);

  return {
    /** New requests first (oldest first), then requests being worked, then recently finished ones if asked for. */
    async listQueue(input: { grants: PermissionGrants; includeFinished?: boolean }): Promise<SampleQueueRow[]> {
      authorize(input.grants);
      const pending = await deps.studioFlow.listPendingSampleRequests({ limit: PENDING_LIMIT });
      const [open, forPending, priced, declined] = await Promise.all([
        deps.masterData.listSampleRequestIntakes({ grants: input.grants, status: "IN_PROGRESS", limit: OPEN_LIMIT }),
        pending.length > 0 ? deps.masterData.listSampleRequestIntakes({ grants: input.grants, sourceRequestIds: pending.map((request) => request.id) }) : Promise.resolve([]),
        input.includeFinished ? deps.masterData.listSampleRequestIntakes({ grants: input.grants, status: "PRICED", limit: FINISHED_LIMIT }) : Promise.resolve([]),
        input.includeFinished ? deps.masterData.listSampleRequestIntakes({ grants: input.grants, status: "DECLINED", limit: FINISHED_LIMIT }) : Promise.resolve([]),
      ]);
      const intakes = new Map<string, SampleRequestIntakeRead>();
      for (const intake of [...open, ...forPending, ...priced, ...declined]) intakes.set(intake.id, intake);
      const byRequest = new Map([...intakes.values()].map((intake) => [intake.sourceRequestId, intake]));

      const pendingIds = new Set(pending.map((request) => request.id));
      const rows: SampleQueueRow[] = pending.map((request) => fromRequest(request, byRequest.get(request.id) ?? null));
      const detached = [...intakes.values()].filter((intake) => !pendingIds.has(intake.sourceRequestId));
      const sources = new Map((detached.length > 0 ? await deps.studioFlow.getSampleRequests(detached.map((intake) => intake.sourceRequestId)) : []).map((request) => [request.id, request]));
      for (const intake of detached) rows.push(fromIntake(intake, sources.get(intake.sourceRequestId) ?? null));

      const finishedAt = (row: SampleQueueRow) => row.intake?.resolvedAt?.getTime() ?? 0;
      return rows.sort((a, b) =>
        STATE_ORDER[a.state] - STATE_ORDER[b.state]
        || (a.state === "NEW" ? a.requestedAt.getTime() - b.requestedAt.getTime() : finishedAt(b) - finishedAt(a) || a.requestedAt.getTime() - b.requestedAt.getTime()));
    },

    /** Staff take a request that StudioFlow still lists as pending. */
    async take(input: { grants: PermissionGrants; actor: Actor; sourceRequestId: string }) {
      authorize(input.grants);
      const [request] = await deps.studioFlow.getSampleRequests([input.sourceRequestId]);
      if (!request) throw new AppError("NOT_FOUND", "SAMPLE_REQUEST_NOT_FOUND", "This sample request no longer exists.");
      if (request.project.archived) throw new AppError("CONFLICT", "SAMPLE_PROJECT_ARCHIVED", "This request belongs to an archived project.");
      if (request.status !== "REQUESTED") throw new AppError("CONFLICT", "SAMPLE_REQUEST_NOT_PENDING", "The designer already marked this sample as received.");
      return deps.masterData.startSampleRequestIntake({
        grants: input.grants,
        actor: input.actor,
        snapshot: {
          sourceRequestId: request.id,
          sourceProjectId: request.project.id,
          sourceProjectName: request.project.name,
          sourceOptionId: request.option.id,
          productName: request.option.productName,
          brandName: request.option.brandName,
          color: request.option.color,
          pattern: request.option.pattern,
          finishing: request.option.finishing,
          dimension: request.option.dimension,
          requestedFrom: request.requestedFrom,
          requestNote: request.note,
          requesterUserId: request.requestedBy.id,
          requesterLabel: request.requestedBy.name,
          requestedAt: request.requestedAt,
        },
      });
    },

    recordQuote(input: { grants: PermissionGrants; actor: Actor; intakeId: string } & SampleQuoteInput) {
      return deps.masterData.recordSampleQuote(input);
    },
    markPriced(input: { grants: PermissionGrants; actor: Actor; intakeId: string } & SampleQuoteInput) {
      return deps.masterData.markSampleRequestPriced(input);
    },
    decline(input: { grants: PermissionGrants; actor: Actor; intakeId: string; reason: string }) {
      return deps.masterData.declineSampleRequest(input);
    },
  };
}

export type SampleRequestCoordinator = ReturnType<typeof createSampleRequestCoordinator>;
