export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 p-4">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-2xl font-bold text-brand-700">Fluxo CRM</p>
        <div className="card p-6">{children}</div>
      </div>
    </main>
  );
}
