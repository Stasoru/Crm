"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { moveDeal } from "@/app/(app)/pipelines/actions";

export type BoardDeal = { id: string; title: string; value: number; contactName: string; ownerName: string | null; daysInStage: number };
export type BoardStage = { id: string; name: string; deals: BoardDeal[] };

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function KanbanBoard({ initialStages }: { initialStages: BoardStage[] }) {
  const [stages, setStages] = useState(initialStages);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // A small drag distance keeps plain clicks on the card working as links.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function onDragEnd(event: DragEndEvent) {
    const dealId = String(event.active.id);
    const toStageId = event.over ? String(event.over.id) : null;
    if (!toStageId) return;
    const from = stages.find((s) => s.deals.some((d) => d.id === dealId));
    if (!from || from.id === toStageId) return;
    const previous = stages;
    const deal = { ...from.deals.find((d) => d.id === dealId)!, daysInStage: 0 };
    setStages(
      stages.map((s) =>
        s.id === from.id ? { ...s, deals: s.deals.filter((d) => d.id !== dealId) } : s.id === toStageId ? { ...s, deals: [deal, ...s.deals] } : s,
      ),
    );
    setError(null);
    startTransition(async () => {
      try {
        await moveDeal(dealId, toStageId);
      } catch {
        setStages(previous);
        setError("Não foi possível mover o negócio. Tente de novo.");
      }
    });
  }

  return (
    <>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <Column key={stage.id} stage={stage} />
          ))}
        </div>
      </DndContext>
    </>
  );
}

function Column({ stage }: { stage: BoardStage }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = stage.deals.reduce((acc, d) => acc + d.value, 0);
  return (
    <section
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-lg border p-2 ${isOver ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-slate-100"}`}
    >
      <header className="mb-2 px-1">
        <p className="text-sm font-semibold">{stage.name}</p>
        <p className="text-xs text-slate-500">
          {stage.deals.length} {stage.deals.length === 1 ? "negócio" : "negócios"} · {money.format(total)}
        </p>
      </header>
      <div className="flex min-h-24 flex-col gap-2">
        {stage.deals.map((deal) => (
          <Card key={deal.id} deal={deal} />
        ))}
      </div>
    </section>
  );
}

function Card({ deal }: { deal: BoardDeal }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`cursor-grab rounded-md border border-slate-200 bg-white p-3 shadow-sm ${isDragging ? "z-10 opacity-80 shadow-lg" : ""}`}
    >
      <Link href={`/deals/${deal.id}`} className="block text-sm font-medium text-slate-900 hover:text-brand-700">
        {deal.title}
      </Link>
      <p className="text-xs text-slate-500">{deal.contactName}</p>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="font-semibold text-emerald-700">{money.format(deal.value)}</span>
        <span className={deal.daysInStage > 7 ? "text-amber-600" : "text-slate-400"}>{deal.daysInStage}d na etapa</span>
      </div>
      {deal.ownerName && <p className="mt-1 text-xs text-slate-400">{deal.ownerName}</p>}
    </div>
  );
}
