import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { TaskForm, TaskList } from "@/components/task-list";
import { Timeline } from "@/components/timeline";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { listMembers } from "@/lib/members";
import { addDealNote, addDealProduct, moveDeal, removeDealProduct, setDealStatus, updateDeal } from "../../pipelines/actions";
import { createTask } from "../../tasks/actions";

const STATUS_LABEL = { OPEN: "Em aberto", WON: "Ganho", LOST: "Perdido" } as const;
const STATUS_STYLE = { OPEN: "bg-slate-100 text-slate-700", WON: "bg-emerald-100 text-emerald-700", LOST: "bg-red-100 text-red-700" } as const;

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const deal = await db.deal.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      contact: true,
      pipeline: { include: { stages: { orderBy: { position: "asc" } } } },
      products: { include: { product: true } },
      tasks: { include: { assignee: true }, orderBy: [{ doneAt: { sort: "asc", nulls: "first" } }, { dueAt: "asc" }] },
      activities: { include: { user: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!deal) notFound();
  const [members, products] = await Promise.all([
    listMembers(user.companyId),
    db.product.findMany({ where: { companyId: user.companyId }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title={deal.title}>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLE[deal.status]}`}>{STATUS_LABEL[deal.status]}</span>
        <Link className="btn-secondary" href={`/pipelines/${deal.pipelineId}`}>{deal.pipeline.name}</Link>
      </PageHeader>

      {/* Stage path: click a stage to move the deal there. */}
      <div className="flex overflow-x-auto rounded-lg border border-slate-200 bg-white">
        {deal.pipeline.stages.map((s) => {
          const current = s.id === deal.stageId;
          const passed = s.position < (deal.pipeline.stages.find((x) => x.id === deal.stageId)?.position ?? 0);
          return (
            <form key={s.id} action={moveDeal.bind(null, deal.id, s.id)} className="flex-1">
              <button
                className={`w-full min-w-28 px-3 py-2 text-xs font-medium ${current ? "bg-brand-600 text-white" : passed ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-50"}`}
              >
                {s.name}
              </button>
            </form>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="card space-y-3">
            <form action={updateDeal.bind(null, deal.id)} className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="label">Título</label>
                <input className="input" name="title" defaultValue={deal.title} />
              </div>
              <div>
                <label className="label">Valor (R$)</label>
                <input className="input" name="value" defaultValue={deal.value.toString()} readOnly={deal.products.length > 0} />
              </div>
              <div>
                <label className="label">Responsável</label>
                <select className="input" name="ownerId" defaultValue={deal.ownerId ?? ""}>
                  <option value="">Ninguém</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-3">
                <button className="btn-secondary">Salvar</button>
              </div>
            </form>
            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
              {deal.status === "OPEN" ? (
                <>
                  <form action={setDealStatus.bind(null, deal.id, "WON")}>
                    <button className="btn bg-emerald-600 hover:bg-emerald-700">Marcar como ganho</button>
                  </form>
                  <form action={setDealStatus.bind(null, deal.id, "LOST")} className="flex gap-2">
                    <input className="input" name="lostReason" placeholder="Motivo da perda" />
                    <button className="btn bg-red-600 hover:bg-red-700">Perdido</button>
                  </form>
                </>
              ) : (
                <form action={setDealStatus.bind(null, deal.id, "OPEN")}>
                  <button className="btn-secondary">Reabrir negócio</button>
                </form>
              )}
            </div>
            {deal.lostReason && <p className="text-sm text-red-600">Motivo da perda: {deal.lostReason}</p>}
          </section>

          <section className="card space-y-3">
            <h2 className="font-semibold">Produtos</h2>
            {deal.products.length ? (
              <ul className="divide-y divide-slate-100 text-sm">
                {deal.products.map((item) => (
                  <li key={item.id} className="flex items-center justify-between py-2">
                    <span>{item.quantity} × {item.product.name}</span>
                    <span className="flex items-center gap-3">
                      {formatMoney(Number(item.unitPrice) * item.quantity)}
                      <form action={removeDealProduct.bind(null, item.id)}>
                        <button className="text-xs text-red-600 hover:underline">remover</button>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Sem produtos. O valor do negócio é informado manualmente.</p>
            )}
            {products.length ? (
              <form action={addDealProduct.bind(null, deal.id)} className="flex gap-2">
                <select className="input" name="productId" required>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({formatMoney(p.price)})</option>
                  ))}
                </select>
                <input className="input w-20" name="quantity" type="number" min={1} defaultValue={1} />
                <button className="btn-secondary">Adicionar</button>
              </form>
            ) : (
              <p className="text-xs text-slate-500">Cadastre produtos em <Link className="text-brand-600" href="/settings">Configurações</Link>.</p>
            )}
          </section>

          <section className="card space-y-3">
            <h2 className="font-semibold">Tarefas</h2>
            <TaskForm action={createTask} members={members} hidden={{ dealId: deal.id }} />
            <TaskList tasks={deal.tasks} />
          </section>
        </div>

        <div className="space-y-4">
          <section className="card space-y-1 text-sm">
            <h2 className="mb-2 font-semibold">Contato</h2>
            <Link className="font-medium text-brand-700 hover:underline" href={`/contacts/${deal.contact.id}`}>{deal.contact.name}</Link>
            {deal.contact.phone && <p>{deal.contact.phone}</p>}
            {deal.contact.email && <p>{deal.contact.email}</p>}
          </section>
          <section className="card space-y-3">
            <h2 className="font-semibold">Histórico</h2>
            <form action={addDealNote.bind(null, deal.id)} className="space-y-2">
              <textarea className="input" name="text" rows={2} placeholder="Escreva uma anotação" required />
              <button className="btn-secondary">Anotar</button>
            </form>
            <Timeline items={deal.activities} />
          </section>
        </div>
      </div>
    </div>
  );
}
