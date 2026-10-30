/*
  Fluxo Zap - aplicação principal dentro do WhatsApp Web.

  Monta a barra lateral com os módulos e executa as rotinas que os alarmes
  do service worker pedem (agendamentos, status, follow-up, lembretes).
*/
(async function () {
  if (window.top !== window) return;

  const { h, toast, modal, confirm, form } = UI;
  const U = FZ_UTIL;
  const S = FZ_STORE;
  const { BRAND } = FZ_CONFIG;

  const state = { chat: null, panel: null, busy: {} };

  await S.ensureDefaults();

  /* ============================================================ helpers */

  function bg(message, extra = {}) {
    return chrome.runtime.sendMessage({ message, ...extra }).then((r) => {
      if (!r?.ok) throw new Error(r?.error || 'Falha na extensão');
      return r.data;
    });
  }

  async function currentChat() {
    try {
      const c = await WA.call('activeChat');
      if (c) state.chat = c;
      return c;
    } catch {
      return state.chat;
    }
  }

  async function requireChat() {
    const c = await currentChat();
    if (!c) toast('Abra uma conversa no WhatsApp primeiro.', 'error');
    return c;
  }

  async function logRel(tipo, chatId, ok = true) {
    await S.update('relatorio', (r) => { r.push({ id: U.uid(), tipo, chatId, ok, data: new Date().toISOString() }); return r; });
  }

  // Envia texto e/ou mídias para uma conversa aplicando as variáveis
  async function sendContent(chatId, { texto = '', midias = [] }, ctx = {}, tipo = 'manual') {
    const msg = U.applyVars(texto, ctx);
    try {
      if (midias.length === 1) {
        await WA.call('sendFile', chatId, midias[0].dataUrl, { legenda: msg, nome: midias[0].nome, ptt: midias[0].ptt });
      } else {
        if (msg.trim()) await WA.call('sendText', chatId, msg);
        for (const m of midias) await WA.call('sendFile', chatId, m.dataUrl, { nome: m.nome, ptt: m.ptt });
      }
      await logRel(tipo, chatId, true);
    } catch (e) {
      await logRel(tipo, chatId, false);
      throw e;
    }
  }

  async function sendQuickReply(chatId, respostaId, ctx, tipo) {
    const list = await S.get('respostasRapidas');
    const r = list.find((x) => x.id === respostaId);
    if (!r) throw new Error('Resposta rápida não encontrada');
    await sendContent(chatId, { texto: r.texto, midias: r.midias || [] }, ctx, tipo);
  }

  // Executa um fluxo (sequência de passos) numa conversa
  async function runFlow(chatId, fluxoId, ctx, tipo = 'fluxo') {
    const fluxo = await S.get('fluxo');
    const wf = fluxo.workflows.find((w) => w.id === fluxoId);
    if (!wf) throw new Error('Fluxo não encontrado');
    for (const p of wf.passos || []) {
      if (p.tipo === 'espera') await U.sleep((Number(p.segundos) || 1) * 1000);
      else if (p.tipo === 'digitando') { await WA.call('markComposing', chatId, (Number(p.segundos) || 2) * 1000); await U.sleep((Number(p.segundos) || 2) * 1000); }
      else if (p.tipo === 'texto') await sendContent(chatId, { texto: p.texto }, ctx, tipo);
      else if (p.tipo === 'midia') await sendContent(chatId, { texto: p.legenda || '', midias: p.midia ? [p.midia] : [] }, ctx, tipo);
      else if (p.tipo === 'resposta') await sendQuickReply(chatId, p.respostaId, ctx, tipo);
      if (p.tipo !== 'espera' && p.tipo !== 'digitando') await U.sleep(800);
    }
  }

  async function ctxOf(chatId, nome) {
    const contatos = await S.get('contatos');
    const c = contatos.find((x) => x.chatId === chatId);
    return { nome: c?.nome || nome || '', telefone: U.phoneFromChatId(chatId) };
  }

  async function filesToMedia(files) {
    const out = [];
    for (const f of files || []) {
      if (f.size > 16 * 1024 * 1024) { toast(`${f.name} passa de 16 MB e foi ignorado.`, 'error'); continue; }
      out.push({ nome: f.name, tipo: f.type, dataUrl: await U.fileToDataUrl(f) });
    }
    return out;
  }

  const empty = (txt) => h('div', { class: 'fz-empty' }, txt);
  const section = (title, ...kids) => h('div', { class: 'fz-section' }, h('div', { class: 'fz-section-title' }, title), kids);
  const row = (...kids) => h('div', { class: 'fz-row' }, kids);
  const btn = (label, onclick, cls = '') => h('button', { class: 'fz-btn ' + cls, onclick }, label);

  function beep() {
    try {
      const ctx = new AudioContext();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880; g.gain.value = 0.08;
      o.start(); o.stop(ctx.currentTime + 0.25);
    } catch { /* sem som */ }
  }

  /* ======================================================= estrutura */

  const root = UI.mount();
  const strip = h('div', { class: 'fz-strip' });
  const drawer = h('div', { class: 'fz-drawer' });
  const drawerTitle = h('strong', {});
  const drawerBody = h('div', { class: 'fz-drawer-body' });
  drawer.append(
    h('div', { class: 'fz-drawer-head' }, drawerTitle, h('button', { class: 'fz-x', title: 'Fechar', onclick: () => openPanel(null) }, '×')),
    drawerBody);
  root.append(drawer, strip);
  document.documentElement.classList.add('fz-on');

  const MODULES = [];
  const reg = (id, icon, title, render) => MODULES.push({ id, icon, title, render });

  function openPanel(id) {
    state.panel = state.panel === id ? null : id;
    drawer.classList.toggle('open', !!state.panel);
    strip.querySelectorAll('.fz-ico').forEach((b) => b.classList.toggle('active', b.dataset.id === state.panel));
    if (state.panel) refresh();
  }

  async function refresh() {
    const m = MODULES.find((x) => x.id === state.panel);
    if (!m) return;
    drawerTitle.textContent = m.title;
    const scroll = drawerBody.scrollTop;
    const body = h('div', {});
    try {
      await m.render(body);
    } catch (e) {
      body.append(empty('Erro: ' + e.message));
    }
    drawerBody.replaceChildren(body);
    drawerBody.scrollTop = scroll;
  }

  /* ================================================ respostas rápidas */

  reg('respostas', '💬', 'Respostas rápidas', async (el) => {
    const { respostasRapidas: list, categoria: cats } = await S.getMany(['respostasRapidas', 'categoria']);
    let filtro = state.respFiltro || '';
    let cat = state.respCat || '';

    const listBox = h('div', {});
    const draw = () => {
      const q = filtro.toLowerCase();
      const items = list.filter((r) => (!cat || r.categoriaId === cat) &&
        (!q || r.titulo.toLowerCase().includes(q) || (r.texto || '').toLowerCase().includes(q)));
      listBox.replaceChildren(...(items.length ? items.map((r) => {
        const c = cats.find((x) => x.id === r.categoriaId);
        return h('div', { class: 'fz-card' },
          h('div', { class: 'fz-card-head' },
            h('b', {}, r.titulo),
            c ? h('span', { class: 'fz-tag', style: { background: c.cor } }, c.nome) : null,
            r.atalho ? h('span', { class: 'fz-tag fz-tag-ghost' }, r.atalho) : null),
          r.texto ? h('div', { class: 'fz-preview' }, r.texto) : null,
          r.midias?.length ? h('small', {}, `📎 ${r.midias.length} arquivo(s)`) : null,
          row(
            btn('Enviar', async () => {
              const chat = await requireChat(); if (!chat) return;
              try { await sendContent(chat.id, r, await ctxOf(chat.id, chat.nome), 'resposta_rapida'); toast('Enviado!', 'ok'); } catch (e) { toast(e.message, 'error'); }
            }, 'fz-btn-primary fz-btn-sm'),
            btn('Inserir', async () => {
              const chat = await requireChat(); if (!chat) return;
              await WA.call('setInputText', U.applyVars(r.texto, await ctxOf(chat.id, chat.nome)));
            }, 'fz-btn-sm'),
            btn('Editar', () => editResposta(r), 'fz-btn-sm'),
            btn('Excluir', async () => {
              if (!(await confirm(`Excluir "${r.titulo}"?`))) return;
              await S.update('respostasRapidas', (l) => l.filter((x) => x.id !== r.id)); refresh();
            }, 'fz-btn-sm fz-btn-danger')));
      }) : [empty('Nenhuma resposta rápida.')]));
    };

    el.append(
      row(btn('+ Nova resposta', () => editResposta(), 'fz-btn-primary'), btn('Categorias', editCategorias)),
      h('input', { class: 'fz-input', placeholder: 'Buscar…', value: filtro, oninput: (e) => { filtro = state.respFiltro = e.target.value; draw(); } }),
      h('div', { class: 'fz-chips' },
        h('button', { class: 'fz-chip' + (!cat ? ' active' : ''), onclick: () => { state.respCat = ''; refresh(); } }, 'Todas'),
        cats.map((c) => h('button', { class: 'fz-chip' + (cat === c.id ? ' active' : ''), style: { borderColor: c.cor }, onclick: () => { state.respCat = c.id; refresh(); } }, c.nome))),
      listBox,
      h('small', { class: 'fz-help' }, 'Variáveis: {nome} {primeiro_nome} {telefone} {saudacao} {data} {hora}. Use {Oi|Olá} para variar o texto.'));
    draw();
  });

  async function editResposta(r = null) {
    const cats = await S.get('categoria');
    const v = await form(r ? 'Editar resposta' : 'Nova resposta', [
      { name: 'titulo', label: 'Título', value: r?.titulo, required: true },
      { name: 'categoriaId', label: 'Categoria', type: 'select', value: r?.categoriaId || '', options: [['', 'Sem categoria'], ...cats.map((c) => [c.id, c.nome])] },
      { name: 'texto', label: 'Mensagem', type: 'textarea', value: r?.texto, help: 'Aceita {nome}, {saudacao} etc.' },
      { name: 'atalho', label: 'Atalho (opcional)', value: r?.atalho, placeholder: '/preco', help: 'Digite o atalho + espaço na conversa para inserir o texto.' },
      { name: 'arquivos', label: 'Adicionar arquivos (imagem, vídeo, áudio, documento)', type: 'file', multiple: true },
      ...(r?.midias?.length ? [{ name: 'limpar', label: `Remover os ${r.midias.length} arquivo(s) atuais`, type: 'checkbox' }] : [])
    ]);
    if (!v) return;
    const novas = await filesToMedia(v.arquivos);
    await S.update('respostasRapidas', (list) => {
      const base = r ? list.find((x) => x.id === r.id) : { id: U.uid(), midias: [], criadoEm: new Date().toISOString() };
      Object.assign(base, { titulo: v.titulo, categoriaId: v.categoriaId, texto: v.texto, atalho: v.atalho.trim() });
      base.midias = [...(v.limpar ? [] : base.midias || []), ...novas].slice(0, 50);
      if (!r) list.push(base);
      return list;
    });
    refresh();
  }

  async function editCategorias() {
    const cats = await S.get('categoria');
    const box = h('div', {});
    const draw = () => box.replaceChildren(
      ...cats.map((c, i) => row(
        h('input', { type: 'color', value: c.cor, oninput: (e) => { c.cor = e.target.value; } }),
        h('input', { class: 'fz-input', value: c.nome, oninput: (e) => { c.nome = e.target.value; } }),
        btn('×', () => { cats.splice(i, 1); draw(); }, 'fz-btn-sm fz-btn-danger'))),
      btn('+ Categoria', () => { cats.push({ id: U.uid(), nome: 'Nova categoria', cor: '#3b82f6' }); draw(); }));
    draw();
    const ok = await modal('Categorias', box, [{ label: 'Cancelar', value: () => false }, { label: 'Salvar', primary: true, value: () => true }]);
    if (ok) { await S.set('categoria', cats); refresh(); }
  }

  /* ========================================================= contato */

  reg('contato', '👤', 'Conversa atual', async (el) => {
    const chat = await currentChat();
    if (!chat) { el.append(empty('Abra uma conversa para ver o CRM, notas e ações do contato.')); return; }
    const { crm, notes, contatos, encomendas, pinChat, FollowUp } = await S.getMany(['crm', 'notes', 'contatos', 'encomendas', 'pinChat', 'FollowUp']);
    const card = crm.cards.find((c) => c.chatId === chat.id);
    const contato = contatos.find((c) => c.chatId === chat.id) || {};
    const minhasNotas = notes.filter((n) => n.chatId === chat.id);
    const pedidos = encomendas.filter((p) => p.chatId === chat.id);
    const fixado = pinChat.some((p) => p.id === chat.id);
    const ctx = await ctxOf(chat.id, chat.nome);

    el.append(h('div', { class: 'fz-contact' },
      h('div', { class: 'fz-avatar' }, (contato.nome || chat.nome || '?').slice(0, 1).toUpperCase()),
      h('div', {}, h('b', {}, contato.nome || chat.nome || 'Sem nome'), h('div', {}, chat.isGroup ? 'Grupo' : U.formatPhone(chat.telefone || U.phoneFromChatId(chat.id))))));

    // Funil
    const etapaSel = h('select', { class: 'fz-input' }, h('option', { value: '' }, 'Fora do funil'),
      crm.etapas.map((e) => h('option', { value: e.id, selected: card?.etapaId === e.id }, e.nome)));
    const valor = h('input', { class: 'fz-input', type: 'number', step: '0.01', placeholder: 'Valor (R$)', value: card?.valor ?? '' });
    const etiquetas = h('input', { class: 'fz-input', placeholder: 'Etiquetas (separe por vírgula)', value: (card?.etiquetas || []).join(', ') });
    el.append(section('Funil (CRM)', etapaSel, row(valor), etiquetas,
      row(btn('Salvar no funil', async () => {
        await S.update('crm', (c) => {
          const idx = c.cards.findIndex((x) => x.chatId === chat.id);
          if (!etapaSel.value) { if (idx >= 0) c.cards.splice(idx, 1); return c; }
          const now = new Date().toISOString();
          const data = {
            etapaId: etapaSel.value, valor: valor.value === '' ? '' : Number(valor.value),
            etiquetas: etiquetas.value.split(',').map((s) => s.trim()).filter(Boolean), atualizadoEm: now
          };
          if (idx >= 0) Object.assign(c.cards[idx], data);
          else c.cards.push({ id: U.uid(), chatId: chat.id, nome: ctx.nome, telefone: ctx.telefone, criadoEm: now, ...data });
          return c;
        });
        toast('Funil atualizado.', 'ok'); refresh();
      }, 'fz-btn-primary fz-btn-sm'), btn('Abrir CRM', () => bg('CRM'), 'fz-btn-sm'))));

    // Dados do contato
    el.append(section('Dados do contato',
      row(btn('Editar dados', async () => {
        const v = await form('Dados do contato', [
          { name: 'nome', label: 'Nome', value: contato.nome || chat.nome },
          { name: 'email', label: 'E-mail', value: contato.email },
          { name: 'empresa', label: 'Empresa', value: contato.empresa },
          { name: 'aniversario', label: 'Aniversário', type: 'date', value: contato.aniversario },
          { name: 'observacao', label: 'Observação', type: 'textarea', rows: 3, value: contato.observacao }
        ]);
        if (!v) return;
        await S.update('contatos', (l) => {
          const i = l.findIndex((x) => x.chatId === chat.id);
          const d = { chatId: chat.id, telefone: ctx.telefone, ...v };
          if (i >= 0) Object.assign(l[i], d); else l.push(d);
          return l;
        });
        refresh();
      }, 'fz-btn-sm')),
      contato.email ? h('div', {}, '✉️ ', contato.email) : null,
      contato.empresa ? h('div', {}, '🏢 ', contato.empresa) : null,
      contato.aniversario ? h('div', {}, '🎂 ', new Date(contato.aniversario + 'T12:00').toLocaleDateString('pt-BR')) : null,
      contato.observacao ? h('div', { class: 'fz-preview' }, contato.observacao) : null));

    // Notas
    const nova = h('textarea', { class: 'fz-input', rows: 2, placeholder: 'Escreva uma nota…' });
    el.append(section(`Notas (${minhasNotas.length})`,
      nova,
      row(btn('Adicionar nota', async () => {
        if (!nova.value.trim()) return;
        await S.update('notes', (l) => { l.push({ id: U.uid(), chatId: chat.id, texto: nova.value.trim(), criadoEm: new Date().toISOString() }); return l; });
        refresh();
      }, 'fz-btn-sm fz-btn-primary')),
      minhasNotas.slice().reverse().map((n) => h('div', { class: 'fz-note' },
        h('small', {}, U.fmtDateTime(n.criadoEm)),
        h('div', {}, n.texto),
        btn('×', async () => { await S.update('notes', (l) => l.filter((x) => x.id !== n.id)); refresh(); }, 'fz-x')))));

    // Ações
    const fus = FollowUp.filter((f) => f.chatId === chat.id && f.status === 'pendente');
    el.append(section('Ações',
      h('div', { class: 'fz-grid' },
        btn('⏰ Agendar mensagem', () => novoAgendamento(chat)),
        btn('🔔 Lembrete', () => novoLembrete(chat)),
        btn(`🔁 Follow-up${fus.length ? ` (${fus.length})` : ''}`, () => novoFollowUp(chat)),
        btn('🛒 Novo pedido', () => editPedido(null, chat)),
        btn('🧩 Executar fluxo', () => escolherFluxo(chat)),
        btn(fixado ? '📌 Desafixar' : '📌 Fixar conversa', async () => {
          await S.update('pinChat', (l) => fixado ? l.filter((p) => p.id !== chat.id) : [...l, { id: chat.id, nome: ctx.nome }]);
          refresh();
        }),
        btn('📁 Adicionar a uma aba', () => addToTab(chat)),
        btn('✨ Sugerir resposta (IA)', () => sugerirIA(chat)),
        btn('🎙️ Transcrever último áudio', () => transcrever(chat)))));

    if (pedidos.length) {
      el.append(section(`Pedidos (${pedidos.length})`, pedidos.map((p) => h('div', { class: 'fz-card' },
        h('b', {}, U.money(p.valor)), ' · ', p.status, h('div', { class: 'fz-preview' }, p.itens)))));
    }
  });

  async function addToTab(chat) {
    const tabs = await S.get('userTabs');
    const ctx = await ctxOf(chat.id, chat.nome);
    const v = await form('Adicionar a uma aba', [
      { name: 'tab', label: 'Aba', type: 'select', options: [['__nova', '+ Criar nova aba'], ...tabs.map((t) => [t.id, t.nome])] },
      { name: 'nome', label: 'Nome da nova aba (se for criar)' }
    ], 'Adicionar');
    if (!v) return;
    await S.update('userTabs', (l) => {
      let t = l.find((x) => x.id === v.tab);
      if (!t) { t = { id: U.uid(), nome: v.nome || 'Nova aba', chats: [] }; l.push(t); }
      if (!t.chats.some((c) => c.id === chat.id)) t.chats.push({ id: chat.id, nome: ctx.nome });
      return l;
    });
    toast('Adicionado à aba.', 'ok');
  }

  async function sugerirIA(chat) {
    const t = toast('Gerando sugestão…', 'info', { sticky: true });
    try {
      const [msgs, ia, perfil] = await Promise.all([WA.call('getMessages', chat.id, 20), S.get('IA'), S.get('perfil')]);
      const conversa = msgs.filter((m) => m.body).map((m) => `${m.fromMe ? 'Atendente' : 'Cliente'}: ${m.body}`).join('\n');
      const system = (ia.prompt || 'Você é um atendente de vendas cordial e objetivo no WhatsApp. Responda em português do Brasil, de forma curta.') +
        (perfil.nome ? ` Seu nome é ${perfil.nome}.` : '');
      const texto = await bg('AI', { system, prompt: `Conversa até agora:\n${conversa}\n\nEscreva a próxima resposta do Atendente. Responda apenas com o texto da mensagem.` });
      t.remove();
      await WA.call('setInputText', texto.trim());
      toast('Sugestão colocada na caixa de mensagem. Revise antes de enviar.', 'ok');
    } catch (e) {
      t.remove();
      toast(e.message, 'error');
    }
  }

  async function transcrever(chat) {
    const t = toast('Baixando e transcrevendo áudio…', 'info', { sticky: true });
    try {
      const audio = await WA.call('lastAudio', chat.id);
      if (!audio) throw new Error('Nenhum áudio recente nesta conversa.');
      const texto = await bg('TRANSCRIBE', { dataUrl: audio.dataUrl, mime: audio.mime });
      t.remove();
      await modal('Transcrição do áudio', h('div', { class: 'fz-preview', style: { whiteSpace: 'pre-wrap' } }, texto || '(vazio)'), [
        { label: 'Copiar', value: () => { navigator.clipboard.writeText(texto); toast('Copiado.', 'ok'); } },
        { label: 'Salvar como nota', primary: true, value: async () => {
          await S.update('notes', (l) => { l.push({ id: U.uid(), chatId: chat.id, texto: '🎙️ ' + texto, criadoEm: new Date().toISOString() }); return l; });
          refresh(); return true;
        } }
      ]);
    } catch (e) {
      t.remove();
      toast(e.message, 'error');
    }
  }

  /* ============================================================== CRM */

  reg('crm', '📊', 'Funil de vendas (CRM)', async (el) => {
    const crm = await S.get('crm');
    el.append(row(btn('Abrir CRM completo', () => bg('CRM'), 'fz-btn-primary'), btn('+ Conversa atual', () => openPanel('contato'))));
    for (const e of crm.etapas) {
      const cards = crm.cards.filter((c) => c.etapaId === e.id);
      const total = cards.reduce((s, c) => s + (Number(c.valor) || 0), 0);
      el.append(h('details', { class: 'fz-stage', open: cards.length > 0 && cards.length < 8 },
        h('summary', {}, h('span', { class: 'fz-dot', style: { background: e.cor } }), `${e.nome} (${cards.length})`, h('small', {}, ' ' + U.money(total))),
        cards.map((c) => h('div', { class: 'fz-card fz-click', onclick: () => WA.call('openChat', c.chatId) },
          h('b', {}, c.nome || U.formatPhone(c.telefone)), c.valor ? h('small', {}, ' · ' + U.money(c.valor)) : null,
          (c.etiquetas || []).length ? h('div', {}, c.etiquetas.map((t) => h('span', { class: 'fz-tag fz-tag-ghost' }, t))) : null))));
    }
  });

  /* ===================================================== agendamentos */

  async function novoAgendamento(chat = null, item = null) {
    const [respostas, fluxo] = await Promise.all([S.get('respostasRapidas'), S.get('fluxo')]);
    const v = await form(item ? 'Editar agendamento' : 'Agendar mensagem', [
      ...(chat ? [] : [{ name: 'telefone', label: 'Número (com DDI e DDD)', placeholder: '5511999999999', value: item ? U.phoneFromChatId(item.chatId) : '', required: true }]),
      { name: 'mensagem', label: 'Mensagem', type: 'textarea', value: item?.mensagem },
      { name: 'respostaId', label: 'Ou enviar resposta rápida', type: 'select', value: item?.respostaId || '', options: [['', '—'], ...respostas.map((r) => [r.id, r.titulo])] },
      { name: 'fluxoId', label: 'Ou executar fluxo', type: 'select', value: item?.fluxoId || '', options: [['', '—'], ...fluxo.workflows.map((w) => [w.id, w.nome])] },
      { name: 'quando', label: 'Data e hora', type: 'datetime', value: U.toLocalInput(item ? new Date(item.quando) : new Date(Date.now() + 3600000)), required: true },
      { name: 'recorrencia', label: 'Repetir', type: 'select', value: item?.recorrencia || 'nenhuma', options: [['nenhuma', 'Não repetir'], ['diaria', 'Todo dia'], ['semanal', 'Toda semana'], ['mensal', 'Todo mês']] }
    ], 'Agendar');
    if (!v) return;
    if (!v.mensagem.trim() && !v.respostaId && !v.fluxoId) { toast('Informe a mensagem, uma resposta rápida ou um fluxo.', 'error'); return; }
    const chatId = chat ? chat.id : (item && !v.telefone ? item.chatId : U.toChatId(v.telefone));
    const nome = chat ? (await ctxOf(chat.id, chat.nome)).nome : item?.nome || '';
    await S.update('agendamentos', (l) => {
      const data = { chatId, nome, mensagem: v.mensagem, respostaId: v.respostaId, fluxoId: v.fluxoId, quando: new Date(v.quando).toISOString(), recorrencia: v.recorrencia, status: 'pendente', erro: '' };
      if (item) Object.assign(l.find((x) => x.id === item.id) || {}, data);
      else l.push({ id: U.uid(), criadoEm: new Date().toISOString(), ...data });
      return l;
    });
    toast('Mensagem agendada.', 'ok');
    refresh();
  }

  reg('agenda', '⏰', 'Agendamentos', async (el) => {
    const { agendamentos: list, agendamentosNaoDisparados: perdidos, sendAfterWhatsAppOpens } =
      await S.getMany(['agendamentos', 'agendamentosNaoDisparados', 'sendAfterWhatsAppOpens']);
    const pend = list.filter((a) => a.status === 'pendente').sort((a, b) => a.quando.localeCompare(b.quando));
    const hist = list.filter((a) => a.status !== 'pendente').sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 30);

    const item = (a, extra) => h('div', { class: 'fz-card' },
      h('div', { class: 'fz-card-head' }, h('b', {}, a.nome || U.formatPhone(U.phoneFromChatId(a.chatId))),
        h('span', { class: 'fz-tag fz-tag-' + a.status }, a.status), a.recorrencia && a.recorrencia !== 'nenhuma' ? h('span', { class: 'fz-tag fz-tag-ghost' }, '↻ ' + a.recorrencia) : null),
      h('small', {}, '🕒 ', U.fmtDateTime(a.quando)),
      h('div', { class: 'fz-preview' }, a.mensagem || (a.respostaId ? '[resposta rápida]' : '[fluxo]')),
      a.erro ? h('small', { class: 'fz-err' }, a.erro) : null,
      extra);

    el.append(
      row(btn('+ Agendar para conversa atual', async () => { const c = await requireChat(); if (c) novoAgendamento(c); }, 'fz-btn-primary'), btn('+ Para um número', () => novoAgendamento())),
      h('label', { class: 'fz-field-inline' }, h('input', { type: 'checkbox', checked: !!sendAfterWhatsAppOpens, onchange: (e) => S.set('sendAfterWhatsAppOpens', e.target.checked) }),
        ' Enviar agendamentos atrasados quando o WhatsApp for aberto'),
      section(`Pendentes (${pend.length})`, pend.length ? pend.map((a) => item(a, row(
        btn('Enviar agora', async () => { await dispararAgendamento(a.id, true); refresh(); }, 'fz-btn-sm'),
        btn('Editar', () => novoAgendamento(null, a), 'fz-btn-sm'),
        btn('Excluir', async () => { await S.update('agendamentos', (l) => l.filter((x) => x.id !== a.id)); refresh(); }, 'fz-btn-sm fz-btn-danger')))) : empty('Nada agendado.')),
      perdidos.length ? section(`Não disparados (${perdidos.length})`, h('small', {}, 'O WhatsApp estava fechado no horário.'),
        perdidos.map((a) => item(a, row(
          btn('Reenviar agora', async () => {
            await S.update('agendamentosNaoDisparados', (l) => l.filter((x) => x.id !== a.id));
            await S.update('agendamentos', (l) => { l.push({ ...a, status: 'pendente', quando: new Date().toISOString() }); return l; });
            await dispararAgendamento(a.id, true); refresh();
          }, 'fz-btn-sm fz-btn-primary'),
          btn('Descartar', async () => { await S.update('agendamentosNaoDisparados', (l) => l.filter((x) => x.id !== a.id)); refresh(); }, 'fz-btn-sm fz-btn-danger'))))) : null,
      section('Histórico', hist.length ? hist.map((a) => item(a)) : empty('Sem histórico.'),
        hist.length ? btn('Limpar histórico', async () => { await S.update('agendamentos', (l) => l.filter((x) => x.status === 'pendente')); refresh(); }, 'fz-btn-sm') : null));
  });

  async function dispararAgendamento(id, force = false) {
    const list = await S.get('agendamentos');
    const a = list.find((x) => x.id === id);
    if (!a || (a.status !== 'pendente' && !force)) return;
    const patch = {};
    try {
      const ctx = await ctxOf(a.chatId, a.nome);
      if (a.fluxoId) await runFlow(a.chatId, a.fluxoId, ctx, 'agendamento');
      else if (a.respostaId) await sendQuickReply(a.chatId, a.respostaId, ctx, 'agendamento');
      if (a.mensagem && a.mensagem.trim()) await sendContent(a.chatId, { texto: a.mensagem }, ctx, 'agendamento');
      const next = U.nextOccurrence(a.quando, a.recorrencia);
      if (next) {
        // Pula ocorrências já vencidas
        let n = next;
        while (new Date(n) <= new Date()) n = U.nextOccurrence(n, a.recorrencia);
        Object.assign(patch, { quando: n, status: 'pendente', ultimoEnvio: new Date().toISOString(), erro: '' });
      } else Object.assign(patch, { status: 'enviado', enviadoEm: new Date().toISOString(), erro: '' });
    } catch (e) {
      Object.assign(patch, { status: 'erro', erro: e.message });
    }
    await S.update('agendamentos', (l) => { const x = l.find((i) => i.id === id); if (x) Object.assign(x, patch); return l; });
  }

  async function processarAgendamentos() {
    if (state.busy.agenda || !WA.isReady()) return;
    state.busy.agenda = true;
    try {
      const { agendamentos: list, sendAfterWhatsAppOpens } = await S.getMany(['agendamentos', 'sendAfterWhatsAppOpens']);
      const now = Date.now();
      const vencidos = list.filter((a) => a.status === 'pendente' && new Date(a.quando).getTime() <= now);
      for (const a of vencidos) {
        const atrasoMin = (now - new Date(a.quando).getTime()) / 60000;
        if (atrasoMin > 10 && !sendAfterWhatsAppOpens) {
          await S.update('agendamentos', (l) => l.filter((x) => x.id !== a.id));
          await S.update('agendamentosNaoDisparados', (l) => { l.push({ ...a, status: 'nao_disparado' }); return l; });
          continue;
        }
        await dispararAgendamento(a.id);
        await U.sleep(U.randInt(2000, 5000));
      }
      if (vencidos.length && state.panel === 'agenda') refresh();
    } finally {
      state.busy.agenda = false;
    }
  }

  /* ======================================================== lembretes */

  async function novoLembrete(chat = null) {
    const now = new Date(Date.now() + 3600000);
    const v = await form('Novo lembrete', [
      { name: 'titulo', label: 'Lembrar de…', required: true, value: chat ? 'Retornar contato' : '' },
      { name: 'date', label: 'Data', type: 'date', value: U.toLocalInput(now).slice(0, 10), required: true },
      { name: 'time', label: 'Hora', type: 'time', value: U.toLocalInput(now).slice(11, 16), required: true },
      { name: 'descricao', label: 'Detalhes', type: 'textarea', rows: 3 }
    ]);
    if (!v) return;
    const nome = chat ? (await ctxOf(chat.id, chat.nome)).nome : '';
    await S.update('notifications', (l) => { l.push({ id: U.uid(), chatId: chat?.id || '', nome, ...v, timeOut: false, read: false }); return l; });
    toast('Lembrete criado.', 'ok');
    refresh();
  }

  reg('lembretes', '🔔', 'Lembretes', async (el) => {
    const { notifications: list, useNotification } = await S.getMany(['notifications', 'useNotification']);
    const ord = list.slice().sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
    el.append(
      row(btn('+ Lembrete da conversa', async () => { const c = await requireChat(); if (c) novoLembrete(c); }, 'fz-btn-primary'), btn('+ Lembrete geral', () => novoLembrete())),
      h('label', { class: 'fz-field-inline' }, h('input', { type: 'checkbox', checked: !!useNotification, onchange: (e) => S.set('useNotification', e.target.checked) }), ' Notificação do Chrome no horário'),
      ord.length ? ord.map((n) => h('div', { class: 'fz-card' + (n.timeOut && !n.read ? ' fz-card-alert' : '') },
        h('div', { class: 'fz-card-head' }, h('b', {}, n.titulo), n.timeOut ? h('span', { class: 'fz-tag fz-tag-' + (n.read ? 'enviado' : 'erro') }, n.read ? 'lido' : 'vencido') : h('span', { class: 'fz-tag fz-tag-pendente' }, 'agendado')),
        h('small', {}, `🕒 ${new Date(`${n.date}T${n.time}`).toLocaleString('pt-BR')}`, n.nome ? ` · ${n.nome}` : ''),
        n.descricao ? h('div', { class: 'fz-preview' }, n.descricao) : null,
        row(
          n.chatId ? btn('Abrir conversa', () => WA.call('openChat', n.chatId), 'fz-btn-sm') : null,
          n.timeOut && !n.read ? btn('Marcar como lido', async () => { await bg('READ_NOTIFICATION', { id: n.id }); refresh(); }, 'fz-btn-sm') : null,
          btn('Excluir', async () => { await S.update('notifications', (l) => l.filter((x) => x.id !== n.id)); await bg('CHECK_NOTIFICATIONS'); refresh(); }, 'fz-btn-sm fz-btn-danger')))) : empty('Nenhum lembrete.'));
  });

  /* ==================================================== envio em massa */

  const massa = { rodando: false, pausado: false, parar: false, log: [], feitos: 0, total: 0 };

  function parseContatos(txt) {
    return txt.split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const [tel, ...resto] = l.split(/[;,\t]/);
      return { telefone: U.onlyDigits(tel), nome: resto.join(' ').trim() };
    }).filter((c) => c.telefone.length >= 10);
  }

  reg('massa', '📢', 'Envio em massa', async (el) => {
    const { agrupamentos, respostasRapidas, crm } = await S.getMany(['agrupamentos', 'respostasRapidas', 'crm']);
    const numeros = h('textarea', { class: 'fz-input', rows: 6, placeholder: '5511999999999;Maria\n5521988888888;João' });
    numeros.value = state.massaNumeros || '';
    numeros.oninput = () => { state.massaNumeros = numeros.value; };
    const msg = h('textarea', { class: 'fz-input', rows: 5, placeholder: '{saudacao}, {primeiro_nome}! …' });
    msg.value = state.massaMsg || '';
    msg.oninput = () => { state.massaMsg = msg.value; };
    const resp = h('select', { class: 'fz-input' }, h('option', { value: '' }, 'Sem resposta rápida (só o texto acima)'), respostasRapidas.map((r) => h('option', { value: r.id }, r.titulo)));
    const min = h('input', { class: 'fz-input', type: 'number', value: state.massaMin || 15, min: 3 });
    const max = h('input', { class: 'fz-input', type: 'number', value: state.massaMax || 40, min: 3 });
    const loteN = h('input', { class: 'fz-input', type: 'number', value: 20, min: 1 });
    const loteP = h('input', { class: 'fz-input', type: 'number', value: 120, min: 0 });
    const progress = h('div', { class: 'fz-progress' }, h('div', { style: { width: massa.total ? (100 * massa.feitos / massa.total) + '%' : '0%' } }));
    const status = h('div', { class: 'fz-help' }, massa.total ? `${massa.feitos}/${massa.total} processados` : '');
    const logBox = h('div', { class: 'fz-log' }, massa.log.slice(-200).map((l) => h('div', {}, l)));

    const listaSel = h('select', { class: 'fz-input', onchange: () => {
      const g = agrupamentos.find((a) => a.id === listaSel.value);
      if (g) { numeros.value = state.massaNumeros = g.contatos.map((c) => `${c.telefone};${c.nome}`).join('\n'); }
    } }, h('option', { value: '' }, 'Carregar lista salva…'), agrupamentos.map((g) => h('option', { value: g.id }, `${g.nome} (${g.contatos.length})`)));
    const etapaSel = h('select', { class: 'fz-input', onchange: async () => {
      const cards = crm.cards.filter((c) => c.etapaId === etapaSel.value && c.telefone);
      numeros.value = state.massaNumeros = cards.map((c) => `${c.telefone};${c.nome || ''}`).join('\n');
    } }, h('option', { value: '' }, 'Importar etapa do CRM…'), crm.etapas.map((e) => h('option', { value: e.id }, e.nome)));

    el.append(
      section('Contatos', row(listaSel), row(etapaSel), numeros, h('small', { class: 'fz-help' }, 'Um por linha: número com DDI e DDD; nome opcional após ";".'),
        row(btn('Salvar lista', async () => {
          const contatos = parseContatos(numeros.value);
          if (!contatos.length) return toast('Nenhum número válido.', 'error');
          const v = await form('Salvar lista', [{ name: 'nome', label: 'Nome da lista', required: true }]);
          if (!v) return;
          await S.update('agrupamentos', (l) => { l.push({ id: U.uid(), nome: v.nome, contatos, criadoEm: new Date().toISOString() }); return l; });
          refresh();
        }, 'fz-btn-sm'), listaSel.value ? null : btn('Excluir listas…', async () => {
          const v = await form('Excluir listas', [{ name: 'ids', label: 'Listas', type: 'multiselect', options: agrupamentos.map((g) => [g.id, g.nome]) }], 'Excluir');
          if (v?.ids?.length) { await S.update('agrupamentos', (l) => l.filter((g) => !v.ids.includes(g.id))); refresh(); }
        }, 'fz-btn-sm'))),
      section('Mensagem', msg, resp),
      section('Intervalo (anti-bloqueio)',
        row(h('label', { class: 'fz-field' }, h('span', {}, 'Mín. (s)'), min), h('label', { class: 'fz-field' }, h('span', {}, 'Máx. (s)'), max)),
        row(h('label', { class: 'fz-field' }, h('span', {}, 'Pausar a cada'), loteN), h('label', { class: 'fz-field' }, h('span', {}, 'Pausa de (s)'), loteP))),
      row(
        massa.rodando
          ? [btn(massa.pausado ? '▶ Continuar' : '⏸ Pausar', () => { massa.pausado = !massa.pausado; refresh(); }), btn('■ Parar', () => { massa.parar = true; }, 'fz-btn-danger')]
          : btn('▶ Iniciar envio', async () => {
            const contatos = parseContatos(numeros.value);
            if (!contatos.length) return toast('Adicione os números.', 'error');
            if (!msg.value.trim() && !resp.value) return toast('Escreva a mensagem ou escolha uma resposta rápida.', 'error');
            if (!(await confirm(`Enviar para ${contatos.length} contato(s)?`, 'Enviar'))) return;
            state.massaMin = Number(min.value); state.massaMax = Number(max.value);
            iniciarMassa(contatos, msg.value, resp.value, Math.max(3, Number(min.value)), Math.max(Number(min.value), Number(max.value)), Number(loteN.value) || 0, Number(loteP.value) || 0);
          }, 'fz-btn-primary')),
      progress, status, logBox,
      h('small', { class: 'fz-help' }, 'Mantenha esta aba aberta durante o envio. Envios em massa para quem não te conhece podem levar a bloqueio do número.'));
  });

  async function iniciarMassa(contatos, texto, respostaId, min, max, loteN, loteP) {
    Object.assign(massa, { rodando: true, pausado: false, parar: false, log: [], feitos: 0, total: contatos.length });
    const add = (l) => { massa.log.push(`${new Date().toLocaleTimeString('pt-BR')} ${l}`); if (state.panel === 'massa') refresh(); };
    add(`Iniciando envio para ${contatos.length} contato(s).`);
    for (let i = 0; i < contatos.length; i++) {
      while (massa.pausado && !massa.parar) await U.sleep(500);
      if (massa.parar) { add('Envio interrompido.'); break; }
      const c = contatos[i];
      try {
        const chatId = await WA.call('checkNumber', c.telefone);
        if (!chatId) throw new Error('número sem WhatsApp');
        const ctx = { nome: c.nome, telefone: c.telefone };
        if (respostaId) await sendQuickReply(chatId, respostaId, ctx, 'envio_massa');
        if (texto.trim()) await sendContent(chatId, { texto }, ctx, 'envio_massa');
        add(`✅ ${c.nome || c.telefone}`);
      } catch (e) {
        await logRel('envio_massa', U.toChatId(c.telefone), false);
        add(`❌ ${c.nome || c.telefone}: ${e.message}`);
      }
      massa.feitos = i + 1;
      if (i < contatos.length - 1) {
        let espera = U.randInt(min, max);
        if (loteN && (i + 1) % loteN === 0 && loteP) { espera += loteP; add(`Pausa de lote: ${loteP}s`); }
        for (let s = 0; s < espera * 2 && !massa.parar; s++) await U.sleep(500);
      }
    }
    massa.rodando = false;
    add('Concluído.');
    toast(`Envio em massa concluído: ${massa.feitos}/${massa.total}.`, 'ok');
  }

  /* ============================================== robô (autoatendimento) */

  reg('robo', '🤖', 'Robô de atendimento', async (el) => {
    const { autoatendimento: cfg, respostasRapidas, fluxo } = await S.getMany(['autoatendimento', 'respostasRapidas', 'fluxo']);
    el.append(
      h('label', { class: 'fz-switch' }, h('input', { type: 'checkbox', checked: !!cfg.ativo, onchange: async (e) => { await S.update('autoatendimento', (c) => { c.ativo = e.target.checked; return c; }); toast(e.target.checked ? 'Robô ligado.' : 'Robô desligado.', 'ok'); } }), ' Robô ligado'),
      h('small', { class: 'fz-help' }, 'Responde automaticamente mensagens recebidas conforme as regras. Funciona enquanto o WhatsApp Web estiver aberto.'),
      row(btn('+ Nova regra', () => editRegra(null, respostasRapidas, fluxo), 'fz-btn-primary')),
      cfg.regras.length ? cfg.regras.map((r) => h('div', { class: 'fz-card' + (r.ativo ? '' : ' fz-off') },
        h('div', { class: 'fz-card-head' }, h('b', {}, r.nome), h('span', { class: 'fz-tag fz-tag-ghost' }, { qualquer: 'qualquer mensagem', contem: 'contém', igual: 'igual a', comeca: 'começa com' }[r.gatilho])),
        r.palavras ? h('small', {}, '🔑 ', r.palavras) : null,
        h('div', { class: 'fz-preview' }, r.resposta || (r.respostaId ? '[resposta rápida]' : r.fluxoId ? '[fluxo]' : '')),
        h('small', {}, `Não repete na mesma conversa por ${r.intervaloHoras || 0}h`, r.foraHorario ? ` · só fora do horário ${r.inicio}-${r.fim}` : ''),
        row(
          btn(r.ativo ? 'Desativar' : 'Ativar', async () => { await S.update('autoatendimento', (c) => { c.regras.find((x) => x.id === r.id).ativo = !r.ativo; return c; }); refresh(); }, 'fz-btn-sm'),
          btn('Editar', () => editRegra(r, respostasRapidas, fluxo), 'fz-btn-sm'),
          btn('Excluir', async () => { await S.update('autoatendimento', (c) => { c.regras = c.regras.filter((x) => x.id !== r.id); return c; }); refresh(); }, 'fz-btn-sm fz-btn-danger')))) : empty('Nenhuma regra.'));
  });

  async function editRegra(r, respostas, fluxo) {
    const v = await form(r ? 'Editar regra' : 'Nova regra', [
      { name: 'nome', label: 'Nome da regra', value: r?.nome || 'Boas-vindas', required: true },
      { name: 'gatilho', label: 'Quando a mensagem', type: 'select', value: r?.gatilho || 'contem', options: [['qualquer', 'For qualquer mensagem'], ['contem', 'Contém uma das palavras'], ['igual', 'For igual a uma das palavras'], ['comeca', 'Começar com uma das palavras']] },
      { name: 'palavras', label: 'Palavras-chave (separe por vírgula)', value: r?.palavras, placeholder: 'preço, valor, quanto custa' },
      { name: 'resposta', label: 'Responder com o texto', type: 'textarea', value: r?.resposta },
      { name: 'respostaId', label: 'Ou resposta rápida', type: 'select', value: r?.respostaId || '', options: [['', '—'], ...respostas.map((x) => [x.id, x.titulo])] },
      { name: 'fluxoId', label: 'Ou executar fluxo', type: 'select', value: r?.fluxoId || '', options: [['', '—'], ...fluxo.workflows.map((w) => [w.id, w.nome])] },
      { name: 'atraso', label: 'Esperar antes de responder (segundos)', type: 'number', value: r?.atraso ?? 3 },
      { name: 'intervaloHoras', label: 'Não repetir na mesma conversa por (horas)', type: 'number', value: r?.intervaloHoras ?? 24 },
      { name: 'grupos', label: 'Responder também em grupos', type: 'checkbox', value: r?.grupos },
      { name: 'foraHorario', label: 'Só fora do horário de atendimento', type: 'checkbox', value: r?.foraHorario },
      { name: 'inicio', label: 'Início do expediente', type: 'time', value: r?.inicio || '08:00' },
      { name: 'fim', label: 'Fim do expediente', type: 'time', value: r?.fim || '18:00' }
    ]);
    if (!v) return;
    await S.update('autoatendimento', (c) => {
      if (r) Object.assign(c.regras.find((x) => x.id === r.id), v);
      else c.regras.push({ id: U.uid(), ativo: true, ...v });
      return c;
    });
    refresh();
  }

  function regraCasa(r, texto) {
    if (r.gatilho === 'qualquer') return true;
    const t = texto.toLowerCase().trim();
    const palavras = String(r.palavras || '').split(',').map((p) => p.trim().toLowerCase()).filter(Boolean);
    if (r.gatilho === 'contem') return palavras.some((p) => t.includes(p));
    if (r.gatilho === 'igual') return palavras.some((p) => t === p);
    if (r.gatilho === 'comeca') return palavras.some((p) => t.startsWith(p));
    return false;
  }

  function dentroDoHorario(inicio, fim) {
    const now = new Date();
    const m = now.getHours() * 60 + now.getMinutes();
    const [hi, mi] = inicio.split(':').map(Number);
    const [hf, mf] = fim.split(':').map(Number);
    const a = hi * 60 + mi, b = hf * 60 + mf;
    return a <= b ? m >= a && m < b : m >= a || m < b;
  }

  async function roboOnMessage(msg) {
    const cfg = await S.get('autoatendimento');
    if (!cfg.ativo) return;
    for (const r of cfg.regras) {
      if (!r.ativo) continue;
      if (msg.isGroup && !r.grupos) continue;
      if (r.foraHorario && dentroDoHorario(r.inicio, r.fim)) continue;
      if (!regraCasa(r, msg.body || '')) continue;
      const key = `${r.id}:${msg.chatId}`;
      const last = cfg.historico?.[key] || 0;
      if (Date.now() - last < (Number(r.intervaloHoras) || 0) * 3600000) continue;

      await S.update('autoatendimento', (c) => { c.historico = c.historico || {}; c.historico[key] = Date.now(); return c; });
      await U.sleep((Number(r.atraso) || 0) * 1000);
      const ctx = await ctxOf(msg.chatId, msg.nome);
      try {
        if (r.fluxoId) await runFlow(msg.chatId, r.fluxoId, ctx, 'robo');
        else if (r.respostaId) await sendQuickReply(msg.chatId, r.respostaId, ctx, 'robo');
        if (r.resposta && r.resposta.trim()) await sendContent(msg.chatId, { texto: r.resposta }, ctx, 'robo');
      } catch (e) {
        console.warn('[Fluxo Zap] Robô falhou', e);
      }
      break; // apenas a primeira regra que casar
    }
  }

  /* ========================================================= follow-up */

  async function novoFollowUp(chat) {
    const v = await form('Follow-up automático', [
      { name: 'mensagem', label: 'Mensagem de follow-up', type: 'textarea', value: '{saudacao}, {primeiro_nome}! Conseguiu ver minha última mensagem?', required: true },
      { name: 'horas', label: 'Enviar depois de (horas)', type: 'number', value: 24, step: '0.5' },
      { name: 'cancelarSeResponder', label: 'Cancelar se o cliente responder antes', type: 'checkbox', value: true }
    ], 'Programar');
    if (!v) return;
    const ctx = await ctxOf(chat.id, chat.nome);
    const now = Date.now();
    await S.update('FollowUp', (l) => {
      l.push({ id: U.uid(), chatId: chat.id, nome: ctx.nome, mensagem: v.mensagem, horas: Number(v.horas) || 24, cancelarSeResponder: v.cancelarSeResponder,
        criadoEm: new Date(now).toISOString(), dueAt: new Date(now + (Number(v.horas) || 24) * 3600000).toISOString(), status: 'pendente' });
      return l;
    });
    toast('Follow-up programado.', 'ok');
    refresh();
  }

  reg('followup', '🔁', 'Follow-up', async (el) => {
    const list = (await S.get('FollowUp')).slice().sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    el.append(
      row(btn('+ Follow-up para conversa atual', async () => { const c = await requireChat(); if (c) novoFollowUp(c); }, 'fz-btn-primary')),
      h('small', { class: 'fz-help' }, 'Mensagem enviada automaticamente se o cliente não responder no prazo. Verificado a cada 5 minutos.'),
      list.length ? list.map((f) => h('div', { class: 'fz-card' },
        h('div', { class: 'fz-card-head' }, h('b', {}, f.nome || U.formatPhone(U.phoneFromChatId(f.chatId))), h('span', { class: 'fz-tag fz-tag-' + f.status }, f.status)),
        h('small', {}, '🕒 ', U.fmtDateTime(f.dueAt)),
        h('div', { class: 'fz-preview' }, f.mensagem),
        row(btn('Abrir conversa', () => WA.call('openChat', f.chatId), 'fz-btn-sm'),
          btn('Excluir', async () => { await S.update('FollowUp', (l) => l.filter((x) => x.id !== f.id)); refresh(); }, 'fz-btn-sm fz-btn-danger')))) : empty('Nenhum follow-up.'));
  });

  async function processarFollowUps() {
    if (state.busy.follow || !WA.isReady()) return;
    state.busy.follow = true;
    try {
      const list = await S.get('FollowUp');
      for (const f of list.filter((x) => x.status === 'pendente' && new Date(x.dueAt) <= new Date())) {
        let status = 'enviado';
        try {
          if (f.cancelarSeResponder) {
            const msgs = await WA.call('getMessages', f.chatId, 30);
            const desde = new Date(f.criadoEm).getTime() / 1000;
            if (msgs.some((m) => !m.fromMe && m.t >= desde)) status = 'cancelado';
          }
          if (status === 'enviado') await sendContent(f.chatId, { texto: f.mensagem }, await ctxOf(f.chatId, f.nome), 'follow_up');
        } catch (e) {
          status = 'erro';
        }
        await S.update('FollowUp', (l) => { const x = l.find((i) => i.id === f.id); if (x) { x.status = status; x.processadoEm = new Date().toISOString(); } return l; });
        await U.sleep(U.randInt(2000, 5000));
      }
    } finally {
      state.busy.follow = false;
    }
  }

  /* ============================================================ fluxos */

  async function escolherFluxo(chat) {
    const fluxo = await S.get('fluxo');
    if (!fluxo.workflows.length) { toast('Crie um fluxo no editor primeiro.', 'error'); bg('FLOW'); return; }
    const v = await form('Executar fluxo', [{ name: 'id', label: 'Fluxo', type: 'select', options: fluxo.workflows.map((w) => [w.id, w.nome]) }], 'Executar');
    if (!v) return;
    try { await runFlow(chat.id, v.id, await ctxOf(chat.id, chat.nome)); toast('Fluxo executado.', 'ok'); } catch (e) { toast(e.message, 'error'); }
  }

  reg('fluxos', '🧩', 'Fluxos', async (el) => {
    const fluxo = await S.get('fluxo');
    el.append(
      row(btn('Abrir editor de fluxos', () => bg('FLOW'), 'fz-btn-primary')),
      h('small', { class: 'fz-help' }, 'Fluxo é uma sequência de mensagens, mídias e pausas enviada com um clique, pelo robô ou por agendamento.'),
      fluxo.workflows.length ? fluxo.workflows.map((w) => h('div', { class: 'fz-card' },
        h('b', {}, w.nome), h('small', {}, ` · ${(w.passos || []).length} passo(s)`),
        row(btn('Executar na conversa atual', async () => {
          const c = await requireChat(); if (!c) return;
          try { await runFlow(c.id, w.id, await ctxOf(c.id, c.nome)); toast('Fluxo executado.', 'ok'); } catch (e) { toast(e.message, 'error'); }
        }, 'fz-btn-sm fz-btn-primary')))) : empty('Nenhum fluxo criado.'));
  });

  /* ============================================================ pedidos */

  const STATUS_PEDIDO = [['novo', 'Novo'], ['aguardando', 'Aguardando pagamento'], ['pago', 'Pago'], ['enviado', 'Enviado'], ['entregue', 'Entregue'], ['cancelado', 'Cancelado']];

  async function editPedido(p = null, chat = null) {
    const v = await form(p ? 'Editar pedido' : 'Novo pedido', [
      { name: 'cliente', label: 'Cliente', value: p?.cliente || (chat ? (await ctxOf(chat.id, chat.nome)).nome : ''), required: true },
      { name: 'itens', label: 'Itens', type: 'textarea', value: p?.itens, placeholder: '2x Camiseta P - R$ 59,90' },
      { name: 'valor', label: 'Valor total (R$)', type: 'number', step: '0.01', value: p?.valor ?? '' },
      { name: 'status', label: 'Status', type: 'select', value: p?.status || 'novo', options: STATUS_PEDIDO },
      { name: 'entrega', label: 'Endereço / entrega', type: 'textarea', rows: 2, value: p?.entrega },
      { name: 'obs', label: 'Observação', value: p?.obs }
    ]);
    if (!v) return;
    await S.update('encomendas', (l) => {
      if (p) Object.assign(l.find((x) => x.id === p.id), v, { atualizadoEm: new Date().toISOString() });
      else l.push({ id: U.uid(), chatId: chat?.id || '', data: new Date().toISOString(), ...v });
      return l;
    });
    refresh();
  }

  reg('pedidos', '🛒', 'Pedidos', async (el) => {
    const list = await S.get('encomendas');
    const filtro = state.pedFiltro || '';
    const itens = list.filter((p) => !filtro || p.status === filtro).sort((a, b) => b.data.localeCompare(a.data));
    const total = itens.reduce((s, p) => s + (Number(p.valor) || 0), 0);
    el.append(
      row(btn('+ Pedido da conversa atual', async () => { const c = await requireChat(); if (c) editPedido(null, c); }, 'fz-btn-primary')),
      h('div', { class: 'fz-chips' }, [['', 'Todos'], ...STATUS_PEDIDO].map(([k, l]) => h('button', { class: 'fz-chip' + (filtro === k ? ' active' : ''), onclick: () => { state.pedFiltro = k; refresh(); } }, l))),
      h('div', { class: 'fz-help' }, `${itens.length} pedido(s) · ${U.money(total)}`),
      itens.length ? itens.map((p) => h('div', { class: 'fz-card' },
        h('div', { class: 'fz-card-head' }, h('b', {}, p.cliente), h('span', { class: 'fz-tag fz-tag-ghost' }, STATUS_PEDIDO.find((s) => s[0] === p.status)?.[1] || p.status)),
        h('small', {}, U.fmtDateTime(p.data), ' · ', U.money(p.valor)),
        p.itens ? h('div', { class: 'fz-preview' }, p.itens) : null,
        row(
          p.chatId ? btn('Enviar resumo', async () => {
            const txt = `*Resumo do pedido*\n${p.itens || ''}\n\n*Total:* ${U.money(p.valor)}\n*Status:* ${STATUS_PEDIDO.find((s) => s[0] === p.status)?.[1]}${p.entrega ? `\n*Entrega:* ${p.entrega}` : ''}`;
            try { await sendContent(p.chatId, { texto: txt }, {}, 'pedido'); toast('Resumo enviado.', 'ok'); } catch (e) { toast(e.message, 'error'); }
          }, 'fz-btn-sm') : null,
          p.chatId ? btn('Conversa', () => WA.call('openChat', p.chatId), 'fz-btn-sm') : null,
          btn('Editar', () => editPedido(p), 'fz-btn-sm'),
          btn('Excluir', async () => { if (await confirm('Excluir pedido?')) { await S.update('encomendas', (l) => l.filter((x) => x.id !== p.id)); refresh(); } }, 'fz-btn-sm fz-btn-danger')))) : empty('Nenhum pedido.'));
  });

  /* ============================================================= status */

  reg('status', '📸', 'Status agendado', async (el) => {
    const list = (await S.get('status')).slice().sort((a, b) => b.quando.localeCompare(a.quando));
    el.append(
      row(btn('+ Novo status', async () => {
        const v = await form('Status do WhatsApp', [
          { name: 'texto', label: 'Texto (ou legenda da imagem)', type: 'textarea', required: true },
          { name: 'cor', label: 'Cor de fundo (status de texto)', type: 'color', value: BRAND.primary },
          { name: 'imagem', label: 'Imagem (opcional)', type: 'file', accept: 'image/*' },
          { name: 'quando', label: 'Publicar em', type: 'datetime', value: U.toLocalInput(new Date()) },
          { name: 'recorrencia', label: 'Repetir', type: 'select', options: [['nenhuma', 'Não repetir'], ['diaria', 'Todo dia'], ['semanal', 'Toda semana']] }
        ], 'Agendar');
        if (!v) return;
        const [img] = await filesToMedia(v.imagem);
        await S.update('status', (l) => { l.push({ id: U.uid(), texto: v.texto, cor: v.cor, imagem: img || null, quando: new Date(v.quando).toISOString(), recorrencia: v.recorrencia, status: 'pendente' }); return l; });
        processarStatus();
        refresh();
      }, 'fz-btn-primary')),
      list.length ? list.map((s) => h('div', { class: 'fz-card' },
        h('div', { class: 'fz-card-head' }, h('span', { class: 'fz-dot', style: { background: s.cor } }), h('b', {}, U.fmtDateTime(s.quando)), h('span', { class: 'fz-tag fz-tag-' + s.status }, s.status)),
        h('div', { class: 'fz-preview' }, (s.imagem ? '🖼️ ' : '') + s.texto),
        s.erro ? h('small', { class: 'fz-err' }, s.erro) : null,
        row(btn('Excluir', async () => { await S.update('status', (l) => l.filter((x) => x.id !== s.id)); refresh(); }, 'fz-btn-sm fz-btn-danger')))) : empty('Nenhum status agendado.'));
  });

  async function processarStatus() {
    if (state.busy.status || !WA.isReady()) return;
    state.busy.status = true;
    try {
      const list = await S.get('status');
      for (const s of list.filter((x) => x.status === 'pendente' && new Date(x.quando) <= new Date())) {
        const patch = {};
        try {
          if (s.imagem) await WA.call('sendImageStatus', s.imagem.dataUrl, s.texto);
          else await WA.call('sendTextStatus', s.texto, s.cor);
          await logRel('status', '', true);
          let n = U.nextOccurrence(s.quando, s.recorrencia);
          while (n && new Date(n) <= new Date()) n = U.nextOccurrence(n, s.recorrencia);
          Object.assign(patch, n ? { quando: n } : { status: 'enviado' });
        } catch (e) {
          Object.assign(patch, { status: 'erro', erro: e.message });
        }
        await S.update('status', (l) => { const x = l.find((i) => i.id === s.id); if (x) Object.assign(x, patch); return l; });
      }
    } finally {
      state.busy.status = false;
    }
  }

  /* ===================================================== abas e fixados */

  reg('abas', '📁', 'Abas e fixados', async (el) => {
    const { pinChat, userTabs } = await S.getMany(['pinChat', 'userTabs']);
    const chatRow = (c, onRemove) => h('div', { class: 'fz-card fz-click fz-card-row', onclick: () => WA.call('openChat', c.id) },
      h('span', {}, c.nome || U.formatPhone(U.phoneFromChatId(c.id))),
      btn('×', (e) => { e.stopPropagation(); onRemove(); }, 'fz-x'));
    el.append(
      section(`📌 Fixados (${pinChat.length})`, pinChat.length ? pinChat.map((c) => chatRow(c, async () => { await S.update('pinChat', (l) => l.filter((x) => x.id !== c.id)); refresh(); })) : empty('Use "Fixar conversa" no painel da conversa.')),
      row(btn('+ Nova aba', async () => {
        const v = await form('Nova aba', [{ name: 'nome', label: 'Nome', required: true }]);
        if (v) { await S.update('userTabs', (l) => { l.push({ id: U.uid(), nome: v.nome, chats: [] }); return l; }); refresh(); }
      }, 'fz-btn-primary'), btn('+ Conversa atual em uma aba', async () => { const c = await requireChat(); if (c) { await addToTab(c); refresh(); } })),
      userTabs.map((t) => h('details', { class: 'fz-stage', open: true },
        h('summary', {}, `📁 ${t.nome} (${t.chats.length})`,
          btn('renomear', async (e) => { e.preventDefault(); const v = await form('Renomear aba', [{ name: 'nome', label: 'Nome', value: t.nome }]); if (v) { await S.update('userTabs', (l) => { l.find((x) => x.id === t.id).nome = v.nome; return l; }); refresh(); } }, 'fz-btn-sm fz-link'),
          btn('excluir', async (e) => { e.preventDefault(); if (await confirm(`Excluir a aba ${t.nome}?`)) { await S.update('userTabs', (l) => l.filter((x) => x.id !== t.id)); refresh(); } }, 'fz-btn-sm fz-link')),
        t.chats.map((c) => chatRow(c, async () => { await S.update('userTabs', (l) => { const x = l.find((i) => i.id === t.id); x.chats = x.chats.filter((i) => i.id !== c.id); return l; }); refresh(); })))));
  });

  /* ============================================================ atalhos */

  reg('atalhos', '⌨️', 'Atalhos de texto', async (el) => {
    const cfg = await S.get('replacementStorage');
    el.append(
      h('label', { class: 'fz-switch' }, h('input', { type: 'checkbox', checked: cfg.isEnabled, onchange: async (e) => { await S.update('replacementStorage', (c) => { c.isEnabled = e.target.checked; return c; }); } }), ' Atalhos ligados'),
      h('small', { class: 'fz-help' }, 'Digite o atalho seguido de espaço na caixa de mensagem e ele vira o texto completo. Respostas rápidas com atalho também funcionam.'),
      row(btn('+ Novo atalho', async () => {
        const v = await form('Novo atalho', [
          { name: 'atalho', label: 'Atalho', placeholder: '/pix', required: true },
          { name: 'texto', label: 'Texto', type: 'textarea', required: true }
        ]);
        if (v) { await S.update('replacementStorage', (c) => { c.items.push({ id: U.uid(), atalho: v.atalho.trim(), texto: v.texto }); return c; }); refresh(); }
      }, 'fz-btn-primary')),
      cfg.items.length ? cfg.items.map((i) => h('div', { class: 'fz-card' },
        h('div', { class: 'fz-card-head' }, h('span', { class: 'fz-tag' }, i.atalho)),
        h('div', { class: 'fz-preview' }, i.texto),
        row(btn('Excluir', async () => { await S.update('replacementStorage', (c) => { c.items = c.items.filter((x) => x.id !== i.id); return c; }); refresh(); }, 'fz-btn-sm fz-btn-danger')))) : empty('Nenhum atalho.'));
  });

  let atalhos = [];
  async function loadAtalhos() {
    const [cfg, resp] = await Promise.all([S.get('replacementStorage'), S.get('respostasRapidas')]);
    atalhos = cfg.isEnabled
      ? [...cfg.items, ...resp.filter((r) => r.atalho && r.texto).map((r) => ({ atalho: r.atalho, texto: r.texto }))]
      : [];
  }
  S.onChange(['replacementStorage', 'respostasRapidas'], loadAtalhos);
  loadAtalhos();

  document.addEventListener('input', async (e) => {
    if (!atalhos.length) return;
    const box = e.target?.closest?.('footer [contenteditable="true"]');
    if (!box) return;
    const text = box.innerText.replace(/\n$/, '');
    const m = text.match(/(^|\s)(\S+)[  ]$/);
    if (!m) return;
    const item = atalhos.find((a) => a.atalho === m[2]);
    if (!item) return;
    const chat = state.chat || (await currentChat());
    const ctx = chat ? await ctxOf(chat.id, chat.nome) : {};
    const before = text.slice(0, text.length - m[2].length - 1);
    await WA.call('setInputText', before + U.applyVars(item.texto, ctx));
  }, true);

  /* ========================================================== relatório */

  reg('relatorio', '📈', 'Relatório', async (el) => {
    const { relatorio: rel, crm, encomendas } = await S.getMany(['relatorio', 'crm', 'encomendas']);
    const hoje = new Date().toISOString().slice(0, 10);
    const sete = Date.now() - 7 * 86400000;
    const tipos = {};
    for (const r of rel) {
      const t = (tipos[r.tipo] = tipos[r.tipo] || { hoje: 0, semana: 0, total: 0, erros: 0 });
      t.total++;
      if (!r.ok) t.erros++;
      if (r.data.startsWith(hoje)) t.hoje++;
      if (new Date(r.data).getTime() >= sete) t.semana++;
    }
    const nomes = { manual: 'Envio manual', resposta_rapida: 'Respostas rápidas', agendamento: 'Agendamentos', envio_massa: 'Envio em massa', robo: 'Robô', follow_up: 'Follow-up', fluxo: 'Fluxos', status: 'Status', pedido: 'Pedidos' };
    const ganho = crm.cards.filter((c) => c.etapaId === 'ganho');
    el.append(
      h('div', { class: 'fz-kpis' },
        h('div', {}, h('b', {}, crm.cards.length), h('small', {}, 'leads no funil')),
        h('div', {}, h('b', {}, U.money(ganho.reduce((s, c) => s + (Number(c.valor) || 0), 0))), h('small', {}, 'fechado')),
        h('div', {}, h('b', {}, encomendas.length), h('small', {}, 'pedidos'))),
      h('table', { class: 'fz-table' },
        h('tr', {}, h('th', {}, 'Mensagens'), h('th', {}, 'Hoje'), h('th', {}, '7 dias'), h('th', {}, 'Total'), h('th', {}, 'Erros')),
        Object.entries(tipos).map(([k, t]) => h('tr', {}, h('td', {}, nomes[k] || k), h('td', {}, t.hoje), h('td', {}, t.semana), h('td', {}, t.total), h('td', {}, t.erros)))),
      Object.keys(tipos).length ? null : empty('Ainda não há envios registrados.'),
      row(btn('Zerar relatório', async () => { if (await confirm('Apagar o histórico do relatório?')) { await S.set('relatorio', []); refresh(); } }, 'fz-btn-sm')));
  });

  reg('painel', '⚙️', 'Configurações', async (el) => {
    const at = await S.get('atendimento');
    el.append(
      row(btn('Abrir painel de configurações', () => bg('PAINEL'), 'fz-btn-primary')),
      h('small', { class: 'fz-help' }, 'IA (Gemini, ChatGPT, Groq), webhooks, backup automático, importar/exportar dados e perfil.'),
      h('label', { class: 'fz-switch' }, h('input', { type: 'checkbox', checked: !!at.privacidade, onchange: async (e) => { await S.update('atendimento', (a) => { a.privacidade = e.target.checked; return a; }); } }), ' Modo privacidade (desfoca conversas)'),
      row(btn('Baixar backup agora', () => bg('BACKUP_NOW').then(() => toast('Backup baixado.', 'ok'), (e) => toast(e.message, 'error')))));
  });

  /* ======================================================= barra lateral */

  strip.append(h('div', { class: 'fz-logo', title: BRAND.name }, 'FZ'));
  for (const m of MODULES) {
    strip.append(h('button', { class: 'fz-ico', 'data-id': m.id, title: m.title, onclick: () => openPanel(m.id) }, m.icon,
      m.id === 'lembretes' ? h('span', { class: 'fz-badge', id: 'fz-badge-lembretes' }) : null));
  }

  function setBadge(n) {
    const b = root.getElementById('fz-badge-lembretes');
    if (b) { b.textContent = n ? String(n) : ''; b.style.display = n ? '' : 'none'; }
  }

  async function applyPrivacy() {
    const at = await S.get('atendimento');
    document.documentElement.classList.toggle('fz-privacy', !!at.privacidade);
  }
  S.onChange(['atendimento'], applyPrivacy);
  applyPrivacy();

  // Atualiza o painel aberto quando os dados mudam em outra tela (ex.: CRM completo)
  S.onChange(['crm', 'fluxo', 'notes', 'agendamentos', 'notifications', 'encomendas', 'FollowUp', 'status'], () => {
    const ae = root.activeElement;
    if (state.panel && !root.querySelector('.fz-overlay') && !(ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName))) refresh();
  });

  /* ======================================== mensagens do service worker */

  chrome.runtime.onMessage.addListener((msg) => {
    switch (msg.action) {
      case 'Update_Agendamento': processarAgendamentos(); break;
      case 'Update_Status': processarStatus(); break;
      case 'dispatch_timing_follow': processarFollowUps(); break;
      case 'open_chat': WA.call('openChat', msg.dados.chatId); break;
      case 'Update_Notificação': {
        setBadge(msg.dados.tam);
        for (const n of msg.dados.dispart || []) {
          beep();
          toast(`🔔 ${n.titulo}${n.nome ? ' - ' + n.nome : ''}`, 'warn', {
            sticky: true,
            action: n.chatId ? { label: 'Abrir conversa', fn: () => { WA.call('openChat', n.chatId); bg('READ_NOTIFICATION', { id: n.id }); } } : null
          });
        }
        if (state.panel === 'lembretes') refresh();
        break;
      }
    }
  });

  /* ================================================ eventos do WhatsApp */

  let temWebhook = false;
  const loadWebhooks = async () => { temWebhook = (await S.get('webhook')).some((w) => w.ativo && w.url); };
  S.onChange(['webhook'], loadWebhooks);
  loadWebhooks();

  WA.on('active_chat', (chat) => {
    state.chat = chat;
    if (state.panel === 'contato') refresh();
  });

  WA.on('new_message', (msg) => {
    if (!msg || !msg.chatId || msg.chatId.endsWith('@broadcast') || msg.chatId.endsWith('@newsletter')) return;
    if (temWebhook) bg('WEBHOOK', { evento: msg.fromMe ? 'mensagem_enviada' : 'mensagem_recebida', payload: msg }).catch(() => {});
    if (!msg.fromMe) roboOnMessage(msg);
  });

  if (await WA.waitReady()) {
    toast(`${BRAND.name} pronto!`, 'ok', { ms: 2500 });
    bg('CHECK_NOTIFICATIONS').catch(() => {});
    processarAgendamentos();
    processarStatus();
    processarFollowUps();
  } else {
    toast(`${BRAND.name}: o WhatsApp demorou para carregar. Recarregue a página.`, 'error', { sticky: true });
  }
})();
