import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ContactFields } from "@/components/contact-form";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { listMembers } from "@/lib/members";
import { createContact } from "./actions";

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string }> }) {
  const user = await requireUser();
  const { q = "", tag = "" } = await searchParams;
  const where: Prisma.ContactWhereInput = { companyId: user.companyId };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q.replace(/\D/g, "") || q } },
    ];
  }
  if (tag) where.tags = { has: tag.toLowerCase() };
  const [contacts, members] = await Promise.all([
    db.contact.findMany({ where, include: { owner: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    listMembers(user.companyId),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Contatos" />
      <form className="flex flex-wrap gap-2">
        <input className="input max-w-xs" name="q" placeholder="Buscar por nome, e-mail ou telefone" defaultValue={q} />
        <input className="input max-w-[10rem]" name="tag" placeholder="Tag" defaultValue={tag} />
        <button className="btn-secondary">Filtrar</button>
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">Telefone</th>
              <th className="px-4 py-2">Origem</th>
              <th className="px-4 py-2">Tags</th>
              <th className="px-4 py-2">Responsável</th>
              <th className="px-4 py-2">Criado em</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-2 font-medium">
                  <Link className="text-brand-700 hover:underline" href={`/contacts/${c.id}`}>{c.name}</Link>
                </td>
                <td className="px-4 py-2">{c.phone ?? "—"}</td>
                <td className="px-4 py-2">{c.source ?? "—"}</td>
                <td className="px-4 py-2">
                  {c.tags.map((t) => (
                    <span key={t} className="mr-1 rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700">{t}</span>
                  ))}
                </td>
                <td className="px-4 py-2">{c.owner?.name ?? "—"}</td>
                <td className="px-4 py-2">{formatDate(c.createdAt)}</td>
              </tr>
            ))}
            {!contacts.length && (
              <tr><td className="px-4 py-6 text-center text-slate-500" colSpan={6}>Nenhum contato encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <details className="card">
        <summary className="cursor-pointer text-sm font-medium">Novo contato</summary>
        <form action={createContact} className="mt-4 space-y-3">
          <ContactFields members={members} />
          <button className="btn">Salvar contato</button>
        </form>
      </details>
    </div>
  );
}
