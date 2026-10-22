// Demo data: `npm run db:seed`. Login: demo@fluxo.dev / demo1234
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const DAY = 86_400_000;

async function main() {
  if (await db.user.findUnique({ where: { email: "demo@fluxo.dev" } })) {
    console.log("Seed already applied");
    return;
  }
  const passwordHash = await bcrypt.hash("demo1234", 10);
  const company = await db.company.create({ data: { name: "Loja Demo" } });
  const admin = await db.user.create({ data: { name: "Ana Admin", email: "demo@fluxo.dev", passwordHash } });
  const seller = await db.user.create({ data: { name: "Bruno Vendas", email: "bruno@fluxo.dev", passwordHash } });
  await db.membership.createMany({
    data: [
      { userId: admin.id, companyId: company.id, role: "ADMIN" },
      { userId: seller.id, companyId: company.id, role: "SELLER" },
    ],
  });
  const pipeline = await db.pipeline.create({
    data: {
      companyId: company.id,
      name: "Vendas",
      stages: { create: ["Novo lead", "Contato feito", "Proposta", "Negociação"].map((name, position) => ({ name, position })) },
    },
    include: { stages: { orderBy: { position: "asc" } } },
  });
  await db.product.createMany({
    data: [
      { companyId: company.id, name: "Plano mensal", price: 197 },
      { companyId: company.id, name: "Consultoria", price: 1500 },
    ],
  });

  const people = [
    ["Carla Souza", "5511988880001", "Instagram"],
    ["Diego Lima", "5511988880002", "Indicação"],
    ["Elisa Rocha", "5511988880003", "Site"],
    ["Fábio Nunes", "5511988880004", "Instagram"],
    ["Gabi Torres", "5511988880005", "Anúncio"],
    ["Hugo Melo", "5511988880006", "Site"],
    ["Isa Prado", "5511988880007", "Indicação"],
    ["João Reis", "5511988880008", "Instagram"],
  ];
  for (const [i, [name, phone, source]] of people.entries()) {
    const owner = i % 2 ? seller : admin;
    const contact = await db.contact.create({ data: { companyId: company.id, name, phone, source, ownerId: owner.id, tags: i % 3 ? [] : ["vip"] } });
    const status = i === 6 ? "WON" : i === 7 ? "LOST" : "OPEN";
    const createdAt = new Date(Date.now() - (i + 2) * DAY);
    await db.deal.create({
      data: {
        companyId: company.id,
        pipelineId: pipeline.id,
        stageId: pipeline.stages[i % pipeline.stages.length].id,
        contactId: contact.id,
        ownerId: owner.id,
        title: `${name.split(" ")[0]} - ${i % 2 ? "Consultoria" : "Plano mensal"}`,
        value: i % 2 ? 1500 : 197,
        status,
        lostReason: status === "LOST" ? "Preço" : null,
        createdAt,
        stageEnteredAt: new Date(createdAt.getTime() + DAY),
        closedAt: status === "OPEN" ? null : new Date(),
      },
    });
  }
  await db.task.create({
    data: { companyId: company.id, title: "Ligar para a Carla", assigneeId: admin.id, dueAt: new Date(Date.now() - DAY) },
  });
  console.log("Seeded. Login: demo@fluxo.dev / demo1234");
}

main().finally(() => db.$disconnect());
