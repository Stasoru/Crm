"use server";

import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formString } from "@/lib/format";

export async function renameCompany(form: FormData) {
  const user = await requireAdmin();
  const name = formString(form, "name");
  if (name) await db.company.update({ where: { id: user.companyId }, data: { name } });
  revalidatePath("/", "layout");
}

export async function addMember(form: FormData) {
  const user = await requireAdmin();
  const email = formString(form, "email").toLowerCase();
  const name = formString(form, "name");
  const password = formString(form, "password");
  const role = formString(form, "role") === "ADMIN" ? "ADMIN" : "SELLER";
  if (!email || !name) throw new Error("Informe nome e e-mail");
  let member = await db.user.findUnique({ where: { email } });
  if (!member) {
    if (password.length < 8) throw new Error("A senha inicial precisa ter pelo menos 8 caracteres");
    member = await db.user.create({ data: { email, name, passwordHash: await bcrypt.hash(password, 10) } });
  }
  await db.membership.upsert({
    where: { userId_companyId: { userId: member.id, companyId: user.companyId } },
    create: { userId: member.id, companyId: user.companyId, role },
    update: { role },
  });
  revalidatePath("/settings");
}

export async function removeMember(userId: string) {
  const user = await requireAdmin();
  if (userId === user.userId) throw new Error("Você não pode remover a si mesmo");
  await db.membership.deleteMany({ where: { userId, companyId: user.companyId } });
  revalidatePath("/settings");
}

export async function addProduct(form: FormData) {
  const user = await requireAdmin();
  const name = formString(form, "name");
  const raw = formString(form, "price");
  const price = Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw) || 0;
  if (name) await db.product.create({ data: { companyId: user.companyId, name, price } });
  revalidatePath("/settings");
}

export async function deleteProduct(productId: string) {
  const user = await requireAdmin();
  await db.product.deleteMany({ where: { id: productId, companyId: user.companyId } });
  revalidatePath("/settings");
}

export async function addChannel(form: FormData) {
  const user = await requireAdmin();
  const phoneNumberId = formString(form, "phoneNumberId");
  const accessToken = formString(form, "accessToken");
  if (!phoneNumberId || !accessToken) throw new Error("Informe o Phone number ID e o token");
  await db.channel.create({
    data: {
      companyId: user.companyId,
      name: formString(form, "name") || "WhatsApp",
      phoneNumberId,
      accessToken,
      verifyToken: crypto.randomBytes(16).toString("hex"),
    },
  });
  revalidatePath("/settings");
}

export async function deleteChannel(channelId: string) {
  const user = await requireAdmin();
  await db.channel.deleteMany({ where: { id: channelId, companyId: user.companyId } });
  revalidatePath("/settings");
}
