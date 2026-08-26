import type { AuditActor, AuditWriter } from "@platform/core/audit";
import type { TransactionClient } from "@platform/core/db";
import type { PermissionGrants } from "@platform/core/rbac";

/**
 * Per-request execution context injected into every Master Data use case
 * (MD-00 §10/§11, CORE.md §3/§4):
 *
 * - `grants`: server-side resolved permission grants for the current principal;
 * - `actor`: snapshotted audit actor for the same principal.
 *
 * Use cases never resolve identity themselves and never fall back to a
 * default grant. Identity provider and grant composition remain explicit
 * platform/owner decisions (docs/08 deferred item 1).
 */
export type MasterDataExecutionContext = {
  grants: PermissionGrants;
  actor: AuditActor;
  /** Internal orchestration scope used by atomic multi-resource operations. */
  transaction?: TransactionClient;
};

/**
 * Application-owned transaction scope (CORE.md §2). The use case opens one
 * transaction and passes it to every participating repository/audit write.
 */
export type TransactionRunner = <T>(work: (tx: TransactionClient) => Promise<T>) => Promise<T>;

/** Ports injected into Master Data application services. */
export type MasterDataUseCasePorts = {
  runTransaction: TransactionRunner;
  auditWriter: AuditWriter;
  /** Deterministic infrastructure seams used by mutations and focused tests. */
  generateId: () => string;
  now: () => Date;
};

/** Reuses an orchestrator-owned transaction or opens a command transaction. */
export function runInMasterDataTransaction<T>(
  context: MasterDataExecutionContext,
  runner: TransactionRunner,
  work: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  return context.transaction ? work(context.transaction) : runner(work);
}
