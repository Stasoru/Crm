import { NavLink } from "@/components/nav-link";
import { requireUser } from "@/lib/auth";
import { logout } from "../(auth)/actions";

const NAV = [
  { href: "/dashboard", label: "Painel" },
  { href: "/pipelines", label: "Funis" },
  { href: "/contacts", label: "Contatos" },
  { href: "/inbox", label: "Conversas" },
  { href: "/tasks", label: "Tarefas" },
  { href: "/settings", label: "Configurações" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col bg-slate-900 p-3 md:w-56">
        <p className="px-3 py-2 text-lg font-bold text-white">Fluxo CRM</p>
        <p className="truncate px-3 pb-3 text-xs text-slate-400">{user.companyName}</p>
        <nav className="flex gap-1 overflow-x-auto md:flex-col">
          {NAV.map((item) => (
            <NavLink key={item.href} href={item.href}>{item.label}</NavLink>
          ))}
        </nav>
        <div className="mt-auto hidden border-t border-slate-800 pt-3 md:block">
          <p className="truncate px-3 text-sm text-slate-300">{user.name}</p>
          <form action={logout}>
            <button className="px-3 py-1 text-xs text-slate-400 hover:text-white">Sair</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}
