import type { Prisma, PrismaClient } from "@/generated/prisma/client";

import { prepareAuditEvent, type AuditWriter } from "@platform/core/audit";
import { AppError } from "@platform/core/errors";
import { changeModuleState, listModuleStates, type ModuleStateValue } from "@platform/core/modules/admin";
import { changeIntegrationAccess, listIntegrationAccess } from "@platform/core/modules/integration-access";

import {
  createDeveloperSessionToken,
  decodeBase32,
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashDeveloperSessionToken,
  hashRecoveryCode,
  normalizeRecoveryCode,
  verifyTotp,
} from "./crypto";

export const DEVELOPER_IDLE_MS = 15 * 60 * 1000;
export const DEVELOPER_ABSOLUTE_MS = 60 * 60 * 1000;
export const DEVELOPER_LOCK_FAILURES = 5;
export const DEVELOPER_LOCK_MS = 15 * 60 * 1000;

type DbClient = PrismaClient | Prisma.TransactionClient;
type TransactionRunner = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;

export type DeveloperAccessPorts = {
  db: PrismaClient;
  runTransaction: TransactionRunner;
  auditWriter: AuditWriter;
  sessionSecret: string;
  now?: () => Date;
};

export type DeveloperClientMetadata = {
  ip?: string | null;
  userAgent?: string | null;
};

export type DeveloperSession = {
  tokenHash: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
};

const DEVELOPER_ID = "developer";
const METADATA_MAX_LENGTH = 255;

function bounded(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, METADATA_MAX_LENGTH);
}

function authenticatorUri(secret: string): string {
  const label = encodeURIComponent("StudioFlowRB:Developer");
  return `otpauth://totp/${label}?secret=${encodeURIComponent(secret)}&issuer=StudioFlowRB&algorithm=SHA1&digits=6&period=30`;
}

