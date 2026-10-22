"use client";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card mx-auto max-w-md space-y-3 text-center">
      <p className="font-semibold">Algo deu errado</p>
      <p className="text-sm text-slate-600">
        A ação não pôde ser concluída. Confira os dados (por exemplo, um telefone já usado por outro contato) e tente de novo.
      </p>
      <button className="btn" onClick={reset}>Tentar de novo</button>
    </div>
  );
}
