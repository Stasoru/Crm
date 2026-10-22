import { db } from "./db";

export async function listMembers(companyId: string) {
  const memberships = await db.membership.findMany({
    where: { companyId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return memberships.map((m) => ({ ...m.user, role: m.role }));
}

// Returns the id only if that user belongs to the company; otherwise null.
export async function memberIdOrNull(companyId: string, userId: string | null | undefined) {
  if (!userId) return null;
  const m = await db.membership.findUnique({ where: { userId_companyId: { userId, companyId } } });
  return m ? userId : null;
}
