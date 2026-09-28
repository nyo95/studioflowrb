import type { TransactionClient } from "@platform/core/db";
import { AUDIT_APP_IDS, type AuditAppId } from "@platform/core/audit";

/**
 * Domain-neutral in-app notification envelope and transactional writer port (CORE.md §15, activated by the first
 * approved in-app workflow: sample requests).
 *
 * Core owns only the envelope, its safety rules, and the writer port. An app decides who is told, when, what the
 * text says, and where the link goes; it writes the notification inside the SAME transaction as the event that
 * caused it, so a rolled-back event tells nobody. Deliberately absent: delivery channels (email, push), user
 * preferences, digests, and any vocabulary of notification kinds.
 */

export type NotificationTransactionContext = TransactionClient;

export type NotificationInput = {
  /** Users to tell. Duplicates and blanks are ignored; an empty list writes nothing. */
  recipientUserIds: readonly string[];
  /** The app that emits it; the kind must start with this id. */
  appId: AuditAppId;
  /** Dotted, lowercase, app-owned, e.g. "masterdata.sample-request.priced". */
  kind: string;
  /** Short plain text shown in the inbox. */
  title: string;
  body?: string | null;
  /** A path inside this application (starts with a single "/"), never an external address. */
  href?: string | null;
  /** The thing this is about, so an app can find its own notifications later. */
  entity?: { type: string; id: string } | null;
};

export type PreparedNotification = {
  recipientUserIds: string[];
  appId: AuditAppId;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  entityType: string | null;
  entityId: string | null;
};

export interface NotificationWriter {
  /** Writes one inbox item per distinct recipient inside the caller's transaction. Returns how many were written. */
  notify(input: NotificationInput, tx: NotificationTransactionContext): Promise<number>;
}

export type NotificationView = {
  id: string;
  appId: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  createdAt: Date;
  readAt: Date | null;
};

export const NOTIFICATION_TITLE_MAX = 120;
export const NOTIFICATION_BODY_MAX = 300;
export const NOTIFICATION_HREF_MAX = 300;
export const NOTIFICATION_RECIPIENTS_MAX = 200;
const ENTITY_MAX = 120;
const KIND_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*){1,3}$/;

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/** A link must stay inside the app: a single leading slash, no scheme, no protocol-relative form, no control characters. */
export function isSafeInternalHref(href: string): boolean {
  return (
    href.length <= NOTIFICATION_HREF_MAX &&
    href.startsWith("/") &&
    !href.startsWith("//") &&
    !href.includes("\\") &&
    !/[\u0000-\u001f\u007f\s]/.test(href)
  );
}

/** Validates and normalizes an input. Throws a plain Error: a bad notification is a programming mistake, not user input. */
export function prepareNotification(input: NotificationInput): PreparedNotification {
  if (!AUDIT_APP_IDS.includes(input.appId)) throw new Error(`Invalid notification appId: ${JSON.stringify(input.appId)}.`);
  if (!KIND_PATTERN.test(input.kind) || !input.kind.startsWith(`${input.appId}.`)) {
    throw new Error(`Notification kind must be dotted lowercase and start with "${input.appId}.".`);
  }
  const title = clean(input.title);
  if (!title || title.length > NOTIFICATION_TITLE_MAX) throw new Error(`Notification title must be 1 to ${NOTIFICATION_TITLE_MAX} characters.`);
  const body = clean(input.body);
  if (body && body.length > NOTIFICATION_BODY_MAX) throw new Error(`Notification body must be at most ${NOTIFICATION_BODY_MAX} characters.`);
  const href = clean(input.href);
  if (href && !isSafeInternalHref(href)) throw new Error("Notification href must be a path inside the application.");
  const entityType = clean(input.entity?.type);
  const entityId = clean(input.entity?.id);
  if (input.entity && (!entityType || !entityId || entityType.length > ENTITY_MAX || entityId.length > ENTITY_MAX)) {
    throw new Error("Notification entity needs a type and an id.");
  }
  const recipientUserIds = [...new Set(input.recipientUserIds.map((id) => id.trim()).filter((id) => id !== ""))];
  if (recipientUserIds.length > NOTIFICATION_RECIPIENTS_MAX) {
    throw new Error(`A notification may have at most ${NOTIFICATION_RECIPIENTS_MAX} recipients.`);
  }
  return { recipientUserIds, appId: input.appId, kind: input.kind, title, body, href, entityType, entityId };
}