export function createDeveloperAccessService(ports: DeveloperAccessPorts) {
  const now = () => ports.now?.() ?? new Date();

  async function audit(
    tx: Prisma.TransactionClient,
    action: string,
    options: { metadata?: Record<string, unknown>; changes?: Record<string, { from: unknown; to: unknown }> } = {},
  ): Promise<void> {
    await ports.auditWriter.write(prepareAuditEvent({
      appId: "platform",
      action,
      entityType: "developer_access",
      entityId: DEVELOPER_ID,
      actor: { kind: "SYSTEM", label: "developer" },
      ...(options.metadata ? { metadata: options.metadata } : {}),
      ...(options.changes ? { changes: options.changes } : {}),
    }, { now }), tx);
  }

  async function enrollmentState(db: DbClient = ports.db): Promise<{ enrolled: boolean }> {
    const row = await db.developerAccess.findUnique({ where: { id: DEVELOPER_ID }, select: { id: true } });
    return { enrolled: row !== null };
  }

  async function enroll(): Promise<{ authenticatorUri: string; secret: string; recoveryCodes: readonly string[] }> {
    const secret = generateTotpSecret();
    const recoveryCodes = generateRecoveryCodes();
    const encrypted = encryptTotpSecret(secret, ports.sessionSecret);
    await ports.runTransaction(async (tx) => {
      if ((await enrollmentState(tx)).enrolled) {
        throw new AppError("CONFLICT", "DEVELOPER_ALREADY_ENROLLED", "Developer access is already set up. Reset it before enrolling again.");
      }
      await tx.developerAccess.create({
        data: { id: DEVELOPER_ID, totp_secret_enc: encrypted, enrolled_at: now() },
      });
      await tx.developerRecoveryCode.createMany({
        data: recoveryCodes.map((code) => ({ code_hash: hashRecoveryCode(code) })),
      });
      await audit(tx, "platform.developer.enrolled");
    });
    return { authenticatorUri: authenticatorUri(secret), secret, recoveryCodes: Object.freeze(recoveryCodes) };
  }

  async function reset(): Promise<{ changed: boolean }> {
    return ports.runTransaction(async (tx) => {
      const existing = await tx.developerAccess.findUnique({ where: { id: DEVELOPER_ID }, select: { id: true } });
      await tx.developerSession.deleteMany();
      await tx.developerRecoveryCode.deleteMany();
      await tx.developerAccess.deleteMany({ where: { id: DEVELOPER_ID } });
      await audit(tx, "platform.developer.reset", { metadata: { had_enrolment: existing !== null } });
      return { changed: existing !== null };
    });
  }

  async function recordFailedSignIn(
    tx: Prisma.TransactionClient,
    row: { failed_count: number },
    at: Date,
  ): Promise<{ ok: false; locked: boolean }> {
    const failedCount = row.failed_count + 1;
    const locked = failedCount >= DEVELOPER_LOCK_FAILURES;
    const lockedUntil = locked ? new Date(at.getTime() + DEVELOPER_LOCK_MS) : null;
    await tx.developerAccess.update({
      where: { id: DEVELOPER_ID },
      data: { failed_count: failedCount, locked_until: lockedUntil },
    });
    await audit(tx, "platform.developer.sign_in_failed", { metadata: { locked } });
    if (locked) await audit(tx, "platform.developer.locked", { metadata: { minutes: 15 } });
    return { ok: false, locked };
  }

  async function signIn(input: {
    code: string;
    recovery: boolean;
  } & DeveloperClientMetadata): Promise<{ rawToken: string; expiresAt: Date }> {
    const at = now();
    const result = await ports.runTransaction(async (tx) => {
      const row = await tx.developerAccess.findUnique({ where: { id: DEVELOPER_ID } });
      if (!row) {
        throw new AppError("CONFLICT", "DEVELOPER_NOT_ENROLLED", "The Developer console is not set up yet.");
      }
      if (row.locked_until && row.locked_until.getTime() > at.getTime()) {
        await audit(tx, "platform.developer.sign_in_failed", { metadata: { locked: true } });
        return { ok: false as const, locked: true };
      }

      let matchedStep: bigint | null = null;
      let recoveryHash: string | null = null;
      if (input.recovery) {
        const normalized = normalizeRecoveryCode(input.code);
        if (/^[A-HJ-NP-Z2-9]{10}$/u.test(normalized)) {
          recoveryHash = hashRecoveryCode(normalized);
          const recoveryCode = await tx.developerRecoveryCode.findUnique({ where: { code_hash: recoveryHash } });
          if (!recoveryCode || recoveryCode.used_at) recoveryHash = null;
        }
      } else {
        const secret = decodeBase32(decryptTotpSecret(row.totp_secret_enc, ports.sessionSecret));
        matchedStep = verifyTotp({ secret, code: input.code, now: at, lastStep: row.last_step });
      }
      const failureBase = row.locked_until ? { failed_count: 0 } : row;
      if (matchedStep === null && recoveryHash === null) return recordFailedSignIn(tx, failureBase, at);

      if (recoveryHash) {
        const consumed = await tx.developerRecoveryCode.updateMany({
          where: { code_hash: recoveryHash, used_at: null },
          data: { used_at: at },
        });
        if (consumed.count !== 1) return recordFailedSignIn(tx, failureBase, at);
      }
      await tx.developerAccess.update({
        where: { id: DEVELOPER_ID },
        data: {
          failed_count: 0,
          locked_until: null,
          ...(matchedStep !== null ? { last_step: matchedStep } : {}),
        },
      });
      const rawToken = createDeveloperSessionToken();
      const expiresAt = new Date(at.getTime() + DEVELOPER_ABSOLUTE_MS);
      await tx.developerSession.create({ data: {
        token_hash: hashDeveloperSessionToken(rawToken),
        created_at: at,
        last_seen_at: at,
        expires_at: expiresAt,
        ip: bounded(input.ip),
        user_agent: bounded(input.userAgent),
      } });
      if (recoveryHash) await audit(tx, "platform.developer.recovery_code_used");
      await audit(tx, "platform.developer.signed_in", { metadata: { method: recoveryHash ? "recovery" : "totp" } });
      return { ok: true as const, rawToken, expiresAt };
    });
    if (!result.ok) {
      throw new AppError(
        "UNAUTHENTICATED",
        result.locked ? "DEVELOPER_LOCKED" : "DEVELOPER_CODE_INVALID",
        result.locked ? "Too many attempts. Try again in 15 minutes." : "That code is invalid or has already been used.",
      );
    }
    return { rawToken: result.rawToken, expiresAt: result.expiresAt };
  }

  async function resolveSession(rawToken: string, db: DbClient = ports.db): Promise<DeveloperSession | null> {
    if (!rawToken) return null;
    const at = now();
    const tokenHash = hashDeveloperSessionToken(rawToken);
    const row = await db.developerSession.findUnique({ where: { token_hash: tokenHash } });
    if (!row) return null;
    if (row.expires_at.getTime() <= at.getTime() || row.last_seen_at.getTime() + DEVELOPER_IDLE_MS <= at.getTime()) {
      await db.developerSession.deleteMany({ where: { token_hash: tokenHash } });
      return null;
    }
    const touched = await db.developerSession.updateMany({ where: { token_hash: tokenHash }, data: { last_seen_at: at } });
    if (touched.count !== 1) return null;
    return { tokenHash, createdAt: row.created_at, lastSeenAt: at, expiresAt: row.expires_at };
  }

  async function requireSession(rawToken: string): Promise<DeveloperSession> {
    const session = await resolveSession(rawToken);
    if (!session) throw new AppError("UNAUTHENTICATED", "DEVELOPER_SESSION_REQUIRED", "Sign in as Developer to continue.");
    return session;
  }

  async function signOut(rawToken: string): Promise<void> {
    await requireSession(rawToken);
    const tokenHash = hashDeveloperSessionToken(rawToken);
    await ports.runTransaction(async (tx) => {
      await tx.developerSession.deleteMany({ where: { token_hash: tokenHash } });
      await audit(tx, "platform.developer.signed_out");
    });
  }

  async function listModules(rawToken: string) {
    await requireSession(rawToken);
    return listModuleStates(ports.db);
  }

  async function setModuleState(rawToken: string, moduleId: string, state: ModuleStateValue) {
    await requireSession(rawToken);
    return changeModuleState({
      moduleId,
      state,
      runTransaction: ports.runTransaction,
      auditWriter: ports.auditWriter,
      now,
      actorLabel: "developer-web",
    });
  }

  async function listIntegrationAccessFor(rawToken: string) {
    await requireSession(rawToken);
    return listIntegrationAccess(ports.db);
  }

  async function setIntegrationAccess(rawToken: string, moduleId: string, userId: string, allowed: boolean) {
    await requireSession(rawToken);
    return changeIntegrationAccess({ moduleId, userId, allowed, runTransaction: ports.runTransaction, auditWriter: ports.auditWriter, now, actorLabel: "developer-web" });
  }

  return { enrollmentState, enroll, reset, signIn, resolveSession, requireSession, signOut, listModules, setModuleState, listIntegrationAccess: listIntegrationAccessFor, setIntegrationAccess };
}
