"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { endSession, startSession } from "@/lib/auth";
import { formString } from "@/lib/format";

export type FormState = { error?: string } | undefined;

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = formString(form, "email").toLowerCase();
  const password = formString(form, "password");
  const user = await db.user.findUnique({ where: { email }, include: { memberships: true } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return { error: "E-mail ou senha incorretos" };
  const membership = user.memberships[0];
  if (!membership) return { error: "Usuário sem empresa" };
  await startSession(user.id, membership.companyId);
  redirect("/dashboard");
}

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  const name = formString(form, "name");
  const companyName = formString(form, "company");
  const email = formString(form, "email").toLowerCase();
  const password = formString(form, "password");
  if (!name || !companyName || !email) return { error: "Preencha todos os campos" };
  if (password.length < 8) return { error: "A senha precisa ter pelo menos 8 caracteres" };
  if (await db.user.findUnique({ where: { email } })) return { error: "Este e-mail já está cadastrado" };

  const passwordHash = await bcrypt.hash(password, 10);
  const { user, company } = await db.$transaction(async (tx) => {
    const company = await tx.company.create({ data: { name: companyName } });
    const user = await tx.user.create({ data: { name, email, passwordHash } });
    await tx.membership.create({ data: { userId: user.id, companyId: company.id, role: "ADMIN" } });
    await tx.pipeline.create({
      data: {
        companyId: company.id,
        name: "Vendas",
        stages: {
          create: ["Novo lead", "Contato feito", "Proposta", "Negociação"].map((name, position) => ({ name, position })),
        },
      },
    });
    return { user, company };
  });
  await startSession(user.id, company.id);
  redirect("/dashboard");
}

export async function logout() {
  await endSession();
  redirect("/login");
}
