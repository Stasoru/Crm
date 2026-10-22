import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function PipelinesIndex() {
  const user = await requireUser();
  const first = await db.pipeline.findFirst({ where: { companyId: user.companyId }, orderBy: { createdAt: "asc" } });
  if (!first) redirect("/settings");
  redirect(`/pipelines/${first.id}`);
}
