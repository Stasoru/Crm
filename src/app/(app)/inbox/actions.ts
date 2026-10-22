"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formString } from "@/lib/format";
import { memberIdOrNull } from "@/lib/members";
import { sendText } from "@/lib/whatsapp";

async function ownedConversation(companyId: string, id: string) {
  const conversation = await db.conversation.findFirst({ where: { id, companyId }, include: { channel: true, contact: true } });
  if (!conversation) throw new Error("Conversa não encontrada");
  return conversation;
}

export async function startConversation(contactId: string) {
  const user = await requireUser();
  const contact = await db.contact.findFirst({ where: { id: contactId, companyId: user.companyId } });
  if (!contact?.phone) throw new Error("O contato precisa de um telefone");
  const channel = await db.channel.findFirst({ where: { companyId: user.companyId }, orderBy: { createdAt: "asc" } });
  if (!channel) redirect("/settings#canais");
  const conversation = await db.conversation.upsert({
    where: { channelId_contactId: { channelId: channel.id, contactId } },
    create: { companyId: user.companyId, channelId: channel.id, contactId, assigneeId: user.userId },
    update: {},
  });
  redirect(`/inbox/${conversation.id}`);
}

export async function sendMessage(conversationId: string, form: FormData) {
  const user = await requireUser();
  const body = formString(form, "body");
  if (!body) return;
  const conversation = await ownedConversation(user.companyId, conversationId);
  const result = await sendText(conversation.channel, conversation.contact.phone ?? "", body);
  await db.message.create({
    data: {
      conversationId,
      direction: "OUT",
      body,
      externalId: result.ok ? result.externalId : null,
      error: result.ok ? null : result.error,
    },
  });
  await db.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date(), assigneeId: conversation.assigneeId ?? user.userId },
  });
  revalidatePath(`/inbox/${conversationId}`);
}

export async function assignConversation(conversationId: string, form: FormData) {
  const user = await requireUser();
  await ownedConversation(user.companyId, conversationId);
  await db.conversation.update({
    where: { id: conversationId },
    data: { assigneeId: await memberIdOrNull(user.companyId, formString(form, "assigneeId")) },
  });
  revalidatePath("/inbox", "layout");
}

export async function setConversationStatus(conversationId: string, status: "OPEN" | "CLOSED") {
  const user = await requireUser();
  await ownedConversation(user.companyId, conversationId);
  await db.conversation.update({ where: { id: conversationId }, data: { status } });
  revalidatePath("/inbox", "layout");
}
