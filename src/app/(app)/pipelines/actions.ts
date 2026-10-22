"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formString, normalizePhone } from "@/lib/format";
import { memberIdOrNull } from "@/lib/members";

const DEFAULT_STAGES = ["Novo lead", "Contato feito", "Proposta", "Negociação"];

async function ownedPipeline(companyId: string, pipelineId: string) {
  const pipeline = await db.pipeline.findFirst({ where: { id: pipelineId, companyId } });
  if (!pipeline) throw new Error("Funil não encontrado");
  return pipeline;
}

async function ownedDeal(companyId: string, dealId: string) {
  const deal = await db.deal.findFirst({ where: { id: dealId, companyId }, include: { stage: true } });
  if (!deal) throw new Error("Negócio não encontrado");
  return deal;
}

function parseMoney(input: string) {
  // Accepts "1.234,56", "1234.56" and "1234".
  const normalized = input.includes(",") ? input.replace(/\./g, "").replace(",", ".") : input;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

// ---------- Pipelines and stages ----------

export async function createPipeline(form: FormData) {
  const user = await requireAdmin();
  const name = formString(form, "name") || "Novo funil";
  const pipeline = await db.pipeline.create({
    data: {
      companyId: user.companyId,
      name,
      stages: { create: DEFAULT_STAGES.map((stage, position) => ({ name: stage, position })) },
    },
  });
  redirect(`/pipelines/${pipeline.id}/settings`);
}

export async function renamePipeline(pipelineId: string, form: FormData) {
  const user = await requireAdmin();
  await ownedPipeline(user.companyId, pipelineId);
  const name = formString(form, "name");
  if (name) await db.pipeline.update({ where: { id: pipelineId }, data: { name } });
  revalidatePath(`/pipelines/${pipelineId}`, "layout");
}

export async function deletePipeline(pipelineId: string) {
  const user = await requireAdmin();
  await ownedPipeline(user.companyId, pipelineId);
  const count = await db.pipeline.count({ where: { companyId: user.companyId } });
  if (count <= 1) throw new Error("A empresa precisa de pelo menos um funil");
  await db.$transaction([
    db.deal.deleteMany({ where: { pipelineId } }),
    db.pipeline.delete({ where: { id: pipelineId } }),
  ]);
  redirect("/pipelines");
}

export async function addStage(pipelineId: string, form: FormData) {
  const user = await requireAdmin();
  await ownedPipeline(user.companyId, pipelineId);
  const name = formString(form, "name");
  if (!name) return;
  const last = await db.stage.findFirst({ where: { pipelineId }, orderBy: { position: "desc" } });
  await db.stage.create({ data: { pipelineId, name, position: (last?.position ?? -1) + 1 } });
  revalidatePath(`/pipelines/${pipelineId}`, "layout");
}

export async function renameStage(stageId: string, form: FormData) {
  const user = await requireAdmin();
  const stage = await db.stage.findFirst({ where: { id: stageId, pipeline: { companyId: user.companyId } } });
  const name = formString(form, "name");
  if (!stage || !name) return;
  await db.stage.update({ where: { id: stageId }, data: { name } });
  revalidatePath(`/pipelines/${stage.pipelineId}`, "layout");
}

export async function shiftStage(stageId: string, direction: -1 | 1) {
  const user = await requireAdmin();
  const stage = await db.stage.findFirst({ where: { id: stageId, pipeline: { companyId: user.companyId } } });
  if (!stage) return;
  const stages = await db.stage.findMany({ where: { pipelineId: stage.pipelineId }, orderBy: { position: "asc" } });
  const index = stages.findIndex((s) => s.id === stageId);
  const other = stages[index + direction];
  if (!other) return;
  await db.$transaction([
    db.stage.update({ where: { id: stage.id }, data: { position: other.position } }),
    db.stage.update({ where: { id: other.id }, data: { position: stage.position } }),
  ]);
  revalidatePath(`/pipelines/${stage.pipelineId}`, "layout");
}

export async function deleteStage(stageId: string) {
  const user = await requireAdmin();
  const stage = await db.stage.findFirst({
    where: { id: stageId, pipeline: { companyId: user.companyId } },
    include: { _count: { select: { deals: true } } },
  });
  if (!stage) return;
  if (stage._count.deals > 0) throw new Error("Mova os negócios desta etapa antes de excluí-la");
  if ((await db.stage.count({ where: { pipelineId: stage.pipelineId } })) <= 1) throw new Error("O funil precisa de pelo menos uma etapa");
  await db.stage.delete({ where: { id: stageId } });
  revalidatePath(`/pipelines/${stage.pipelineId}`, "layout");
}

// ---------- Deals ----------

export async function createDeal(form: FormData) {
  const user = await requireUser();
  const pipeline = await ownedPipeline(user.companyId, formString(form, "pipelineId"));
  const stage = await db.stage.findFirst({ where: { pipelineId: pipeline.id }, orderBy: { position: "asc" } });
  if (!stage) throw new Error("O funil não tem etapas");

  let contactId = formString(form, "contactId");
  if (contactId) {
    const contact = await db.contact.findFirst({ where: { id: contactId, companyId: user.companyId } });
    if (!contact) throw new Error("Contato não encontrado");
  } else {
    const name = formString(form, "contactName");
    if (!name) throw new Error("Informe o contato");
    const phone = normalizePhone(formString(form, "contactPhone"));
    const existing = phone
      ? await db.contact.findUnique({ where: { companyId_phone: { companyId: user.companyId, phone } } })
      : null;
    contactId = existing?.id ?? (await db.contact.create({ data: { companyId: user.companyId, name, phone, ownerId: user.userId } })).id;
  }

  const contact = await db.contact.findUniqueOrThrow({ where: { id: contactId } });
  const deal = await db.deal.create({
    data: {
      companyId: user.companyId,
      pipelineId: pipeline.id,
      stageId: stage.id,
      contactId,
      ownerId: user.userId,
      title: formString(form, "title") || contact.name,
      value: parseMoney(formString(form, "value")),
    },
  });
  await db.activity.create({
    data: { companyId: user.companyId, dealId: deal.id, contactId, userId: user.userId, kind: "created", text: `Negócio criado em ${stage.name}` },
  });
  revalidatePath(`/pipelines/${pipeline.id}`);
  revalidatePath(`/contacts/${contactId}`);
}

export async function moveDeal(dealId: string, stageId: string) {
  const user = await requireUser();
  const deal = await ownedDeal(user.companyId, dealId);
  if (deal.stageId === stageId) return;
  const stage = await db.stage.findFirst({ where: { id: stageId, pipelineId: deal.pipelineId } });
  if (!stage) throw new Error("Etapa inválida");
  await db.deal.update({ where: { id: dealId }, data: { stageId, stageEnteredAt: new Date() } });
  await db.activity.create({
    data: {
      companyId: user.companyId,
      dealId,
      contactId: deal.contactId,
      userId: user.userId,
      kind: "stage",
      text: `Movido de ${deal.stage.name} para ${stage.name}`,
    },
  });
  revalidatePath(`/pipelines/${deal.pipelineId}`);
}

export async function setDealStatus(dealId: string, status: "OPEN" | "WON" | "LOST", form?: FormData) {
  const user = await requireUser();
  const deal = await ownedDeal(user.companyId, dealId);
  const lostReason = status === "LOST" ? formString(form ?? new FormData(), "lostReason") || null : null;
  await db.deal.update({
    where: { id: dealId },
    data: { status, lostReason, closedAt: status === "OPEN" ? null : new Date() },
  });
  const label = { OPEN: "Negócio reaberto", WON: "Negócio ganho", LOST: `Negócio perdido${lostReason ? `: ${lostReason}` : ""}` }[status];
  await db.activity.create({
    data: { companyId: user.companyId, dealId, contactId: deal.contactId, userId: user.userId, kind: "status", text: label },
  });
  revalidatePath(`/deals/${dealId}`);
  revalidatePath(`/pipelines/${deal.pipelineId}`);
}

export async function updateDeal(dealId: string, form: FormData) {
  const user = await requireUser();
  await ownedDeal(user.companyId, dealId);
  await db.deal.update({
    where: { id: dealId },
    data: {
      title: formString(form, "title") || undefined,
      value: parseMoney(formString(form, "value")),
      ownerId: await memberIdOrNull(user.companyId, formString(form, "ownerId")),
    },
  });
  revalidatePath(`/deals/${dealId}`);
}

export async function addDealNote(dealId: string, form: FormData) {
  const user = await requireUser();
  const deal = await ownedDeal(user.companyId, dealId);
  const text = formString(form, "text");
  if (!text) return;
  await db.activity.create({ data: { companyId: user.companyId, dealId, contactId: deal.contactId, userId: user.userId, kind: "note", text } });
  revalidatePath(`/deals/${dealId}`);
}

export async function addDealProduct(dealId: string, form: FormData) {
  const user = await requireUser();
  await ownedDeal(user.companyId, dealId);
  const product = await db.product.findFirst({ where: { id: formString(form, "productId"), companyId: user.companyId } });
  if (!product) return;
  const quantity = Math.max(1, Math.floor(Number(formString(form, "quantity")) || 1));
  await db.dealProduct.create({ data: { dealId, productId: product.id, quantity, unitPrice: product.price } });
  await syncDealValue(dealId);
  revalidatePath(`/deals/${dealId}`);
}

export async function removeDealProduct(dealProductId: string) {
  const user = await requireUser();
  const item = await db.dealProduct.findFirst({ where: { id: dealProductId, deal: { companyId: user.companyId } } });
  if (!item) return;
  await db.dealProduct.delete({ where: { id: item.id } });
  await syncDealValue(item.dealId);
  revalidatePath(`/deals/${item.dealId}`);
}

// When a deal has products, its value is the sum of its items.
async function syncDealValue(dealId: string) {
  const items = await db.dealProduct.findMany({ where: { dealId } });
  if (!items.length) return;
  const total = items.reduce((acc, i) => acc + Number(i.unitPrice) * i.quantity, 0);
  await db.deal.update({ where: { id: dealId }, data: { value: total } });
}
