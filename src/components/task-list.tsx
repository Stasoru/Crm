import Link from "next/link";
import { toggleTask } from "@/app/(app)/tasks/actions";
import { formatDateTime } from "@/lib/format";

type Task = {
  id: string;
  title: string;
  dueAt: Date | null;
  doneAt: Date | null;
  assignee?: { name: string } | null;
  contact?: { id: string; name: string } | null;
  deal?: { id: string; title: string } | null;
};

export function TaskList({ tasks, showLinks = false }: { tasks: Task[]; showLinks?: boolean }) {
  if (!tasks.length) return <p className="text-sm text-slate-500">Nenhuma tarefa.</p>;
  const now = new Date();
  return (
    <ul className="divide-y divide-slate-100">
      {tasks.map((t) => {
        const overdue = !t.doneAt && t.dueAt && t.dueAt < now;
        return (
          <li key={t.id} className="flex items-start gap-3 py-2">
            <form action={toggleTask.bind(null, t.id)}>
              <button
                className={`mt-0.5 h-4 w-4 rounded border ${t.doneAt ? "border-emerald-600 bg-emerald-600" : "border-slate-400"}`}
                aria-label={t.doneAt ? "Reabrir tarefa" : "Concluir tarefa"}
              />
            </form>
            <div className="min-w-0 flex-1 text-sm">
              <p className={t.doneAt ? "text-slate-400 line-through" : ""}>{t.title}</p>
              <p className="text-xs text-slate-500">
                {t.dueAt && <span className={overdue ? "font-medium text-red-600" : ""}>{formatDateTime(t.dueAt)}</span>}
                {t.assignee && ` · ${t.assignee.name}`}
                {showLinks && t.deal && (
                  <> · <Link className="text-brand-600 hover:underline" href={`/deals/${t.deal.id}`}>{t.deal.title}</Link></>
                )}
                {showLinks && !t.deal && t.contact && (
                  <> · <Link className="text-brand-600 hover:underline" href={`/contacts/${t.contact.id}`}>{t.contact.name}</Link></>
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function TaskForm({ action, members, hidden }: { action: (form: FormData) => Promise<void>; members: { id: string; name: string }[]; hidden?: Record<string, string> }) {
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input className="input" name="title" placeholder="Nova tarefa" required />
      <input className="input" name="dueAt" type="datetime-local" />
      <select className="input" name="assigneeId" defaultValue="">
        <option value="">Eu</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
      <button className="btn">Adicionar</button>
    </form>
  );
}
