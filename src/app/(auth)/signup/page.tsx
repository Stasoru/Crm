"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signup } from "../actions";

export default function SignupPage() {
  const [state, action, pending] = useActionState(signup, undefined);
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-lg font-semibold">Criar conta</h1>
      <div>
        <label className="label" htmlFor="name">Seu nome</label>
        <input className="input" id="name" name="name" required />
      </div>
      <div>
        <label className="label" htmlFor="company">Empresa</label>
        <input className="input" id="company" name="company" required />
      </div>
      <div>
        <label className="label" htmlFor="email">E-mail</label>
        <input className="input" id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div>
        <label className="label" htmlFor="password">Senha (mínimo 8 caracteres)</label>
        <input className="input" id="password" name="password" type="password" minLength={8} required autoComplete="new-password" />
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn w-full" disabled={pending}>{pending ? "Criando..." : "Criar conta"}</button>
      <p className="text-center text-sm text-slate-600">
        Já tem conta? <Link className="text-brand-600 hover:underline" href="/login">Entrar</Link>
      </p>
    </form>
  );
}
