import { AppError } from "@platform/core/errors";
import { createPrivateObjectKey, type ObjectStorage } from "@platform/core/storage";
import type { PrismaClient } from "@/generated/prisma/client";

export const MESSENGER_ATTACHMENT_TTL_MINUTES = 30;
export const MESSENGER_ATTACHMENT_MAX_FILES = 5;
export const MESSENGER_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

type Db = PrismaClient;
type Now = () => Date;

export type MessengerFileInput = {
  filename: string;
  contentType: string;
  body: Uint8Array;
};

export type MessengerConversationSummary = {
  id: string;
  otherUser: { id: string; displayName: string; active: boolean };
  lastMessage: string;
  lastMessageAt: Date | null;
  unread: number;
};

export type MessengerMessageView = {
  id: string;
  authorUserId: string;
  authorName: string;
  body: string | null;
  createdAt: Date;
  attachments: Array<{
    id: string;
    filename: string;
    contentType: string;
    bytes: number;
    expiresAt: Date;
    available: boolean;
    readUrl: string | null;
  }>;
};

function pairKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

function cleanText(value: string | null | undefined, max = 4_000): string | null {
  const text = (value ?? "").trim();
  if (!text) return null;
  return text.slice(0, max);
}

function safeName(name: string): string {
  const cleaned = name.trim().replace(/[^\w.\- ]+/g, "_").slice(0, 160);
  return cleaned || "attachment";
}

function extensionFor(name: string, contentType: string): string {
  const fromName = name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (fromName && fromName.length <= 5) return fromName;
  if (contentType.includes("png")) return "png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("pdf")) return "pdf";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("text")) return "txt";
  return "bin";
}

function assertParticipant(row: { participants: Array<{ user_id: string }> } | null, userId: string): void {
  if (!row || !row.participants.some((participant) => participant.user_id === userId)) {
    throw new AppError("NOT_FOUND", "MESSENGER_CONVERSATION_NOT_FOUND", "Conversation not found.");
  }
}

