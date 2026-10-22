import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactFields } from "@/components/contact-form";
import { PageHeader } from "@/components/page-header";
import { TaskForm, TaskList } from "@/components/task-list";
import { Timeline } from "@/components/timeline";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { listMembers } from "@/lib/members";
import { createDeal } from "../../pipelines/actions";
import { createTask } from "../../tasks/actions";
import { startConversation } from "../../inbox/actions";
import { addContactNote, deleteContact, updateContact } from "../actions";

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const contact = await db.contact.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      deals: { include: { stage: true, pipeline: true }, orderBy: { createdAt: "desc" } },
      tasks: { include: { assignee: true }, orderBy: [{ doneAt: { sort: "asc", nulls: "first" } }, { dueAt: "asc" }] },
      activities: { include: { user: true }, orderBy: { createdAt: "desc" }, take: 100 },
      conversations: { select: { id: true } },
    },
  });
  if (!contact) notFound();
  const [members, pipelines] = await Promise.all([
    listMembers(user.companyId),
    db.pipeline.findMany({ where: { companyId: user.companyId }, orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title={contact.name}>
        {contact.conversations[0] ? (
          <Link className="btn" href={`/inbox/${contact.conversations[0].id}`}>Abrir conversa</Link>
        ) : (
          contact.phone && (
            <form action={startConversation.bind(null, contact.id)}>
              <button className="btn">Iniciar conversa</button>
            </form>
          )
        )}
        <form action={deleteContact.bind(null, contact.id)}>
          <button className="btn-secondary text-red-600">Excluir</button>
        </form>
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="card">
            <form action={updateContact.bind(null, contact.id)} className="space-y-3">
              <ContactFields members={members} contact={contact} />
              <button className="btn-secondary">Salvar alterações</button>
            </form>
          </section>
          <section className="card space-y-3">
            <h2 className="font-semibold">Negócios</h2>
            <ul className="divide-y divide-slate-100 text-sm">
              {contact.deals.map((d) => (
                <li key={d.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <Link className="font-medium text-brand-700 hover:underline" href={`/deals/${d.id}`}>{d.title}</Link>
                  <span className="text-slate-500">{d.pipeline.name} · {d.status === "OPEN" ? d.stage.name : d.status === "WON" ? "Ganho" : "Perdido"}</span>
                  <span>{formatMoney(d.value)}</span>
                </li>
              ))}
            </ul>
            <form action={createDeal} className="flex flex-wrap gap-2">
              <input type="hidden" name="contactId" value={contact.id} />
              <select className="input max-w-48" name="pipelineId">
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <input className="input max-w-48" name="title" placeholder="Título" />
              <input className="input max-w-32" name="value" placeholder="Valor" inputMode="decimal" />
              <button className="btn-secondary">Novo negócio</button>
            </form>
          </section>
          <section className="card space-y-3">
            <h2 className="font-semibold">Tarefas</h2>
            <TaskForm action={createTask} members={members} hidden={{ contactId: contact.id }} />
            <TaskList tasks={contact.tasks} />
          </section>
        </div>
        <section className="card space-y-3">
          <h2 className="font-semibold">Histórico</h2>
          <form action={addContactNote.bind(null, contact.id)} className="space-y-2">
            <textarea className="input" name="text" rows={2} placeholder="Escreva uma anotação" required />
            <button className="btn-secondary">Anotar</button>
          </form>
          <Timeline items={contact.activities} />
        </section>
      </div>
    </div>
  );
}
