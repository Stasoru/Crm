import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { groupBy, summarize, type DealForMetrics } from "@/lib/metrics";

const PERIODS = { "30": "30 dias", "90": "90 dias", all: "Tudo" } as const;
const DAY = 86_400_000;
const pct = (v: number) => `${Math.round(v * 100)}%`;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ p?: string; period?: string }> }) {
  const user = await requireUser();
  const { p, period: rawPeriod } = await searchParams;
  const period = (rawPeriod && rawPeriod in PERIODS ? rawPeriod : "30") as keyof typeof PERIODS;
  const pipelines = await db.pipeline.findMany({
    where: { companyId: user.companyId },
    orderBy: { createdAt: "asc" },
    include: { stages: { orderBy: { position: "asc" } } },
  });
  const pipeline = pipelines.find((x) => x.id === p) ?? pipelines[0];
  if (!pipeline) return <p>Crie um funil para ver o painel.</p>;

  const since = period === "all" ? undefined : new Date(Date.now() - Number(period) * DAY);
  const [deals, overdueTasks, waitingConversations] = await Promise.all([
    db.deal.findMany({
      where: { companyId: user.companyId, pipelineId: pipeline.id, ...(since && { createdAt: { gte: since } }) },
      include: { contact: { select: { source: true } }, owner: { select: { name: true } } },
    }),
    db.task.count({ where: { companyId: user.companyId, assigneeId: user.userId, doneAt: null, dueAt: { lt: new Date() } } }),
    db.conversation.count({ where: { companyId: user.companyId, status: "OPEN", messages: { some: {} } } }),
  ]);

  const rows: DealForMetrics[] = deals.map((d) => ({
    status: d.status,
    value: Number(d.value),
    stageId: d.stageId,
    source: d.contact.source,
    ownerName: d.owner?.name ?? null,
    createdAt: d.createdAt,
    closedAt: d.closedAt,
  }));
  const s = summarize(rows);
  const now = Date.now();
  const byStage = pipeline.stages.map((stage) => {
    const open = deals.filter((d) => d.status === "OPEN" && d.stageId === stage.id);
    const days = open.map((d) => (now - d.stageEnteredAt.getTime()) / DAY);
    return {
      name: stage.name,
      count: open.length,
      value: open.reduce((acc, d) => acc + Number(d.value), 0),
      avgDays: days.length ? days.reduce((a, b) => a + b, 0) / days.length : 0,
    };
  });
  const maxStage = Math.max(1, ...byStage.map((x) => x.count));

  const kpis = [
    { label: "Em aberto", value: String(s.open), hint: formatMoney(s.openValue) },
    { label: "Ganhos", value: String(s.won), hint: formatMoney(s.wonValue) },
    { label: "Perdidos", value: String(s.lost) },
    { label: "Taxa de ganho", value: pct(s.winRate), hint: "ganhos ÷ fechados" },
    { label: "Ticket médio", value: formatMoney(s.averageTicket) },
    { label: "Ciclo médio", value: `${s.averageCycleDays.toFixed(1)} dias`, hint: "criação até ganho" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Painel">
        <form className="flex gap-2">
          <select className="input" name="p" defaultValue={pipeline.id}>
            {pipelines.map((x) => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </select>
          <select className="input" name="period" defaultValue={period}>
            {Object.entries(PERIODS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          <button className="btn-secondary">Ver</button>
        </form>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/tasks" className="card text-sm hover:border-brand-500">
          <span className={overdueTasks ? "font-semibold text-red-600" : ""}>{overdueTasks}</span> tarefas suas atrasadas
        </Link>
        <Link href="/inbox" className="card text-sm hover:border-brand-500">
          <span className="font-semibold">{waitingConversations}</span> conversas abertas
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className="card">
            <p className="text-xs text-slate-500">{k.label}</p>
            <p className="text-xl font-semibold">{k.value}</p>
            {k.hint && <p className="text-xs text-slate-400">{k.hint}</p>}
          </div>
        ))}
      </div>

      <section className="card">
        <h2 className="mb-3 font-semibold">Negócios abertos por etapa</h2>
        <ul className="space-y-2">
          {byStage.map((st) => (
            <li key={st.name} className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 text-sm">
              <span className="truncate">{st.name}</span>
              <span className="h-5 rounded bg-slate-100">
                <span className="block h-5 rounded bg-brand-500" style={{ width: `${(st.count / maxStage) * 100}%` }} />
              </span>
              <span className="w-56 text-right text-xs text-slate-600">
                {st.count} · {formatMoney(st.value)} · {st.avgDays.toFixed(1)}d em média
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownTable title="Por origem do lead" rows={groupBy(rows, (d) => d.source)} />
        <BreakdownTable title="Por vendedor" rows={groupBy(rows, (d) => d.ownerName)} />
      </div>
    </div>
  );
}

function BreakdownTable({ title, rows }: { title: string; rows: ReturnType<typeof groupBy> }) {
  return (
    <section className="card overflow-x-auto">
      <h2 className="mb-3 font-semibold">{title}</h2>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-slate-500">
          <tr>
            <th className="py-1">Nome</th>
            <th className="py-1 text-right">Negócios</th>
            <th className="py-1 text-right">Ganhos</th>
            <th className="py-1 text-right">Taxa de ganho</th>
            <th className="py-1 text-right">Receita</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-slate-100">
              <td className="py-1">{r.key}</td>
              <td className="py-1 text-right">{r.total}</td>
              <td className="py-1 text-right">{r.won}</td>
              <td className="py-1 text-right">{pct(r.conversion)}</td>
              <td className="py-1 text-right">{formatMoney(r.wonValue)}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr><td colSpan={5} className="py-4 text-center text-slate-500">Sem dados no período.</td></tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
