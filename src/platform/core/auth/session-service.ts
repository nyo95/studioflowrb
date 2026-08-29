import type { Prisma, PrismaClient } from "@/generated/prisma/client";

import { generateSessionToken, hashSessionToken } from "./token";

/**
 * Revocable database session service (CORE.md §3, Foundation F0 locked
 * decision).
 *
 * - idle expiry 12 hours; absolute expiry fixed at login, 7 days;
 * - after 15 minutes since the last persisted touch, a resolution atomically
 *   sets `lastSeenAt = now` and extends idle expiry to
 *   `min(absoluteExpiresAt, now + 12 hours)`;
 * - every check verifies token hash, revocation, both expiries, User status,
 *   and live Role assignments from the database — never a cache;
 * - raw tokens never reach persistence; only the SHA-256 digest is stored.
 *
 * Functions take an explicit Prisma/transaction client so they compose inside
 * the caller's transaction and stay testable without Next.js request state.
 */

export type DbClient = PrismaClient | Prisma.TransactionClient;

export type SessionWindowConfig = {
  /** Idle expiry. Default 12 hours. */
  idleMs: number;
  /** Non-sliding absolute expiry, fixed at login. Default 7 days. */
  absoluteMs: number;
  /** Minimum interval between persisted last-seen writes. Default 15 minutes. */
  touchIntervalMs: number;
};

export const DEFAULT_SESSION_WINDOW: SessionWindowConfig = {
  idleMs: 12 * 60 * 60 * 1000,
  absoluteMs: 7 * 24 * 60 * 60 * 1000,
  touchIntervalMs: 15 * 60 * 1000,
};

const METADATA_MAX_LENGTH = 255;

export type CreatedSession = {
  sessionId: string;
  /** Raw browser token. Handle only in memory and the cookie — never persist or log. */
  rawToken: string;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  /** Cookie lifetime must never outlive the absolute session expiry. */
  cookieExpiresAt: Date;
};

export type SessionClientMetadata = {
  userAgent?: string | null;
  clientAddress?: string | null;
};

/** Creates a session row from a fresh random token. */
export async function createSession(
  db: DbClient,
  input: { userId: string; now?: Date; window?: SessionWindowConfig } & SessionClientMetadata,
): Promise<CreatedSession> {
  const now = input.now ?? new Date();
  const window = input.window ?? DEFAULT_SESSION_WINDOW;
  const rawToken = generateSessionToken();
  const idleExpiresAt = new Date(now.getTime() + window.idleMs);
  const absoluteExpiresAt = new Date(now.getTime() + window.absoluteMs);
  const row = await db.session.create({
    data: {
      token_hash: hashSessionToken(rawToken),
      user_id: input.userId,
      created_at: now,
      last_seen_at: now,
      idle_expires_at: idleExpiresAt < absoluteExpiresAt ? idleExpiresAt : absoluteExpiresAt,
      absolute_expires_at: absoluteExpiresAt,
      user_agent: boundedMetadata(input.userAgent),
      client_address: boundedMetadata(input.clientAddress),
    },
    select: { id: true },
  });
  return {
    sessionId: row.id,
    rawToken,
    idleExpiresAt: idleExpiresAt < absoluteExpiresAt ? idleExpiresAt : absoluteExpiresAt,
    absoluteExpiresAt,
    cookieExpiresAt: absoluteExpiresAt,
  };
}

export type ResolvedSession = {
  sessionId: string;
  user: {
    id: string;
    displayName: string;
    email: string;
    status: "ACTIVE" | "DISABLED";
  };
  /** Live (non-archived) role IDs. Empty for a role-less user — callers must reject. */
  roleIds: string[];
};

export type SessionRejection =
  | "NOT_FOUND"
  | "REVOKED"
  | "EXPIRED"
  | "USER_DISABLED"
  | "ROLE_LESS";

function isExpired(
  session: { idle_expires_at: Date; absolute_expires_at: Date },
  now: Date,
): boolean {
  return session.absolute_expires_at.getTime() <= now.getTime() ||
    session.idle_expires_at.getTime() <= now.getTime();
}

/**
 * Resolves a raw session token against live database state and applies the
 * throttled last-seen touch. Returns `null` with a rejection reason for every
 * invalid state; callers treat all rejections identically.
 */
