import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function PipelineLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const pipelines = await db.pipeline.findMany({ where: { companyId: user.companyId }, orderBy: { createdAt: "asc" } });
  if (!pipelines.some((p) => p.id === id)) notFound();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
        {pipelines.map((p) => (
          <Link
            key={p.id}
            href={`/pipelines/${p.id}`}
            className={`rounded-md px-3 py-1.5 text-sm ${p.id === id ? "bg-white font-semibold shadow-sm" : "text-slate-600 hover:bg-white"}`}
          >
            {p.name}
          </Link>
        ))}
        {user.role === "ADMIN" && (
          <Link href={`/pipelines/${id}/settings`} className="ml-auto text-sm text-brand-600 hover:underline">
            Configurar funil
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}
