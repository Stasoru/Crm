import { db } from "./db";
import type { InboundMessage } from "./whatsapp";

// Stores one inbound WhatsApp message: finds or creates the contact and the conversation.
export async function storeInboundMessage(msg: InboundMessage) {
  const channel = await db.channel.findUnique({ where: { phoneNumberId: msg.phoneNumberId } });
  if (!channel) return { stored: false as const, reason: "unknown channel" };
  if (await db.message.findUnique({ where: { externalId: msg.externalId } })) return { stored: false as const, reason: "duplicate" };

  const companyId = channel.companyId;
  let contact = await db.contact.findUnique({ where: { companyId_phone: { companyId, phone: msg.from } } });
  if (!contact) {
    contact = await db.contact.create({
      data: { companyId, phone: msg.from, name: msg.profileName ?? msg.from, source: "WhatsApp" },
    });
    await db.activity.create({ data: { companyId, contactId: contact.id, kind: "created", text: "Contato criado por mensagem no WhatsApp" } });
  }

  const conversation = await db.conversation.upsert({
    where: { channelId_contactId: { channelId: channel.id, contactId: contact.id } },
    create: { companyId, channelId: channel.id, contactId: contact.id, assigneeId: contact.ownerId, lastMessageAt: msg.timestamp },
    update: { status: "OPEN", lastMessageAt: msg.timestamp },
  });
  await db.message.create({
    data: { conversationId: conversation.id, direction: "IN", body: msg.body, externalId: msg.externalId, createdAt: msg.timestamp },
  });
  return { stored: true as const, conversationId: conversation.id };
}
