# Fluxo CRM

CRM para vender pelo WhatsApp: funis em Kanban, contatos, negócios, tarefas, conversas e painel de métricas. Multiempresa desde o início.

## O que já tem

- **Contas:** cadastro cria a empresa com um funil padrão; membros com papel de administrador ou vendedor.
- **Contatos:** busca, tags, origem, responsável, anotações e linha do tempo.
- **Funis:** vários funis com etapas configuráveis; Kanban com arrastar e soltar; dias na etapa.
- **Negócios:** valor, produtos, responsável, ganho/perdido com motivo, histórico.
- **Tarefas:** por contato ou negócio, com prazo, responsável e atrasadas em destaque.
- **Conversas:** inbox de WhatsApp pela Cloud API oficial da Meta (receber por webhook, responder, atribuir, encerrar).
- **Painel:** em aberto, ganhos, perdidos, taxa de ganho, ticket médio, ciclo médio, negócios por etapa, por origem e por vendedor.

## Rodando localmente

Requisitos: Node 22 e Postgres 16.

```bash
cp .env.example .env          # ajuste DATABASE_URL e SESSION_SECRET (32+ caracteres)
npm install
npx prisma migrate dev        # cria as tabelas
npm run db:seed               # opcional: dados de exemplo (demo@fluxo.dev / demo1234)
npm run dev                   # http://localhost:3000
```

Testes e checagens: `npm test`, `npm run lint`, `npm run build`.

## Publicando para teste (Vercel + Neon, grátis)

1. Em vercel.com, entre com o GitHub e importe o repositório `Stasoru/Crm`.
2. Opcional: adicione `SEED_DEMO` = `1` para criar dados de exemplo e `SESSION_SECRET` (texto aleatório com 32+ caracteres). Sem `SESSION_SECRET`, a chave das sessões é derivada do `DATABASE_URL`.
3. Depois do primeiro deploy, abra **Storage → Create Database → Neon** e conecte ao projeto. Isso cria o `DATABASE_URL`.
4. Em **Deployments**, clique em **Redeploy**. O build aplica as migrações e, com `SEED_DEMO=1`, cria o login `demo@fluxo.dev` / `demo1234`.

Em produção de verdade, remova `SEED_DEMO` e apague o usuário de demonstração.

## Conectando o WhatsApp

1. Crie um app em developers.facebook.com com o produto WhatsApp e gere um token permanente (usuário de sistema).
2. Em **Configurações → Canais de WhatsApp**, informe o Phone number ID e o token.
3. No painel da Meta, configure o webhook com a URL e o token de verificação mostrados na tela e assine o campo `messages`.
4. Opcional e recomendado em produção: defina `WHATSAPP_APP_SECRET` para validar a assinatura das chamadas.

A Meta só aceita texto livre dentro de 24 horas desde a última mensagem do cliente. Fora dessa janela é preciso um template aprovado (ainda não suportado); a mensagem aparece com o erro devolvido pela Meta.

## Stack

Next.js 15 (App Router, server actions), TypeScript, Prisma + Postgres, Tailwind CSS 4, dnd-kit, Vitest.

## Próximos passos

Instagram e Messenger no inbox, filas e distribuição automática, editor de automações, API REST e webhooks de saída, IA (resumo, sentimento, agente).
