"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formString, normalizePhone, parseTags } from "@/lib/format";
import { memberIdOrNull } from "@/lib/members";

async function contactFields(companyId: string, form: FormData) {
  const name = formString(form, "name");
  if (!name) throw new Error("Nome é obrigatório");
  return {
    name,
    phone: normalizePhone(formString(form, "phone")),
    email: formString(form, "email") || null,
    source: formString(form, "source") || null,
    tags: parseTags(formString(form, "tags")),
    ownerId: await memberIdOrNull(companyId, formString(form, "ownerId")),
  };
}

export async function createContact(form: FormData) {
  const user = await requireUser();
  const data = await contactFields(user.companyId, form);
  const existing = data.phone
    ? await db.contact.findUnique({ where: { companyId_phone: { companyId: user.companyId, phone: data.phone } } })
    : null;
  // Same phone means same person: open the existing record instead of failing.
  if (existing) redirect(`/contacts/${existing.id}`);
  const contact = await db.contact.create({ data: { ...data, companyId: user.companyId } });
  await db.activity.create({
    data: { companyId: user.companyId, contactId: contact.id, userId: user.userId, kind: "created", text: "Contato criado" },
  });
  redirect(`/contacts/${contact.id}`);
}

export async function updateContact(id: string, form: FormData) {
  const user = await requireUser();
  const data = await contactFields(user.companyId, form);
  await db.contact.updateMany({ where: { id, companyId: user.companyId }, data });
  revalidatePath(`/contacts/${id}`);
}

export async function addContactNote(id: string, form: FormData) {
  const user = await requireUser();
  const text = formString(form, "text");
  const contact = await db.contact.findFirst({ where: { id, companyId: user.companyId } });
  if (!text || !contact) return;
  await db.activity.create({ data: { companyId: user.companyId, contactId: id, userId: user.userId, kind: "note", text } });
  revalidatePath(`/contacts/${id}`);
}

export async function deleteContact(id: string) {
  const user = await requireUser();
  await db.contact.deleteMany({ where: { id, companyId: user.companyId } });
  redirect("/contacts");
}
