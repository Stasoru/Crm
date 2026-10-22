import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { listMembers } from "@/lib/members";
import { assignConversation, sendMessage, setConversationStatus } from "../actions";
import { MessageComposer } from "./composer";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const conversation = await db.conversation.findFirst({
    where: { id, companyId: user.companyId },
    include: {
      contact: { include: { deals: { where: { status: "OPEN" }, include: { stage: true } } } },
      channel: { select: { name: true } },
      messages: { orderBy: { createdAt: "asc" }, take: 300 },
    },
  });
  if (!conversation) notFound();
  const members = await listMembers(user.companyId);

  return (
    <div className="card flex h-full min-h-0 flex-col p-0">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <div className="min-w-0 flex-1">
          <Link href={`/contacts/${conversation.contactId}`} className="font-semibold hover:text-brand-700">{conversation.contact.name}</Link>
          <p className="text-xs text-slate-500">
            {conversation.contact.phone} · {conversation.channel.name}
            {conversation.contact.deals.map((d) => (
              <Link key={d.id} href={`/deals/${d.id}`} className="ml-2 rounded bg-brand-50 px-1.5 text-brand-700">{d.stage.name}</Link>
            ))}
          </p>
        </div>
        <form key={conversation.assigneeId ?? "none"} action={assignConversation.bind(null, conversation.id)} className="flex gap-1">
          <select className="input py-1" name="assigneeId" defaultValue={conversation.assigneeId ?? ""}>
            <option value="">Sem responsável</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <button className="btn-secondary py-1">Atribuir</button>
        </form>
        <form action={setConversationStatus.bind(null, conversation.id, conversation.status === "OPEN" ? "CLOSED" : "OPEN")}>
          <button className="btn-secondary py-1">{conversation.status === "OPEN" ? "Encerrar" : "Reabrir"}</button>
        </form>
      </header>
      <ol className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-slate-50 p-4">
        {conversation.messages.map((m) => (
          <li key={m.id} className={`max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-sm ${m.direction === "OUT" ? "self-end bg-brand-600 text-white" : "self-start bg-white"}`}>
            <p className="whitespace-pre-wrap">{m.body}</p>
            <p className={`mt-1 text-[11px] ${m.direction === "OUT" ? "text-brand-100" : "text-slate-400"}`}>{formatDateTime(m.createdAt)}</p>
            {m.error && <p className="mt-1 rounded bg-red-100 px-1 text-[11px] text-red-700">Não enviada: {m.error}</p>}
          </li>
        ))}
        {!conversation.messages.length && <li className="text-center text-sm text-slate-500">Nenhuma mensagem ainda.</li>}
      </ol>
      <MessageComposer action={sendMessage.bind(null, conversation.id)} />
    </div>
  );
}