export async function resolveSession(
  db: DbClient,
  rawToken: string,
  options: { now?: Date; window?: SessionWindowConfig } = {},
): Promise<{ session: ResolvedSession } | { session: null; rejected: SessionRejection }> {
  const now = options.now ?? new Date();
  const window = options.window ?? DEFAULT_SESSION_WINDOW;

  if (typeof rawToken !== "string" || rawToken.length === 0) {
    return { session: null, rejected: "NOT_FOUND" };
  }

  const row = await db.session.findUnique({
    where: { token_hash: hashSessionToken(rawToken) },
    select: {
      id: true,
      revoked_at: true,
      idle_expires_at: true,
      absolute_expires_at: true,
      last_seen_at: true,
      user: {
        select: { id: true, display_name: true, email: true, status: true },
      },
    },
  });
  if (!row) return { session: null, rejected: "NOT_FOUND" };
  if (row.revoked_at !== null) return { session: null, rejected: "REVOKED" };
  if (isExpired(row, now)) return { session: null, rejected: "EXPIRED" };
  if (row.user.status === "DISABLED") return { session: null, rejected: "USER_DISABLED" };

  const assignments = await db.userRole.findMany({
    where: { user_id: row.user.id, role: { archived_at: null } },
    select: { role_id: true },
  });
  if (assignments.length === 0) return { session: null, rejected: "ROLE_LESS" };

  // Throttled touch: at most one persisted write per touch interval. Expiry
  // checks above remain authoritative even when the write is skipped.
  if (now.getTime() - row.last_seen_at.getTime() >= window.touchIntervalMs) {
    const idleExpiresAt = new Date(Math.min(
      row.absolute_expires_at.getTime(),
      now.getTime() + window.idleMs,
    ));
    await db.session.update({
      where: { id: row.id },
      data: { last_seen_at: now, idle_expires_at: idleExpiresAt },
      select: { id: true },
    });
  }

  return {
    session: {
      sessionId: row.id,
      user: {
        id: row.user.id,
        displayName: row.user.display_name,
        email: row.user.email,
        status: row.user.status,
      },
      roleIds: assignments.map((assignment) => assignment.role_id),
    },
  };
}

/** Revokes one session row by its database ID. Returns false when it was already revoked or absent. */
export async function revokeSessionById(db: DbClient, sessionId: string, options: { now?: Date } = {}): Promise<boolean> {
  const now = options.now ?? new Date();
  const updated = await db.session.updateMany({
    where: { id: sessionId, revoked_at: null },
    data: { revoked_at: now },
  });
  return updated.count > 0;
}

/** Revokes one session row by its raw token (ordinary logout). */
export async function revokeSessionByToken(db: DbClient, rawToken: string, options: { now?: Date } = {}): Promise<boolean> {
  if (typeof rawToken !== "string" || rawToken.length === 0) return false;
  const now = options.now ?? new Date();
  const updated = await db.session.updateMany({
    where: { token_hash: hashSessionToken(rawToken), revoked_at: null },
    data: { revoked_at: now },
  });
  return updated.count > 0;
}

/** Revokes every active session row of a user ("log out all", disable, password change). */
export async function revokeAllUserSessions(db: DbClient, userId: string, options: { now?: Date } = {}): Promise<number> {
  const now = options.now ?? new Date();
  const updated = await db.session.updateMany({
    where: { user_id: userId, revoked_at: null },
    data: { revoked_at: now },
  });
  return updated.count;
}

export type SessionListItem = {
  id: string;
  createdAt: Date;
  lastSeenAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
  userAgent: string | null;
  clientAddress: string | null;
};

/** Lists a user's sessions, newest first, including revoked rows for transparency. */
export async function listUserSessions(db: DbClient, userId: string): Promise<SessionListItem[]> {
  const rows = await db.session.findMany({
    where: { user_id: userId },
    select: {
      id: true,
      created_at: true,
      last_seen_at: true,
      idle_expires_at: true,
      absolute_expires_at: true,
      revoked_at: true,
      user_agent: true,
      client_address: true,
    },
    orderBy: { created_at: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    idleExpiresAt: row.idle_expires_at,
    absoluteExpiresAt: row.absolute_expires_at,
    revokedAt: row.revoked_at,
    userAgent: row.user_agent,
    clientAddress: row.client_address,
  }));
}

function boundedMetadata(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > METADATA_MAX_LENGTH ? trimmed.slice(0, METADATA_MAX_LENGTH) : trimmed;
}
