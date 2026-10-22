import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { AutoRefresh } from "@/components/auto-refresh";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { InboxFilters } from "./filters";

export default async function InboxLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const where: Prisma.ConversationWhereInput = { companyId: user.companyId, status: "OPEN" };
  const conversations = await db.conversation.findMany({
    where,
    include: {
      contact: { select: { name: true, phone: true } },
      assignee: { select: { name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
  });

  return (
    <div className="grid h-[calc(100vh-3rem)] gap-4 md:grid-cols-[18rem_1fr]">
      <AutoRefresh />
      <aside className="card flex min-h-0 flex-col p-0">
        <div className="border-b border-slate-100 p-3">
          <h1 className="font-semibold">Conversas</h1>
          <InboxFilters />
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {conversations.map((c) => {
            const last = c.messages[0];
            const waiting = last?.direction === "IN";
            return (
              <li key={c.id} data-mine={c.assigneeId === user.userId} data-unassigned={!c.assigneeId} className="conversation-item">
                <Link href={`/inbox/${c.id}`} className="block border-b border-slate-50 px-3 py-2 hover:bg-slate-50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{c.contact.name}</span>
                    {waiting && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" title="Aguardando resposta" />}
                  </div>
                  <p className="truncate text-xs text-slate-500">{last?.body ?? "Sem mensagens"}</p>
                  <p className="text-[11px] text-slate-400">
                    {formatDateTime(c.lastMessageAt)} · {c.assignee?.name ?? "Sem responsável"}
                  </p>
                </Link>
              </li>
            );
          })}
          {!conversations.length && <li className="p-4 text-sm text-slate-500">Nenhuma conversa aberta.</li>}
        </ul>
      </aside>
      <section className="min-h-0">{children}</section>
    </div>
  );
}
