import Link from "next/link";
import { KanbanBoard, type BoardStage } from "@/components/kanban-board";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { createDeal } from "../actions";

const DAY = 86_400_000;

export default async function PipelinePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string }> }) {
  const { id } = await params;
  const { status } = await searchParams;
  const user = await requireUser();
  const closedStatus = status === "won" ? "WON" : status === "lost" ? "LOST" : null;

  const stages = await db.stage.findMany({
    where: { pipelineId: id, pipeline: { companyId: user.companyId } },
    orderBy: { position: "asc" },
    include: {
      deals: {
        where: { status: "OPEN" },
        orderBy: { stageEnteredAt: "desc" },
        include: { contact: { select: { name: true } }, owner: { select: { name: true } } },
      },
    },
  });
  const now = Date.now();
  const board: BoardStage[] = stages.map((s) => ({
    id: s.id,
    name: s.name,
    deals: s.deals.map((d) => ({
      id: d.id,
      title: d.title,
      value: Number(d.value),
      contactName: d.contact.name,
      ownerName: d.owner?.name ?? null,
      daysInStage: Math.floor((now - d.stageEnteredAt.getTime()) / DAY),
    })),
  }));

  const closed = closedStatus
    ? await db.deal.findMany({
        where: { pipelineId: id, companyId: user.companyId, status: closedStatus },
        orderBy: { closedAt: "desc" },
        include: { contact: { select: { name: true } } },
        take: 100,
      })
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link className={!closedStatus ? "font-semibold" : "text-slate-600"} href={`/pipelines/${id}`}>Em aberto</Link>
        <span className="text-slate-300">|</span>
        <Link className={closedStatus === "WON" ? "font-semibold" : "text-slate-600"} href={`/pipelines/${id}?status=won`}>Ganhos</Link>
        <span className="text-slate-300">|</span>
        <Link className={closedStatus === "LOST" ? "font-semibold" : "text-slate-600"} href={`/pipelines/${id}?status=lost`}>Perdidos</Link>
      </div>

      {closedStatus ? (
        <div className="card p-0">
          <ul className="divide-y divide-slate-100">
            {closed.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                <Link className="font-medium text-brand-700 hover:underline" href={`/deals/${d.id}`}>{d.title}</Link>
                <span className="text-slate-500">{d.contact.name}</span>
                <span>{formatMoney(d.value)}</span>
                {d.lostReason && <span className="text-xs text-red-600">{d.lostReason}</span>}
              </li>
            ))}
            {!closed.length && <li className="px-4 py-6 text-center text-sm text-slate-500">Nenhum negócio aqui.</li>}
          </ul>
        </div>
      ) : (
        <>
          <details className="card">
            <summary className="cursor-pointer text-sm font-medium">Novo negócio</summary>
            <form action={createDeal} className="mt-4 grid gap-3 sm:grid-cols-4">
              <input type="hidden" name="pipelineId" value={id} />
              <div>
                <label className="label">Nome do contato</label>
                <input className="input" name="contactName" required />
              </div>
              <div>
                <label className="label">WhatsApp</label>
                <input className="input" name="contactPhone" placeholder="5511999990000" />
              </div>
              <div>
                <label className="label">Título do negócio</label>
                <input className="input" name="title" placeholder="Opcional" />
              </div>
              <div>
                <label className="label">Valor (R$)</label>
                <input className="input" name="value" inputMode="decimal" placeholder="0,00" />
              </div>
              <div className="sm:col-span-4">
                <button className="btn">Criar negócio</button>
              </div>
            </form>
          </details>
          <KanbanBoard key={JSON.stringify(board.map((s) => s.deals.map((d) => d.id)))} initialStages={board} />
        </>
      )}
    </div>
  );
}
