export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
