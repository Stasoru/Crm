/* CRM completo (kanban) - mesma base de dados usada na barra lateral do WhatsApp */
(async function () {
  const { h, form, confirm, toast, modal } = UI;
  const U = FZ_UTIL;
  const S = FZ_STORE;
  const $ = (s) => document.querySelector(s);

  await S.ensureDefaults();
  let crm = await S.get('crm');
  let busca = '';

  // Aplica a alteração sobre a versão mais recente salva (evita apagar mudanças feitas no WhatsApp)
  const mutate = async (fn) => { crm = await S.update('crm', fn); render(); };

  function abrirConversa(chatId) {
    chrome.runtime.sendMessage({ message: 'OPEN_CHAT', chatId });
  }

  let conversas = (await S.get('conversas')).lista || [];
  let atualizado = (await S.get('conversas')).atualizadoEm;
  let mostrarGrupos = false;
  try { mostrarGrupos = localStorage.getItem('crm-grupos') === '1'; } catch { /* sem localStorage */ }
  let limiteInbox = 150;

  function filtrar(c) {
    if (!busca) return true;
    const q = busca.toLowerCase();
    return (c.nome || '').toLowerCase().includes(q) || (c.telefone || '').includes(q) ||
      (c.etiquetas || []).some((t) => t.toLowerCase().includes(q)) || (c.ultima || '').toLowerCase().includes(q);
  }

  // Liga um lead à conversa do WhatsApp (pelo id ou pelo telefone)
  function indexConversas() {
    const porId = new Map(), porTel = new Map();
    for (const c of conversas) { porId.set(c.id, c); if (c.telefone) porTel.set(c.telefone, c); }
    return { porId, porTel, de: (card) => porId.get(card.chatId) || (card.telefone && porTel.get(card.telefone)) || null };
  }

  const horaMsg = (t) => {
    if (!t) return '';
    const d = new Date(t * 1000);
    const hoje = new Date().toDateString() === d.toDateString();
    return hoje ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  function ultimaLinha(conv) {
    if (!conv) return null;
    return h('div', { class: 'ultima' },
      h('span', { class: 'quando' }, horaMsg(conv.t)),
      conv.naoLidas ? h('span', { class: 'naolidas' }, conv.naoLidas) : null,
      h('span', { class: 'txt' }, (conv.fromMe ? 'Você: ' : '') + (conv.ultima || '')));
  }

  // Solta um item (lead ou conversa) numa etapa; etapaId vazio = volta para "Conversas"
  async function soltar(data, etapaId) {
    const [tipo, id] = [data.slice(0, data.indexOf(':')), data.slice(data.indexOf(':') + 1)];
    const now = new Date().toISOString();
    if (tipo === 'card') {
      await mutate((d) => {
        if (!etapaId) { d.cards = d.cards.filter((x) => x.id !== id); return d; }
        const c = d.cards.find((x) => x.id === id);
        if (c && c.etapaId !== etapaId) { c.etapaId = etapaId; c.atualizadoEm = now; }
        return d;
      });
    } else if (tipo === 'chat' && etapaId) {
      const conv = conversas.find((c) => c.id === id);
      if (!conv) return;
      await mutate((d) => {
        if (!d.cards.some((x) => x.chatId === conv.id)) {
          d.cards.push({ id: U.uid(), chatId: conv.id, nome: conv.nome, telefone: conv.telefone, etapaId, valor: '', etiquetas: [], criadoEm: now, atualizadoEm: now });
        }
        return d;
      });
    }
  }

  function dropZone(etapaId) {
    const body = h('div', {
      class: 'col-body',
      ondragover: (ev) => { ev.preventDefault(); body.classList.add('over'); },
      ondragleave: () => body.classList.remove('over'),
      ondrop: async (ev) => { ev.preventDefault(); body.classList.remove('over'); await soltar(ev.dataTransfer.getData('text/plain'), etapaId); }
    });
    return body;
  }

  function render() {
    const board = $('#board');
    board.replaceChildren();
    const idx = indexConversas();
    const ganhos = crm.cards.filter((c) => c.etapaId === 'ganho');
    const totalAberto = crm.cards.filter((c) => !['ganho', 'perdido'].includes(c.etapaId)).reduce((s, c) => s + (Number(c.valor) || 0), 0);
    const conv = crm.cards.length ? Math.round((100 * ganhos.length) / crm.cards.length) : 0;
    $('#resumo').replaceChildren(
      h('div', {}, h('b', {}, crm.cards.length), h('span', { class: 'muted' }, 'leads no funil')),
      h('div', {}, h('b', {}, U.money(totalAberto)), h('span', { class: 'muted' }, 'em negociação')),
      h('div', {}, h('b', {}, U.money(ganhos.reduce((s, c) => s + (Number(c.valor) || 0), 0))), h('span', { class: 'muted' }, 'fechado')),
      h('div', {}, h('b', {}, conv + '%'), h('span', { class: 'muted' }, 'conversão')));
    $('#aviso').replaceChildren(atualizado
      ? h('span', { class: 'muted' }, `Conversas do WhatsApp atualizadas ${U.ago(atualizado)} · ${conversas.length} conversa(s). Arraste qualquer cartão para a etapa desejada.`)
      : h('span', {}, 'Abra o WhatsApp Web com a extensão ligada para as conversas aparecerem aqui automaticamente.'));

    // Coluna 1: todas as conversas que ainda não estão no funil, da mais recente para a mais antiga
    const noFunilId = new Set(crm.cards.map((c) => c.chatId));
    const noFunilTel = new Set(crm.cards.map((c) => c.telefone).filter(Boolean));
    const inbox = conversas.filter((c) => (mostrarGrupos || !c.isGroup) && !noFunilId.has(c.id) && !(c.telefone && noFunilTel.has(c.telefone)) && filtrar(c));
    const inboxBody = dropZone('');
    inboxBody.append(...inbox.slice(0, limiteInbox).map((c) => h('div', {
      class: 'card conversa' + (c.naoLidas ? ' nova' : ''), draggable: 'true',
      ondragstart: (ev) => ev.dataTransfer.setData('text/plain', 'chat:' + c.id)
    },
      h('div', { class: 'linha' }, h('div', { class: 'nome' }, c.isGroup ? '👥 ' : '', c.nome || U.formatPhone(c.telefone) || 'Sem nome')),
      c.telefone && c.nome ? h('div', { class: 'tel' }, U.formatPhone(c.telefone)) : null,
      ultimaLinha(c),
      h('div', { class: 'acoes' },
        h('button', { class: 'btn sm primary', onclick: () => abrirConversa(c.id) }, 'WhatsApp'),
        h('select', { class: 'mover', onchange: async (e) => { if (e.target.value) await soltar('chat:' + c.id, e.target.value); } },
          h('option', { value: '' }, 'Mover para…'), crm.etapas.map((e) => h('option', { value: e.id }, e.nome)))))));
    if (inbox.length > limiteInbox) inboxBody.append(h('button', { class: 'btn sm', style: { width: '100%' }, onclick: () => { limiteInbox += 150; render(); } }, `Mostrar mais (${inbox.length - limiteInbox})`));
    if (!inbox.length) inboxBody.append(h('p', { class: 'muted', style: { textAlign: 'center' } }, conversas.length ? 'Todas as conversas já estão no funil.' : 'Nenhuma conversa sincronizada ainda.'));
    board.append(h('section', { class: 'col inbox' },
      h('div', { class: 'col-head', style: { borderColor: 'var(--primary)' } }, h('b', {}, 'Conversas'), h('small', {}, `${inbox.length} fora do funil · mais recentes primeiro`)),
      inboxBody));

    // Etapas do funil
    for (const e of crm.etapas) {
      const cards = crm.cards.filter((c) => c.etapaId === e.id && filtrar({ ...c, ultima: idx.de(c)?.ultima }))
        .map((c) => ({ c, conv: idx.de(c) }))
        .sort((a, b) => (b.conv?.t || new Date(b.c.atualizadoEm || 0).getTime() / 1000) - (a.conv?.t || new Date(a.c.atualizadoEm || 0).getTime() / 1000));
      const total = cards.reduce((s, x) => s + (Number(x.c.valor) || 0), 0);
      const body = dropZone(e.id);
      body.append(...cards.map(({ c, conv: cv }) => h('div', {
        class: 'card' + (cv?.naoLidas ? ' nova' : ''), draggable: 'true',
        ondragstart: (ev) => ev.dataTransfer.setData('text/plain', 'card:' + c.id)
      },
        h('div', { class: 'nome' }, c.nome || cv?.nome || 'Sem nome'),
        h('div', { class: 'tel' }, U.formatPhone(c.telefone)),
        ultimaLinha(cv),
        (() => { const dias = U.daysSince(c.atualizadoEm || c.criadoEm); return h('div', { class: 'dias' + (dias >= 3 && !['ganho', 'perdido'].includes(c.etapaId) ? ' parado' : '') }, dias ? `${dias} dia(s) nesta etapa` : 'movido hoje'); })(),
        c.valor ? h('div', { class: 'valor' }, U.money(c.valor)) : null,
        (c.etiquetas || []).length ? h('div', { class: 'tags' }, c.etiquetas.map((t) => h('span', {}, t))) : null,
        c.observacao ? h('div', { class: 'muted', style: { fontSize: '12px', marginTop: '4px' } }, c.observacao) : null,
        h('div', { class: 'acoes' },
          c.chatId ? h('button', { class: 'btn sm primary', onclick: () => abrirConversa(c.chatId) }, 'WhatsApp') : null,
          h('button', { class: 'btn sm', onclick: () => editCard(c) }, 'Editar'),
          h('button', { class: 'btn sm danger', title: 'Tirar do funil (volta para Conversas)', onclick: async () => {
            if (!(await confirm(`Tirar ${c.nome || 'lead'} do funil? A conversa volta para a coluna Conversas.`))) return;
            await mutate((d) => { d.cards = d.cards.filter((x) => x.id !== c.id); return d; });
          } }, 'Remover')))));
      if (!cards.length) body.append(h('p', { class: 'muted vazio' }, 'Arraste conversas para cá'));

      board.append(h('section', { class: 'col' },
        h('div', { class: 'col-head', style: { borderColor: e.cor } }, h('b', {}, e.nome), h('small', {}, `${cards.length} lead(s) · ${U.money(total)}`)),
        body));
    }
  }

  async function editCard(c = null) {
    const v = await form(c ? 'Editar lead' : 'Novo lead', [
      { name: 'nome', label: 'Nome', value: c?.nome, required: true },
      { name: 'telefone', label: 'WhatsApp (DDI + DDD + número)', value: c?.telefone, placeholder: '5511999999999', required: true },
      { name: 'etapaId', label: 'Etapa', type: 'select', value: c?.etapaId || crm.etapas[0]?.id, options: crm.etapas.map((e) => [e.id, e.nome]) },
      { name: 'valor', label: 'Valor (R$)', type: 'number', step: '0.01', value: c?.valor ?? '' },
      { name: 'etiquetas', label: 'Etiquetas (separe por vírgula)', value: (c?.etiquetas || []).join(', ') },
      { name: 'observacao', label: 'Observação', type: 'textarea', rows: 3, value: c?.observacao }
    ]);
    if (!v) return;
    const tel = U.onlyDigits(v.telefone);
    const data = { ...v, telefone: tel, etiquetas: v.etiquetas.split(',').map((s) => s.trim()).filter(Boolean), atualizadoEm: new Date().toISOString() };
    await mutate((d) => {
      const x = c && d.cards.find((i) => i.id === c.id);
      if (x) Object.assign(x, data, { chatId: x.chatId || U.toChatId(tel) });
      else d.cards.push({ id: U.uid(), chatId: U.toChatId(tel), criadoEm: new Date().toISOString(), ...data });
      return d;
    });
  }

  async function editEtapas() {
    const etapas = structuredClone(crm.etapas);
    const box = h('div', {});
    const draw = () => box.replaceChildren(
      ...etapas.map((e, i) => h('div', { class: 'fz-row' },
        h('input', { type: 'color', value: e.cor, oninput: (ev) => { e.cor = ev.target.value; } }),
        h('input', { class: 'fz-input', style: { flex: 1, width: 'auto' }, value: e.nome, oninput: (ev) => { e.nome = ev.target.value; } }),
        h('button', { class: 'fz-btn fz-btn-sm', disabled: i === 0, onclick: () => { [etapas[i - 1], etapas[i]] = [etapas[i], etapas[i - 1]]; draw(); } }, '↑'),
        h('button', { class: 'fz-btn fz-btn-sm fz-btn-danger', onclick: () => {
          if (crm.cards.some((c) => c.etapaId === e.id)) return toast('Mova os leads desta etapa antes de excluir.', 'error');
          etapas.splice(i, 1); draw();
        } }, '×'))),
      h('button', { class: 'fz-btn', onclick: () => { etapas.push({ id: U.uid(), nome: 'Nova etapa', cor: '#64748b' }); draw(); } }, '+ Etapa'));
    draw();
    const ok = await modal('Etapas do funil', box, [{ label: 'Cancelar', value: () => false }, { label: 'Salvar', primary: true, value: () => true }]);
    if (ok) await mutate((d) => { d.etapas = etapas; return d; });
  }

  function exportCsv() {
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const lines = [['Nome', 'Telefone', 'Etapa', 'Valor', 'Etiquetas', 'Observação', 'Criado em'].join(';')];
    for (const c of crm.cards) {
      lines.push([c.nome, c.telefone, crm.etapas.find((e) => e.id === c.etapaId)?.nome, c.valor, (c.etiquetas || []).join(', '), c.observacao, c.criadoEm].map(esc).join(';'));
    }
    const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' })), download: 'crm-beco-wppseller.csv' });
    a.click();
  }

  $('#busca').addEventListener('input', (e) => { busca = e.target.value; render(); });
  $('#novoCard').onclick = () => editCard();
  $('#etapas').onclick = editEtapas;
  $('#csv').onclick = exportCsv;

  $('#grupos').checked = mostrarGrupos;
  $('#grupos').onchange = (e) => { mostrarGrupos = e.target.checked; try { localStorage.setItem('crm-grupos', mostrarGrupos ? '1' : '0'); } catch { /* ignora */ } render(); };
  $('#sync').onclick = async () => {
    const r = await chrome.runtime.sendMessage({ message: 'SYNC_CHATS' });
    if (r?.ok && r.data) toast('Buscando conversas no WhatsApp…', 'ok');
    else toast('Abra o WhatsApp Web (web.whatsapp.com) para buscar as conversas.', 'error');
  };

  // Não redesenha no meio de um arraste
  let arrastando = false;
  document.addEventListener('dragstart', () => { arrastando = true; });
  document.addEventListener('dragend', () => { arrastando = false; });
  S.onChange(['crm', 'conversas'], async (changes) => {
    if (changes.crm) crm = await S.get('crm');
    if (changes.conversas) { const c = await S.get('conversas'); conversas = c.lista || []; atualizado = c.atualizadoEm; }
    if (!arrastando) render();
  });
  render();
  // Pede uma sincronização ao abrir o CRM e atualiza o "há X min" a cada minuto
  chrome.runtime.sendMessage({ message: 'SYNC_CHATS' }).catch(() => {});
  setInterval(() => { if (!arrastando) render(); }, 60000);
})();
