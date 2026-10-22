import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { addStage, createPipeline, deletePipeline, deleteStage, renamePipeline, renameStage, shiftStage } from "../../actions";

export default async function PipelineSettings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAdmin();
  const pipeline = await db.pipeline.findFirst({
    where: { id, companyId: user.companyId },
    include: { stages: { orderBy: { position: "asc" }, include: { _count: { select: { deals: true } } } } },
  });
  if (!pipeline) notFound();

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card space-y-4">
        <h2 className="font-semibold">Funil</h2>
        <form action={renamePipeline.bind(null, id)} className="flex gap-2">
          <input className="input" name="name" defaultValue={pipeline.name} required />
          <button className="btn-secondary">Renomear</button>
        </form>
        <h3 className="text-sm font-semibold">Etapas</h3>
        <ul className="space-y-2">
          {pipeline.stages.map((stage, i) => (
            <li key={stage.id} className="flex flex-wrap items-center gap-2">
              <form action={renameStage.bind(null, stage.id)} className="flex flex-1 gap-2">
                <input className="input" name="name" defaultValue={stage.name} required />
                <button className="btn-secondary">Salvar</button>
              </form>
              <form action={shiftStage.bind(null, stage.id, -1)}>
                <button className="btn-secondary" disabled={i === 0} aria-label="Subir">↑</button>
              </form>
              <form action={shiftStage.bind(null, stage.id, 1)}>
                <button className="btn-secondary" disabled={i === pipeline.stages.length - 1} aria-label="Descer">↓</button>
              </form>
              <form action={deleteStage.bind(null, stage.id)}>
                <button
                  className="btn-secondary text-red-600"
                  disabled={stage._count.deals > 0}
                  title={stage._count.deals > 0 ? "Mova os negócios antes de excluir" : "Excluir etapa"}
                >
                  Excluir
                </button>
              </form>
            </li>
          ))}
        </ul>
        <form action={addStage.bind(null, id)} className="flex gap-2">
          <input className="input" name="name" placeholder="Nova etapa" required />
          <button className="btn">Adicionar</button>
        </form>
      </section>
      <section className="space-y-4">
        <div className="card space-y-3">
          <h2 className="font-semibold">Criar outro funil</h2>
          <form action={createPipeline} className="flex gap-2">
            <input className="input" name="name" placeholder="Ex.: Pós-venda" required />
            <button className="btn">Criar</button>
          </form>
        </div>
        <div className="card space-y-3">
          <h2 className="font-semibold text-red-700">Excluir funil</h2>
          <p className="text-sm text-slate-600">Apaga o funil e todos os negócios dele. Os contatos continuam.</p>
          <form action={deletePipeline.bind(null, id)}>
            <button className="btn-secondary text-red-600">Excluir este funil</button>
          </form>
        </div>
      </section>
    </div>
  );
}
