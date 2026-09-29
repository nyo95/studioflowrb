"use server";

import { z } from "zod";

import { runSafeAction } from "@platform/core/actions";
import { requirePrincipal } from "@platform/core/auth";
import { validationError } from "@platform/core/validation";
import { messenger } from "@platform/runtime";

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

const Uuid = z.uuid();
const Limit = z.number().int().min(1).max(200).optional();

export async function getUnreadMessengerCountAction() {
  return runSafeAction(async () => {
    const principal = await requirePrincipal();
    return { unread: await messenger.countUnread(principal.userId) };
  });
}

export async function listMessengerPeopleAction() {
  return runSafeAction(async () => {
    const principal = await requirePrincipal();
    return messenger.listPeople(principal.userId);
  });
}

export async function listMessengerConversationsAction() {
  return runSafeAction(async () => {
    const principal = await requirePrincipal();
    return messenger.listConversations(principal.userId);
  });
}

export async function readMessengerConversationAction(conversationId: string, limit?: number) {
  return runSafeAction(async () => {
    const principal = await requirePrincipal();
    return messenger.readConversation(principal.userId, parse(Uuid, conversationId), parse(Limit, limit));
  });
}

export async function sendMessengerMessageAction(formData: FormData) {
  return runSafeAction(async () => {
    const principal = await requirePrincipal();
    const conversationIdRaw = formData.get("conversationId");
    const recipientUserIdRaw = formData.get("recipientUserId");
    const bodyRaw = formData.get("body");
    const files = formData.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
    return messenger.sendMessage({
      actorUserId: principal.userId,
      conversationId: typeof conversationIdRaw === "string" && conversationIdRaw ? parse(Uuid, conversationIdRaw) : null,
      recipientUserId: typeof recipientUserIdRaw === "string" && recipientUserIdRaw ? parse(Uuid, recipientUserIdRaw) : null,
      body: typeof bodyRaw === "string" ? bodyRaw : "",
      files: await Promise.all(files.map(async (file) => ({
        filename: file.name,
        contentType: file.type,
        body: new Uint8Array(await file.arrayBuffer()),
      }))),
    });
  });
}

export async function resolveMessengerAttachmentAction(attachmentId: string) {
  return runSafeAction(async () => {
    const principal = await requirePrincipal();
    return messenger.resolveAttachment(principal.userId, parse(Uuid, attachmentId));
  });
}