export function createMessengerService(db: Db, storage: ObjectStorage, options: { now?: Now } = {}) {
  const now = options.now ?? (() => new Date());

  async function activeUser(userId: string) {
    const user = await db.user.findFirst({ where: { id: userId, status: "ACTIVE" }, select: { id: true, display_name: true, status: true } });
    if (!user) throw new AppError("NOT_FOUND", "MESSENGER_USER_NOT_FOUND", "User not found.");
    return user;
  }

  async function requireConversation(conversationId: string, userId: string) {
    const conversation = await db.messengerConversation.findUnique({
      where: { id: conversationId },
      include: { participants: true },
    });
    assertParticipant(conversation, userId);
    return conversation!;
  }

  async function getOrCreateConversation(userId: string, otherUserId: string) {
    if (userId === otherUserId) {
      throw new AppError("VALIDATION", "MESSENGER_SELF_RECIPIENT", "Choose another person.");
    }
    await activeUser(otherUserId);
    const key = pairKey(userId, otherUserId);
    return db.messengerConversation.upsert({
      where: { pair_key: key },
      create: {
        pair_key: key,
        participants: { create: [{ user_id: userId }, { user_id: otherUserId }] },
      },
      update: {},
      include: { participants: true },
    });
  }

  async function buildMessageView(message: Awaited<ReturnType<typeof db.messengerMessage.findMany>>[number], participantIds: string[]): Promise<MessengerMessageView> {
    const users = await db.user.findMany({ where: { id: { in: participantIds } }, select: { id: true, display_name: true, status: true } });
    const userById = new Map(users.map((user) => [user.id, user.display_name]));
    const current = now();
    return {
      id: message.id,
      authorUserId: message.author_user_id,
      authorName: userById.get(message.author_user_id) ?? "Unknown user",
      body: message.body,
      createdAt: message.created_at,
      attachments: await Promise.all((message as typeof message & { attachments?: Array<{
        id: string; filename: string; content_type: string; bytes: number; expires_at: Date; purged_at: Date | null; storage_key: string | null;
      }> }).attachments?.map(async (attachment) => {
        const available = Boolean(attachment.storage_key && !attachment.purged_at && attachment.expires_at > current);
        let readUrl: string | null = null;
        if (available && attachment.storage_key) {
          try {
            readUrl = await storage.createSignedReadUrl(attachment.storage_key, 300);
          } catch {
            readUrl = null;
          }
        }
        return {
          id: attachment.id,
          filename: attachment.filename,
          contentType: attachment.content_type,
          bytes: attachment.bytes,
          expiresAt: attachment.expires_at,
          available: Boolean(readUrl),
          readUrl,
        };
      }) ?? []),
    };
  }

  return {
    async listPeople(actorUserId: string) {
      const rows = await db.user.findMany({
        where: { status: "ACTIVE", id: { not: actorUserId } },
        select: { id: true, display_name: true },
        orderBy: [{ display_name: "asc" }, { id: "asc" }],
      });
      return rows.map((row) => ({ id: row.id, displayName: row.display_name }));
    },

    async countUnread(actorUserId: string): Promise<number> {
      const mine = await db.messengerParticipant.findMany({
        where: { user_id: actorUserId },
        select: { conversation_id: true, last_read_at: true },
      });
      let total = 0;
      for (const participant of mine) {
        total += await db.messengerMessage.count({
          where: {
            conversation_id: participant.conversation_id,
            author_user_id: { not: actorUserId },
            ...(participant.last_read_at ? { created_at: { gt: participant.last_read_at } } : {}),
          },
        });
      }
      return total;
    },

    async listConversations(actorUserId: string): Promise<MessengerConversationSummary[]> {
      const mine = await db.messengerParticipant.findMany({
        where: { user_id: actorUserId },
        include: {
          conversation: {
            include: {
              participants: true,
              messages: { orderBy: { created_at: "desc" }, take: 1, include: { attachments: true } },
            },
          },
        },
        orderBy: { conversation: { updated_at: "desc" } },
      });
      const otherIds = mine.map((row) => row.conversation.participants.find((participant) => participant.user_id !== actorUserId)?.user_id).filter((id): id is string => Boolean(id));
      const users = await db.user.findMany({ where: { id: { in: otherIds } }, select: { id: true, display_name: true, status: true } });
      const userById = new Map(users.map((user) => [user.id, user]));
      const rows: MessengerConversationSummary[] = [];
      for (const row of mine) {
        const otherId = row.conversation.participants.find((participant) => participant.user_id !== actorUserId)?.user_id;
        if (!otherId) continue;
        const other = userById.get(otherId);
        const last = row.conversation.messages[0] ?? null;
        rows.push({
          id: row.conversation_id,
          otherUser: { id: otherId, displayName: other?.display_name ?? "Unknown user", active: other?.status === "ACTIVE" },
          lastMessage: last?.body ?? (last?.attachments.length ? "Attachment" : ""),
          lastMessageAt: last?.created_at ?? null,
          unread: await db.messengerMessage.count({
            where: {
              conversation_id: row.conversation_id,
              author_user_id: { not: actorUserId },
              ...(row.last_read_at ? { created_at: { gt: row.last_read_at } } : {}),
            },
          }),
        });
      }
      return rows;
    },

    async readConversation(actorUserId: string, conversationId: string, limit = 100) {
      const conversation = await requireConversation(conversationId, actorUserId);
      const messages = await db.messengerMessage.findMany({
        where: { conversation_id: conversationId },
        orderBy: { created_at: "asc" },
        take: Math.min(Math.max(limit, 1), 200),
        include: { attachments: true },
      });
      await db.messengerParticipant.updateMany({
        where: { conversation_id: conversationId, user_id: actorUserId },
        data: { last_read_at: now() },
      });
      return Promise.all(messages.map((message) => buildMessageView(message, conversation.participants.map((participant) => participant.user_id))));
    },

    async sendMessage(input: { actorUserId: string; recipientUserId?: string | null; conversationId?: string | null; body?: string | null; files?: MessengerFileInput[] }) {
      const body = cleanText(input.body);
      const files = input.files ?? [];
      if (files.length > MESSENGER_ATTACHMENT_MAX_FILES) throw new AppError("VALIDATION", "MESSENGER_TOO_MANY_FILES", "Attach at most 5 files.");
      if (!body && files.length === 0) throw new AppError("VALIDATION", "MESSENGER_MESSAGE_EMPTY", "Write a message or attach a file.");
      const conversation = input.conversationId
        ? await requireConversation(input.conversationId, input.actorUserId)
        : await getOrCreateConversation(input.actorUserId, input.recipientUserId ?? "");

      const expiresAt = new Date(now().getTime() + MESSENGER_ATTACHMENT_TTL_MINUTES * 60_000);
      const prepared = [];
      for (const file of files) {
        if (file.body.byteLength > MESSENGER_ATTACHMENT_MAX_BYTES) throw new AppError("VALIDATION", "MESSENGER_FILE_TOO_LARGE", "Each attachment must be 10 MB or smaller.");
        const filename = safeName(file.filename);
        const contentType = file.contentType || "application/octet-stream";
        const key = createPrivateObjectKey(`messenger/${conversation.id}`, extensionFor(filename, contentType));
        await storage.put({ key, body: file.body, bytes: file.body.byteLength, contentType });
        prepared.push({ filename, contentType, bytes: file.body.byteLength, key });
      }

      const message = await db.messengerMessage.create({
        data: {
          conversation_id: conversation.id,
          author_user_id: input.actorUserId,
          body,
          created_at: now(),
          attachments: {
            create: prepared.map((file) => ({
              filename: file.filename,
              content_type: file.contentType,
              bytes: file.bytes,
              storage_key: file.key,
              expires_at: expiresAt,
            })),
          },
        },
        include: { attachments: true },
      });
      await db.messengerConversation.update({ where: { id: conversation.id }, data: { updated_at: message.created_at } });
      await db.messengerParticipant.updateMany({ where: { conversation_id: conversation.id, user_id: input.actorUserId }, data: { last_read_at: message.created_at } });
      return { conversationId: conversation.id, messageId: message.id };
    },

    async resolveAttachment(actorUserId: string, attachmentId: string) {
      const attachment = await db.messengerAttachment.findUnique({
        where: { id: attachmentId },
        include: { message: { include: { conversation: { include: { participants: true } } } } },
      });
      assertParticipant(attachment?.message.conversation ?? null, actorUserId);
      if (!attachment?.storage_key || attachment.purged_at || attachment.expires_at <= now()) {
        throw new AppError("NOT_FOUND", "MESSENGER_ATTACHMENT_EXPIRED", "This attachment is no longer available.");
      }
      return {
        filename: attachment.filename,
        contentType: attachment.content_type,
        readUrl: await storage.createSignedReadUrl(attachment.storage_key, 300),
      };
    },

    async cleanupExpiredAttachments(limit = 50) {
      const expired = await db.messengerAttachment.findMany({
        where: { expires_at: { lte: now() }, purged_at: null, storage_key: { not: null } },
        orderBy: { expires_at: "asc" },
        take: Math.min(Math.max(limit, 1), 200),
      });
      let purged = 0;
      for (const attachment of expired) {
        if (attachment.storage_key) await storage.remove(attachment.storage_key);
        await db.messengerAttachment.update({
          where: { id: attachment.id },
          data: { storage_key: null, purged_at: now() },
        });
        purged += 1;
      }
      return { purged };
    },
  };
}

export type MessengerService = ReturnType<typeof createMessengerService>;
