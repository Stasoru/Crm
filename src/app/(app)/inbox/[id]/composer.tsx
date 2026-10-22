"use client";

import { useRef, useTransition } from "react";

export function MessageComposer({ action }: { action: (form: FormData) => Promise<void> }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  function submit(form: FormData) {
    startTransition(async () => {
      await action(form);
      formRef.current?.reset();
    });
  }

  return (
    <form ref={formRef} action={submit} className="flex gap-2 border-t border-slate-100 p-3">
      <textarea
        className="input min-h-10 resize-none"
        name="body"
        rows={1}
        placeholder="Digite uma mensagem (Enter envia, Shift+Enter quebra linha)"
        required
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
      />
      <button className="btn" disabled={pending}>{pending ? "Enviando..." : "Enviar"}</button>
    </form>
  );
}
