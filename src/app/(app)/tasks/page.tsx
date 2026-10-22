import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { TaskForm, TaskList } from "@/components/task-list";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listMembers } from "@/lib/members";
import { createTask } from "./actions";

const FILTERS = { mine: "Minhas", all: "Todas", done: "Concluídas" } as const;

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const user = await requireUser();
  const { f } = await searchParams;
  const filter = (f && f in FILTERS ? f : "mine") as keyof typeof FILTERS;
  const where: Prisma.TaskWhereInput = { companyId: user.companyId, doneAt: filter === "done" ? { not: null } : null };
  if (filter === "mine") where.assigneeId = user.userId;

  const [tasks, members] = await Promise.all([
    db.task.findMany({
      where,
      include: { assignee: true, contact: true, deal: true },
      orderBy: filter === "done" ? { doneAt: "desc" } : [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: 200,
    }),
    listMembers(user.companyId),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Tarefas">
        {Object.entries(FILTERS).map(([key, label]) => (
          <Link key={key} href={`/tasks?f=${key}`} className={key === filter ? "btn" : "btn-secondary"}>{label}</Link>
        ))}
      </PageHeader>
      <div className="card">
        <TaskForm action={createTask} members={members} />
      </div>
      <div className="card">
        <TaskList tasks={tasks} showLinks />
      </div>
    </div>
  );
}
