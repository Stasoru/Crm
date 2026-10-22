"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formString } from "@/lib/format";
import { memberIdOrNull } from "@/lib/members";

export async function createTask(form: FormData) {
  const user = await requireUser();
  const title = formString(form, "title");
  if (!title) return;
  const dealId = formString(form, "dealId") || null;
  let contactId = formString(form, "contactId") || null;
  if (dealId) {
    const deal = await db.deal.findFirst({ where: { id: dealId, companyId: user.companyId } });
    if (!deal) throw new Error("Negócio não encontrado");
    contactId = deal.contactId;
  } else if (contactId && !(await db.contact.findFirst({ where: { id: contactId, companyId: user.companyId } }))) {
    throw new Error("Contato não encontrado");
  }
  const due = formString(form, "dueAt");
  await db.task.create({
    data: {
      companyId: user.companyId,
      title,
      dueAt: due ? new Date(due) : null,
      assigneeId: (await memberIdOrNull(user.companyId, formString(form, "assigneeId"))) ?? user.userId,
      dealId,
      contactId,
    },
  });
  revalidatePath("/", "layout");
}

export async function toggleTask(taskId: string) {
  const user = await requireUser();
  const task = await db.task.findFirst({ where: { id: taskId, companyId: user.companyId } });
  if (!task) return;
  await db.task.update({ where: { id: taskId }, data: { doneAt: task.doneAt ? null : new Date() } });
  revalidatePath("/", "layout");
}
