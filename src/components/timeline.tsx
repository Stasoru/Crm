import { formatDateTime } from "@/lib/format";

type Item = { id: string; text: string; kind: string; createdAt: Date; user: { name: string } | null };

export function Timeline({ items }: { items: Item[] }) {
  if (!items.length) return <p className="text-sm text-slate-500">Nada por aqui ainda.</p>;
  return (
    <ol className="space-y-3">
      {items.map((a) => (
        <li key={a.id} className="border-l-2 border-brand-100 pl-3">
          <p className="text-sm">{a.text}</p>
          <p className="text-xs text-slate-500">
            {formatDateTime(a.createdAt)}
            {a.user ? ` · ${a.user.name}` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}
