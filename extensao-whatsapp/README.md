# Beco WppSeller - CRM de vendas para WhatsApp Web (extensão do Chrome)

Extensão própria, feita do zero, que reproduz o funcionamento da extensão Waseller:
uma barra de ferramentas dentro do WhatsApp Web com CRM, respostas rápidas,
agendamentos, robô, envio em massa e mais. Tudo fica salvo no seu navegador
(não depende de nenhum servidor externo).

## Como instalar (5 minutos)

1. Baixe o arquivo `beco-wppseller.zip` e descompacte numa pasta.
2. No Chrome, abra `chrome://extensions`.
3. Ligue o **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** e escolha a pasta descompactada (a que tem o `manifest.json`).
5. Clique no ícone do Beco WppSeller (chapéu dourado): o WhatsApp Web abre com a barra de ícones na direita.

> Se você tiver a Waseller instalada, desative-a antes, porque as duas mexem no WhatsApp Web ao mesmo tempo.

## O que a extensão faz

| Ícone (barra) | Módulo | O que faz |
|---|---|---|
| 🏠 | Meu dia | Clientes esperando sua resposta (com contador no ícone), tarefas de hoje (lembretes, follow-ups, agendamentos) com "Feito" e "Adiar 1h", leads parados há X dias, aniversariantes com "Enviar parabéns", meta do mês com quanto falta por dia e campo para chamar um número não salvo. |
| 📦 | Catálogo | Produtos com foto, preço, código e estoque. Envie com 1 clique e use no orçamento. |
| 💬 | Respostas rápidas | Mensagens prontas com categorias, texto + arquivos (imagem, vídeo, áudio, PDF), botão Enviar ou Inserir, atalho opcional, duplicar, contador de uso e ★ favoritas. As favoritas aparecem numa barra de 1 clique logo acima da caixa de mensagem (Shift+clique envia direto). |
| 👤 | Conversa atual | Etapa, dias parado e quanto o cliente já comprou; mover de etapa com 1 clique; lembrete em 1 clique (+1h, +3h, amanhã 9h, +3 dias, +1 semana); dados, notas e ações: **montar orçamento** (cria pedido e move o lead para "Proposta enviada"), **cobrar com PIX copia e cola**, enviar produtos, **IA: melhorar meu texto, resumir conversa, sugerir resposta**, transcrever áudio, agendar, follow-up, fluxo, fixar e abas. |
| 📊 | CRM | Resumo do funil por etapa. O "CRM completo" é um kanban minimalista em que **todas as colunas cabem na tela**. Ele **puxa sozinho todas as conversas do WhatsApp** para a coluna Conversas, da mais recente para a mais antiga. Cada cartão é compacto: nome, hora, última mensagem e não lidas. Clique no cartão para abrir a conversa e arraste para mudar de etapa. O ✎ edita o cartão ou o tira do funil. Também tem filtro de grupos, busca, etapas editáveis e exportação CSV. |
| ⏰ | Agendamentos | Mensagem, resposta rápida ou fluxo em data/hora marcada, com repetição diária/semanal/mensal. Agendamentos perdidos (WhatsApp fechado) ficam em "Não disparados". |
| 🔔 | Lembretes | Lembretes com notificação do Chrome, som, aviso na tela e contador no ícone. |
| 📢 | Envio em massa | Lista de números (colada, salva ou importada de uma etapa do CRM; coloca o 55 sozinho e ignora duplicados), variáveis, intervalo aleatório, pausa por lote, pausar/parar e log. |
| 🤖 | Robô | Respostas automáticas por palavra-chave, qualquer mensagem, fora do horário, com atraso e sem repetir na mesma conversa. |
| 🔁 | Follow-up | Envia uma mensagem se o cliente não responder em X horas (cancela se ele responder). |
| 🧩 | Fluxos | Sequências de mensagens, arquivos, "digitando…" e pausas. Editor em página própria. |
| 🛒 | Pedidos | Pedidos por cliente com itens, valor, status em 1 clique, cobrança PIX e envio do resumo. Pedido "Pago" move o lead para Fechado; "Entregue" programa a mensagem de pós-venda automática. |
| 📸 | Status | Status de texto ou imagem agendado (com repetição). |
| 📁 | Abas e fixados | Fixe quantas conversas quiser e organize conversas em abas próprias. |
| ⌨️ | Atalhos | Digite `/pix` + espaço e o texto completo aparece. |
| 📈 | Relatório | Mensagens enviadas por módulo (hoje, 7 dias, total, erros) e resumo do funil. |
| ⚙️ | Configurações | Modo privacidade (desfoca conversas), backup e acesso ao Painel. |

**Painel** (botão direito no ícone → Opções): **Vendas** (meta do mês, chave PIX, dias para lead parado, tempo de espera do cliente, mensagem de pós-venda, barra de favoritas), perfil, IA (Gemini, ChatGPT ou Groq,
com a sua chave), webhooks (n8n/Make/Zapier), backup automático, importar/exportar e apagar dados.

Variáveis nas mensagens: `{nome}` `{primeiro_nome}` `{telefone}` `{saudacao}` `{data}` `{hora}`.
Para variar o texto use `{Oi|Olá|E aí}`.

## Como funciona por dentro

- `background.js`: alarmes de 1, 5 e 30 minutos (agendamentos, status, lembretes, backup, follow-up), IA, webhooks e abertura das páginas.
- `content/bridge-main.js` + `lib/wppconnect-wa.js`: conversa com o WhatsApp Web usando a biblioteca open source [WA-JS](https://github.com/wppconnect-team/wa-js) (licença Apache-2.0), empacotada junto, sem código remoto.
- `content/app.js`: a barra lateral e todos os módulos.
- `pages/`: CRM completo, editor de fluxos e painel.
- `shared/config.js`: nome, cor e dados padrão. A marca usa a logo do Beco Diagonal (`icons/logo-beco.svg`, `icons/marca.svg`) e os ícones do app são gerados a partir de `icons/icone.svg`.
- `shared/icons.js`: ícones em linha da barra lateral ([Lucide](https://lucide.dev), licença ISC).

## O que ficou de fora (dependia dos servidores da Wascript)

Login/licença pelo painel deles, configuração remota de seletores, API oficial da Meta,
multiatendimento por servidor, "Meet ao vivo", pixel e páginas promocionais.
A transcrição de áudio, que lá usa o servidor deles, aqui usa a sua chave de IA.

## Avisos

- O WhatsApp não permite automações oficialmente. Envio em massa para quem não conhece você pode bloquear o número; use intervalos longos.
- Os dados ficam só neste navegador. Ligue o backup automático no Painel.
